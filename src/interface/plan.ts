import type { SQL, SqlNode, PhysicalOp, AggSpec, SortKey, ProjectorSpec, Row } from '../shared/types'
import type { SelectAst, ProjItem } from './types'
import { colNameOf, compileExpr, compilePredicate, compileNode, EvalCtx } from './compile'
import { tableNameOf } from '../shared/helper'
const nodeOf = (expr: SQL | SqlNode): SqlNode => ((expr as SQL).kind === 'sql' ? (expr as SQL).node : (expr as SqlNode))
const argNode = (n: SqlNode | undefined): SqlNode | undefined => (n && 'args' in n && n.args[0] ? nodeOf(n.args[0]) : undefined)
const aggSig = (n: SqlNode | undefined): string | undefined => {
        if (!n || n.type !== 'aggregate') return undefined
        const a = argNode(n)
        return `${n.name}:${n.distinct ? 'd' : ''}:${a?.type === 'column' ? a.name : ''}`
}
const aliasOf = (projection: ProjItem[] | undefined, match: (n: SqlNode) => boolean): string | undefined => {
        for (const p of projection ?? []) if (match(nodeOf(p.expr))) return p.alias
        return undefined
}
const aggsOf = (projection?: ProjItem[]): AggSpec[] => {
        const out: AggSpec[] = []
        for (const p of projection ?? []) {
                const n = nodeOf(p.expr)
                if (n.type !== 'aggregate') continue
                const a = argNode(n)
                out.push({ name: p.alias, kind: n.name, field: a?.type === 'column' ? a.name : '', distinct: !!n.distinct })
        }
        return out
}
const rewriteHaving = (node: SQL | SqlNode, projection?: ProjItem[]): SqlNode => {
        const n = nodeOf(node)
        if (n.type === 'aggregate') {
                const alias = aliasOf(projection, (p) => aggSig(p) === aggSig(n))
                if (!alias) return { type: 'literal', value: undefined }
                return { type: 'func', name: 'toFloat', args: [{ kind: 'sql', node: { type: 'column', name: alias, dataType: 'f32' } } as SQL] }
        }
        if (n.type === 'binop' || n.type === 'unop' || n.type === 'func')
                return { ...n, args: (n.args ?? []).map((a) => ({ kind: 'sql', node: rewriteHaving(a, projection) }) as SQL) }
        return n
}
const isObjectSpec = (e: unknown): e is Record<string, SQL> => !!e && typeof e === 'object' && !('kind' in (e as object)) && !('type' in (e as object))
const relabel = (node: SqlNode, from: string, to: string): SqlNode => {
        if (node.type === 'column') return node.tableName === from ? { ...node, tableName: to } : node
        if (node.type === 'binop' || node.type === 'unop' || node.type === 'func')
                return { ...node, args: (node.args ?? []).map((a) => ({ kind: 'sql', node: relabel(nodeOf(a), from, to) }) as SQL) }
        return node
}
const selfJoinOn = (on: SQL, table: string, rightName: string): SQL => {
        const n = nodeOf(on)
        if (n.type !== 'binop' || n.args.length !== 2) return on
        const right = relabel(nodeOf(n.args[1]), table, rightName)
        return { kind: 'sql', node: { ...n, args: [n.args[0], { kind: 'sql', node: right } as SQL] } } as SQL
}
const planSource = (ast: SelectAst, ctx: EvalCtx): { source: PhysicalOp; ctx: EvalCtx; isJoin: boolean } => {
        if (!ast.joins?.length) return { source: { op: 'SeqScan', table: tableNameOf(ast.table) }, ctx, isJoin: false }
        const jctx: EvalCtx = { ...ctx, joinRow: true }
        const base = tableNameOf(ast.table)
        const seen = new Set([base])
        let source: PhysicalOp = { op: 'NamedScan', table: base, name: base }
        for (const j of ast.joins) {
                const table = tableNameOf(j.table)
                const name = seen.has(table) ? `${table}#${seen.size}` : table
                const on = seen.has(table) ? selfJoinOn(j.on, table, name) : j.on
                seen.add(name)
                source = { op: 'NestedLoopJoin', left: source, right: { op: 'NamedScan', table, name }, rightName: name, predicate: compilePredicate(on, jctx), kind: j.kind }
        }
        return { source, ctx: jctx, isJoin: true }
}
const projector = (p: ProjItem, ctx: EvalCtx): ProjectorSpec => {
        if (!isObjectSpec(p.expr)) return { alias: p.alias, eval: compileExpr(p.expr as SQL, ctx) }
        const spec = p.expr
        const fields = Object.keys(spec).map((k) => ({ key: k, eval: compileNode(spec[k], ctx), table: ((n) => (n.type === 'column' ? n.tableName : undefined))(nodeOf(spec[k])) }))
        const tables = [...new Set(fields.map((f) => f.table).filter((t): t is string => !!t))]
        return {
                alias: p.alias,
                eval: (row) => {
                        if (tables.length > 0 && tables.every((t) => (row as Record<string, Row | null>)[t] === null)) return null
                        const out: Row = {}
                        for (const f of fields) out[f.key] = f.eval(row)
                        return out
                },
        }
}
const projection = (child: PhysicalOp, projectors: ProjectorSpec[]): PhysicalOp => ({ op: 'Projection', child, fields: projectors.map((p) => p.alias), projectors })
const planAggregate = (child: PhysicalOp, ast: SelectAst, aggsIn: AggSpec[], ctx: EvalCtx, isJoin: boolean): PhysicalOp => {
        const groupBy = (ast.groupBy ?? []).map(colNameOf)
        let plan = child
        let aggs = aggsIn
        if (isJoin) {
                const pre: ProjectorSpec[] = (ast.groupBy ?? []).map((g, i) => ({ alias: groupBy[i], eval: compileNode(g as SQL, ctx) }))
                const aggNodes = (ast.projection ?? []).map((p) => nodeOf(p.expr)).filter((n): n is Extract<SqlNode, { type: 'aggregate' }> => n.type === 'aggregate')
                aggs.forEach((a, i) => pre.push({ alias: a.field || a.name, eval: aggNodes[i].args[0] ? compileNode(aggNodes[i].args[0], ctx) : () => 1 }))
                plan = projection(plan, pre)
                aggs = aggs.map((a) => ({ ...a, field: a.field || a.name }))
        }
        plan = { op: 'Aggregate', child: plan, groupBy, aggs }
        const post: ProjectorSpec[] = (ast.projection ?? []).map((p) => {
                const field = nodeOf(p.expr).type === 'column' ? colNameOf(p.expr) : p.alias
                return { alias: p.alias, eval: (row) => row[field] }
        })
        return post.length > 0 ? projection(plan, post) : plan
}
const sortKeys = (orderBy: unknown[], resolve: (n: SqlNode) => string | undefined, ctx: EvalCtx): SortKey[] =>
        orderBy.map((o) => {
                const n = nodeOf(o as SQL | SqlNode)
                const [col, dir] = n.type === 'order' ? [n.col, n.dir] : [o as SQL, 'asc' as const]
                const field = resolve(nodeOf(col))
                return field !== undefined ? { field, dir } : { field: '', dir, eval: compileExpr(col, ctx) }
        })
export const planSelect = (ast: SelectAst, baseCtx: EvalCtx): { plan: PhysicalOp } => {
        const { source, ctx, isJoin } = planSource(ast, baseCtx)
        const aggs = aggsOf(ast.projection)
        const projected = !!ast.projection?.length
        const flat = aggs.length > 0 || projected
        let plan = source
        if (ast.where) plan = { op: 'Filter', child: plan, predicate: compilePredicate(ast.where, ctx) }
        if (aggs.length > 0 || !!ast.groupBy?.length) plan = planAggregate(plan, ast, aggs, ctx, isJoin)
        else if (projected) plan = projection(plan, (ast.projection ?? []).map((p) => projector(p, ctx)))
        if (ast.having) plan = { op: 'Filter', child: plan, predicate: compilePredicate(rewriteHaving(ast.having, ast.projection), baseCtx) }
        if (ast.orderBy?.length) {
                const resolve = (n: SqlNode): string | undefined => {
                        if (n.type === 'aggregate') return aliasOf(ast.projection, (p) => aggSig(p) === aggSig(n))
                        if (n.type === 'column') return aliasOf(ast.projection, (p) => p.type === 'column' && p.name === n.name) ?? (isJoin && !flat ? undefined : n.name)
                        return undefined
                }
                plan = { op: 'Sort', child: plan, keys: sortKeys(ast.orderBy, resolve, flat ? baseCtx : ctx) }
        }
        if (ast.distinct) plan = { op: 'Distinct', child: plan }
        if (ast.limit !== undefined || ast.offset !== undefined) plan = { op: 'Limit', child: plan, limit: ast.limit, offset: ast.offset }
        return { plan }
}

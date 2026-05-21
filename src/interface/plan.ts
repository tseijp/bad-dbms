import type { SQL, SqlNode, PhysicalOp, AggSpec, SortKey, ProjectorSpec, Row } from '../shared/types'
import type { SelectAst, ProjItem } from './types'
import { colNameOf, compileExpr, compilePredicate, compileNode, EvalCtx } from './compile'
const tableNameOf = (t: unknown): string => {
        if (typeof t === 'string') return t
        const v = t as { $meta?: { name: string }; node?: { name?: string } }
        if (v?.$meta) return v.$meta.name
        if (v?.node?.name) return v.node.name
        return ''
}
const nodeOf = (expr: SQL | SqlNode): SqlNode => ((expr as SQL).kind === 'sql' ? (expr as SQL).node : (expr as SqlNode))
const aggsOf = (projection?: ProjItem[]): AggSpec[] => {
        const aggs: AggSpec[] = []
        for (const p of projection ?? []) {
                const node = nodeOf(p.expr)
                if (node?.type !== 'aggregate') continue
                const arg = node.args[0] ? nodeOf(node.args[0]) : undefined
                aggs.push({ name: p.alias, kind: node.name, field: arg && arg.type === 'column' ? arg.name : '', distinct: !!node.distinct })
        }
        return aggs
}
const aggSig = (node: SqlNode | undefined): string | undefined => {
        if (!node || node.type !== 'aggregate') return undefined
        const arg = node.args && node.args[0] ? nodeOf(node.args[0]) : undefined
        return `${node.name}:${node.distinct ? 'd' : ''}:${arg && arg.type === 'column' ? arg.name : ''}`
}
const aliasOf = (projection: ProjItem[] | undefined, match: (n: SqlNode) => boolean): string | undefined => {
        for (const p of projection ?? []) {
                const n = nodeOf(p.expr)
                if (n && match(n)) return p.alias
        }
        return undefined
}
const rewriteHaving = (node: unknown, projection?: ProjItem[]): SqlNode | undefined => {
        if (!node || typeof node !== 'object') return undefined
        const n = nodeOf(node as SQL | SqlNode)
        if (!n) return undefined
        if (n.type === 'aggregate') {
                const alias = aliasOf(projection, (p) => aggSig(p) === aggSig(n))
                if (!alias) return { type: 'literal', value: undefined }
                return { type: 'func', name: 'toFloat', args: [{ kind: 'sql', node: { type: 'column', name: alias, dataType: 'f32' } } as SQL] }
        }
        if (n.type === 'binop' || n.type === 'unop' || n.type === 'func') {
                return { ...n, args: (n.args ?? []).map((a) => ({ kind: 'sql', node: rewriteHaving(a, projection) }) as SQL) }
        }
        return n
}
const isObjectSpec = (e: unknown): e is Record<string, SQL> => !!e && typeof e === 'object' && !('kind' in (e as object)) && !('type' in (e as object))
const sourceTableOf = (s: SQL): string | undefined => {
        const n = nodeOf(s)
        return n && n.type === 'column' ? n.tableName : undefined
}
const projectorFor = (p: ProjItem, ctx: EvalCtx): ProjectorSpec => {
        if (!isObjectSpec(p.expr)) return { alias: p.alias, eval: compileExpr(p.expr as SQL, ctx) }
        const spec = p.expr
        const fields = Object.keys(spec).map((k) => ({ key: k, eval: compileNode(spec[k], ctx), table: sourceTableOf(spec[k]) }))
        const tables = [...new Set(fields.map((f) => f.table).filter((t): t is string => !!t))]
        return {
                alias: p.alias,
                eval: (row) => {
                        const jr = row as Record<string, Row | null>
                        if (tables.length > 0 && tables.every((t) => jr[t] === null)) return null
                        const out: Row = {}
                        for (const f of fields) out[f.key] = f.eval(row)
                        return out
                },
        }
}
const sortKeysOf = (orderBy: unknown[], resolve: (n: SqlNode) => string | undefined, ctx: EvalCtx): SortKey[] => {
        const one = (col: SQL | SqlNode, dir: 'asc' | 'desc'): SortKey => {
                const field = resolve(nodeOf(col))
                if (field !== undefined) return { field, dir }
                return { field: '', dir, eval: compileExpr(col, ctx) }
        }
        return orderBy.map((o) => {
                const n = nodeOf(o as SQL | SqlNode)
                if (n?.type === 'order') return one(n.col, n.dir)
                return one(o as SQL, 'asc')
        })
}
const planSource = (ast: SelectAst, ctx: EvalCtx): { source: PhysicalOp; ctx: EvalCtx; isJoin: boolean } => {
        if (!ast.joins || ast.joins.length === 0) return { source: { op: 'SeqScan', table: tableNameOf(ast.table) }, ctx, isJoin: false }
        const jctx: EvalCtx = { ...ctx, joinRow: true }
        const base = tableNameOf(ast.table)
        let source: PhysicalOp = { op: 'NamedScan', table: base, name: base }
        for (const j of ast.joins) {
                const name = tableNameOf(j.table)
                source = { op: 'NestedLoopJoin', left: source, right: { op: 'NamedScan', table: name, name }, rightName: name, predicate: compilePredicate(j.on, jctx), kind: j.kind }
        }
        return { source, ctx: jctx, isJoin: true }
}
const planAggregate = (plan: PhysicalOp, ast: SelectAst, aggs: AggSpec[], ctx: EvalCtx, isJoin: boolean): PhysicalOp => {
        const groupBy = (ast.groupBy ?? []).map((g) => colNameOf(g))
        if (isJoin) {
                const groupEval = (ast.groupBy ?? []).map((g) => compileNode(g as SQL, ctx))
                const aggEval = (ast.projection ?? [])
                        .map((p) => nodeOf(p.expr))
                        .filter((n): n is Extract<SqlNode, { type: 'aggregate' }> => n?.type === 'aggregate')
                        .map((n) => (n.args[0] ? compileNode(n.args[0], ctx) : () => 1))
                const pre: ProjectorSpec[] = []
                groupBy.forEach((name, i) => pre.push({ alias: name, eval: groupEval[i] }))
                aggs.forEach((a, i) => pre.push({ alias: a.field || a.name, eval: aggEval[i] }))
                plan = { op: 'Projection', child: plan, fields: pre.map((p) => p.alias), projectors: pre }
                aggs = aggs.map((a) => ({ ...a, field: a.field || a.name }))
        }
        plan = { op: 'Aggregate', child: plan, groupBy, aggs }
        const post: ProjectorSpec[] = (ast.projection ?? []).map((p) => {
                const node = nodeOf(p.expr)
                const field = node?.type === 'column' ? colNameOf(p.expr) : p.alias
                return { alias: p.alias, eval: (row) => row[field] }
        })
        if (post.length > 0) plan = { op: 'Projection', child: plan, fields: post.map((p) => p.alias), projectors: post }
        return plan
}
export const planSelect = (ast: SelectAst, baseCtx: EvalCtx): { plan: PhysicalOp } => {
        const { source, ctx, isJoin } = planSource(ast, baseCtx)
        let plan = source
        if (ast.where) plan = { op: 'Filter', child: plan, predicate: compilePredicate(ast.where, ctx) }
        const aggs = aggsOf(ast.projection)
        if (aggs.length > 0) {
                plan = planAggregate(plan, ast, aggs, ctx, isJoin)
        } else if (ast.projection && ast.projection.length > 0) {
                const projectors = ast.projection.map((p) => projectorFor(p, ctx))
                plan = { op: 'Projection', child: plan, fields: projectors.map((p) => p.alias), projectors }
        }
        if (ast.having) plan = { op: 'Filter', child: plan, predicate: compilePredicate(rewriteHaving(ast.having, ast.projection), baseCtx) }
        if (ast.orderBy && ast.orderBy.length > 0) {
                const projected = !!(ast.projection && ast.projection.length > 0)
                const flat = aggs.length > 0 || projected
                const resolve = (n: SqlNode): string | undefined => {
                        if (n.type === 'aggregate') return aliasOf(ast.projection, (p) => aggSig(p) === aggSig(n))
                        if (n.type === 'column') {
                                const alias = aliasOf(ast.projection, (p) => p.type === 'column' && p.name === n.name)
                                if (alias) return alias
                                return isJoin && !flat ? undefined : n.name
                        }
                        if (n.type === 'currentTuple') return n.col
                        if (n.type === 'identifier') return n.name
                        return undefined
                }
                plan = { op: 'Sort', child: plan, keys: sortKeysOf(ast.orderBy, resolve, flat ? baseCtx : ctx) }
        }
        if (ast.distinct) plan = { op: 'Distinct', child: plan }
        if (ast.limit !== undefined || ast.offset !== undefined) plan = { op: 'Limit', child: plan, limit: ast.limit, offset: ast.offset }
        return { plan }
}
export { tableNameOf }

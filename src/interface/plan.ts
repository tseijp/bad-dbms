import type { SQL, SqlNode, PhysicalOp, AggSpec, SortKey, ProjectorSpec } from '../shared/types'
import type { SelectAst, ProjItem } from './types'
import { colNameOf, compileExpr, compilePredicate, EvalCtx } from './compile'
const tableNameOf = (t: unknown): string => {
        if (typeof t === 'string') return t
        const v = t as { $meta?: { name: string }; node?: { name?: string } }
        if (v?.$meta) return v.$meta.name
        if (v?.node?.name) return v.node.name
        return ''
}
export interface ProjInfo {
        fields: Array<{ alias: string; field: string }>
        aggs: AggSpec[]
        hasAgg: boolean
}
const nodeOf = (expr: SQL | SqlNode): SqlNode => ((expr as SQL).kind === 'sql' ? (expr as SQL).node : (expr as SqlNode))
export const buildProjection = (projection?: ProjItem[]): ProjInfo => {
        const fields: Array<{ alias: string; field: string }> = []
        const aggs: AggSpec[] = []
        if (!projection) return { fields, aggs, hasAgg: false }
        for (const p of projection) {
                const node = nodeOf(p.expr)
                if (node?.type === 'aggregate') {
                        const arg = node.args[0] ? nodeOf(node.args[0]) : undefined
                        const field = arg && arg.type === 'column' ? arg.name : ''
                        aggs.push({ name: p.alias, kind: node.name, field, distinct: !!node.distinct })
                        continue
                }
                if (node?.type === 'column') {
                        fields.push({ alias: p.alias, field: node.name })
                        continue
                }
                fields.push({ alias: p.alias, field: p.alias })
        }
        return { fields, aggs, hasAgg: aggs.length > 0 }
}
// signature of an aggregate node, for matching an orderBy expr to its alias.
const aggSig = (node: SqlNode | undefined): string | undefined => {
        if (!node || node.type !== 'aggregate') return undefined
        const arg = node.args && node.args[0] ? nodeOf(node.args[0]) : undefined
        const field = arg && arg.type === 'column' ? arg.name : ''
        return `${node.name}:${node.distinct ? 'd' : ''}:${field}`
}
export const planSelect = (ast: SelectAst, ctx: EvalCtx): { plan: PhysicalOp; proj: ProjInfo; tableName: string } => {
        const tableName = tableNameOf(ast.table)
        let plan: PhysicalOp = { op: 'SeqScan', table: tableName }
        if (ast.where) plan = { op: 'Filter', child: plan, predicate: compilePredicate(ast.where, ctx) }
        const proj = buildProjection(ast.projection)
        // alias of the projection item whose expr is the given aggregate, if any.
        const aliasForAgg = (node: SqlNode | undefined): string | undefined => {
                const sig = aggSig(node)
                if (!sig) return undefined
                for (const p of ast.projection ?? []) if (aggSig(nodeOf(p.expr)) === sig) return p.alias
                return undefined
        }
        if (proj.hasAgg) {
                const groupBy = (ast.groupBy ?? []).map(colNameOf)
                plan = { op: 'Aggregate', child: plan, groupBy, aggs: proj.aggs }
                // rename grouped column (DB name) to its projection alias.
                const projectors: ProjectorSpec[] = []
                for (const p of ast.projection ?? []) {
                        const node = nodeOf(p.expr)
                        if (node?.type === 'aggregate') projectors.push({ alias: p.alias, eval: (row) => row[p.alias] })
                        else if (node?.type === 'column') projectors.push({ alias: p.alias, eval: (row) => row[node.name] })
                        else projectors.push({ alias: p.alias, eval: (row) => row[p.alias] })
                }
                if (projectors.length > 0) plan = { op: 'Projection', child: plan, fields: projectors.map((p) => p.alias), projectors }
        } else if (ast.projection && ast.projection.length > 0) {
                const projectors: ProjectorSpec[] = ast.projection.map((p) => ({ alias: p.alias, eval: compileExpr(p.expr, ctx) }))
                plan = { op: 'Projection', child: plan, fields: projectors.map((p) => p.alias), projectors }
        }
        if (ast.orderBy && ast.orderBy.length > 0) {
                const sortKey = (col: SQL | SqlNode, dir: 'asc' | 'desc'): SortKey => {
                        const colNode = nodeOf(col)
                        if (colNode && colNode.type === 'column') return { field: proj.hasAgg ? aliasOfColumn(ast, colNode.name) : colNode.name, dir }
                        if (colNode && colNode.type === 'aggregate') {
                                const alias = aliasForAgg(colNode)
                                if (alias) return { field: alias, dir }
                        }
                        if (colNode && (colNode.type === 'currentTuple' || colNode.type === 'identifier')) return { field: colNameOf(col), dir }
                        return { field: '', dir, eval: compileExpr(col, ctx) }
                }
                const keys: SortKey[] = ast.orderBy.map((o) => {
                        const node = nodeOf(o)
                        if (node?.type === 'order') return sortKey(node.col, node.dir)
                        return sortKey(o, 'asc')
                })
                plan = { op: 'Sort', child: plan, keys }
        }
        return { plan, proj, tableName }
}
// projection alias holding a given DB column name (for sorting grouped rows).
const aliasOfColumn = (ast: SelectAst, dbName: string): string => {
        for (const p of ast.projection ?? []) {
                const n = (p.expr as SQL).kind === 'sql' ? (p.expr as SQL).node : (p.expr as SqlNode)
                if (n && n.type === 'column' && n.name === dbName) return p.alias
        }
        return dbName
}
export { tableNameOf }

import type { SQL, SqlNode, PhysicalOp, AggSpec, SortKey } from '../shared/types'
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
                        aggs.push({ name: p.alias, kind: node.name, field })
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
export const planSelect = (ast: SelectAst, ctx: EvalCtx): { plan: PhysicalOp; proj: ProjInfo; tableName: string } => {
        const tableName = tableNameOf(ast.table)
        let plan: PhysicalOp = { op: 'SeqScan', table: tableName }
        if (ast.where) plan = { op: 'Filter', child: plan, predicate: compilePredicate(ast.where, ctx) }
        const proj = buildProjection(ast.projection)
        if (proj.hasAgg) {
                const groupBy = (ast.groupBy ?? []).map(colNameOf)
                plan = { op: 'Aggregate', child: plan, groupBy, aggs: proj.aggs }
                const out = [...groupBy, ...proj.aggs.map((a) => a.name)]
                if (out.length > 0) plan = { op: 'Projection', child: plan, fields: out }
        } else if (proj.fields.length > 0) plan = { op: 'Projection', child: plan, fields: proj.fields.map((f) => f.field) }
        if (ast.orderBy && ast.orderBy.length > 0) {
                const sortKey = (col: SQL | SqlNode, dir: 'asc' | 'desc'): SortKey => {
                        const colNode = nodeOf(col)
                        if (colNode && colNode.type === 'column') return { field: colNode.name, dir }
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
export { tableNameOf }

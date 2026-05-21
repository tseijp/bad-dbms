import type { Row, AggSpec, SortKey, PhysicalOp, SelectOp } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { tableNameOf, nodeOf, fieldNameOf, evalNode, EMPTY_ITER } from './expr'
import { makeSeqScan, makeIndexScan, makeFilter, makeProjection, makeRowProjection, ProjectorSpec } from './scan'
import { makeNestedLoopJoin, makeHashJoin } from './join'
import { makeAggregate, makeSort } from './group'
import { makeUpdate, makeDelete, makeInsert } from './modify'
export { evalNode } from './expr'
// physical-plan dispatch: maps each operator node to its iterator factory.
const build = (catalog: Catalog, ast: PhysicalOp): RowIterator => {
        if (!ast || !ast.op) return EMPTY_ITER
        if (ast.op === 'SeqScan') return makeSeqScan(catalog, ast)
        if (ast.op === 'IndexScan') return makeIndexScan(catalog, ast)
        if (ast.op === 'Filter') return makeFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return makeProjection(build(catalog, ast.child), ast.fields, ast.projectors)
        if (ast.op === 'NestedLoopJoin') return makeNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.predicate)
        if (ast.op === 'HashJoin') return makeHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return makeAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return makeSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Update') return makeUpdate(catalog, ast)
        if (ast.op === 'Delete') return makeDelete(catalog, ast)
        if (ast.op === 'Insert') return makeInsert(catalog, ast)
        if (ast.op === 'Select') return makeSelectLogical(catalog, ast)
        return EMPTY_ITER
}
const stripRid = (row: Row): Row => {
        if (!('__rid' in row)) return row
        const out: Row = {}
        for (const k in row) if (k !== '__rid') out[k] = row[k]
        return out
}
// logical Select op: lowers projection / aggregate / sort inline and applies
// limit / offset over the result stream.
const makeSelectLogical = (catalog: Catalog, ast: SelectOp): RowIterator => {
        const hasTable = !!tableNameOf(ast.table ?? '')
        const seq: PhysicalOp = { op: 'SeqScan', table: ast.table ?? '' }
        let cur: RowIterator = hasTable ? build(catalog, seq) : EMPTY_ITER
        if (ast.where) cur = makeFilter(cur, ast.where)
        const proj = ast.projection
        const aggs: AggSpec[] = []
        const projectors: ProjectorSpec[] = []
        if (proj && Array.isArray(proj)) {
                for (const p of proj) {
                        const node = nodeOf(p.expr)
                        if (node && node.type === 'aggregate') {
                                const inner = nodeOf((node.args || [])[0])
                                const field = inner && inner.type === 'column' ? inner.name : '*'
                                aggs.push({ name: p.alias, kind: node.name, field })
                                continue
                        }
                        projectors.push({ alias: p.alias, eval: (row: Row) => evalNode(p.expr, row) })
                }
        }
        const groupBy: string[] = (ast.groupBy ?? []).map(fieldNameOf)
        const sortKeys = (): SortKey[] =>
                (ast.orderBy ?? []).map((o) => {
                        const n = nodeOf(o)
                        const dir = n && n.type === 'order' ? n.dir : 'asc'
                        return { field: fieldNameOf(o), dir }
                })
        const hasOrder = !!(ast.orderBy && Array.isArray(ast.orderBy) && ast.orderBy.length > 0)
        if (hasOrder && aggs.length === 0) cur = makeSort(cur, sortKeys())
        if (aggs.length > 0) cur = makeAggregate(cur, groupBy, aggs)
        else if (projectors.length > 0) cur = makeRowProjection(cur, projectors)
        if (hasOrder && aggs.length > 0) cur = makeSort(cur, sortKeys())
        const limit: number | undefined = ast.limit
        const offset: number = ast.offset ?? 0
        let produced = 0
        let skipped = 0
        const inner = cur
        const next = () => {
                while (true) {
                        const r = inner.next()
                        if (r === null) return null
                        if (skipped < offset) {
                                skipped++
                                continue
                        }
                        if (limit !== undefined && produced >= limit) return null
                        produced++
                        return stripRid(r)
                }
        }
        return { next, close: () => inner.close() }
}
export interface ExecutorDeps {
        catalog: Catalog
}
export const createExecutor = (deps: ExecutorDeps) => {
        const { catalog: _catalog } = deps
        return {
                execute(ast: PhysicalOp): RowIterator {
                        return build(_catalog, ast)
                },
        }
}
export type Executor = ReturnType<typeof createExecutor>

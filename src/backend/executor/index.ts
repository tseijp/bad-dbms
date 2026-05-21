import type { PhysicalOp } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { EMPTY_ITER } from './expr'
import { makeSeqScan, makeNamedScan, makeIndexScan, makeFilter, makeProjection } from './scan'
import { makeNestedLoopJoin, makeHashJoin } from './join'
import { makeAggregate, makeSort, makeDistinct, makeLimit } from './group'
import { makeUpdate, makeDelete, makeInsert } from './modify'
const build = (catalog: Catalog, ast: PhysicalOp): RowIterator => {
        if (!ast || !ast.op) return EMPTY_ITER
        if (ast.op === 'SeqScan') return makeSeqScan(catalog, ast)
        if (ast.op === 'NamedScan') return makeNamedScan(catalog, ast)
        if (ast.op === 'IndexScan') return makeIndexScan(catalog, ast)
        if (ast.op === 'Filter') return makeFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return makeProjection(build(catalog, ast.child), ast.fields, ast.projectors)
        if (ast.op === 'NestedLoopJoin') return makeNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.rightName, ast.predicate, ast.kind)
        if (ast.op === 'HashJoin') return makeHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return makeAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return makeSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Distinct') return makeDistinct(build(catalog, ast.child))
        if (ast.op === 'Limit') return makeLimit(build(catalog, ast.child), ast.limit, ast.offset)
        if (ast.op === 'Update') return makeUpdate(catalog, ast)
        if (ast.op === 'Delete') return makeDelete(catalog, ast)
        if (ast.op === 'Insert') return makeInsert(catalog, ast)
        return EMPTY_ITER
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

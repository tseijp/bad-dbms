import type { PhysicalOp } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { EMPTY_ITER } from './utils'
import { createSeqScan, createNamedScan, createIndexScan, createFilter, createProjection } from './scan'
import { createNestedLoopJoin, createHashJoin } from './join'
import { createAggregate, createSort, createDistinct, createLimit } from './group'
import { createUpdate, createDelete, createInsert } from './modify'
const build = (catalog: Catalog, ast: PhysicalOp): RowIterator => {
        if (!ast || !ast.op) return EMPTY_ITER
        if (ast.op === 'SeqScan') return createSeqScan(catalog, ast)
        if (ast.op === 'NamedScan') return createNamedScan(catalog, ast)
        if (ast.op === 'IndexScan') return createIndexScan(catalog, ast)
        if (ast.op === 'Filter') return createFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return createProjection(build(catalog, ast.child), ast.fields, ast.projectors)
        if (ast.op === 'NestedLoopJoin') return createNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.rightName, ast.predicate, ast.kind)
        if (ast.op === 'HashJoin') return createHashJoin(build(catalog, ast.left), build(catalog, ast.right), ast.leftKey, ast.rightKey)
        if (ast.op === 'Aggregate') return createAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return createSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Distinct') return createDistinct(build(catalog, ast.child))
        if (ast.op === 'Limit') return createLimit(build(catalog, ast.child), ast.limit, ast.offset)
        if (ast.op === 'Update') return createUpdate(catalog, ast)
        if (ast.op === 'Delete') return createDelete(catalog, ast)
        if (ast.op === 'Insert') return createInsert(catalog, ast)
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

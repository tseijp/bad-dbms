import type { PhysicalOp } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RowIterator } from '../types'
import { createSeqScan, createNamedScan, createFilter, createProjection } from './scan'
import { createNestedLoopJoin } from './join'
import { createAggregate, createSort, createDistinct, createLimit } from './group'
import { createUpdate, createDelete } from './modify'
const build = (catalog: Catalog, ast: PhysicalOp): RowIterator => {
        if (!ast || !ast.op) throw new Error(`error: no ast or op`)
        if (ast.op === 'SeqScan') return createSeqScan(catalog, ast)
        if (ast.op === 'NamedScan') return createNamedScan(catalog, ast)
        if (ast.op === 'Filter') return createFilter(build(catalog, ast.child), ast.predicate)
        if (ast.op === 'Projection') return createProjection(build(catalog, ast.child), ast.fields, ast.projectors)
        if (ast.op === 'NestedLoopJoin') return createNestedLoopJoin(build(catalog, ast.left), build(catalog, ast.right), ast.rightName, ast.predicate, ast.kind)
        if (ast.op === 'Aggregate') return createAggregate(build(catalog, ast.child), ast.groupBy, ast.aggs)
        if (ast.op === 'Sort') return createSort(build(catalog, ast.child), ast.keys)
        if (ast.op === 'Distinct') return createDistinct(build(catalog, ast.child))
        if (ast.op === 'Limit') return createLimit(build(catalog, ast.child), ast.limit, ast.offset)
        if (ast.op === 'Update') return createUpdate(catalog, ast)
        if (ast.op === 'Delete') return createDelete(catalog, ast)
        throw new Error(`error: no ast op match`)
}
export const createExecutor = ({ catalog }: { catalog: Catalog }) => ({
        execute: (ast: PhysicalOp): RowIterator => build(catalog, ast),
})
export type Executor = ReturnType<typeof createExecutor>

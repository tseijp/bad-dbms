import type { Row, RowPredicate } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
export { tableNameOf, isNullish, stripRid } from '../../shared/helper'
export const buildRow = (catalog: Catalog, rel: RelationDescriptor, rid: Rid): Row => catalog.readRow(rel, rid)
export const collectRids = (firstHeap: { scan(emit: (rid: Rid) => boolean | void): void }): Rid[] => {
        const rids: Rid[] = []
        firstHeap.scan((rid: Rid) => void rids.push(rid))
        return rids
}
export const EMPTY_ITER: RowIterator = {
        next() {
                return null
        },
        close() {},
}
export const fromRows = (rows: Row[]): RowIterator => {
        let _i = 0
        return {
                next() {
                        return _i < rows.length ? rows[_i++] : null
                },
                close() {},
        }
}
export const compilePredicate = (pred: RowPredicate | undefined): RowPredicate => pred ?? (() => true)
export type PredInput = RowPredicate | undefined

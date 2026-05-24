import type { Row, RowPredicate } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid, HeapHandle } from '../types'
export { tableNameOf, isNullish, stripRid } from '../../shared/helper'
export const buildRow = (catalog: Catalog, rel: RelationDescriptor, rid: Rid): Promise<Row> => catalog.readRow(rel, rid)
export const collectRids = async (firstHeap: HeapHandle): Promise<Rid[]> => {
        const rids: Rid[] = []
        await firstHeap.scan((rid: Rid) => void rids.push(rid))
        return rids
}
export const fromRows = (rows: Row[]): RowIterator => {
        let _i = 0
        return {
                async next() {
                        return _i < rows.length ? rows[_i++] : null
                },
                close() {},
        }
}
export const compilePredicate = (pred: RowPredicate | undefined): RowPredicate => pred ?? (() => true)
export type PredInput = RowPredicate | undefined

import type { Row, RowPredicate, RowSetter, TableRef } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
export const tableNameOf = (t: TableRef): string => {
        if (typeof t === 'string') return t
        if (t && '$meta' in t && t.$meta) return t.$meta.name
        if (t && 'node' in t && t.node) return t.node.name
        return String(t)
}
export const buildRow = (catalog: Catalog, rel: RelationDescriptor, rid: Rid): Row => catalog.readRow(rel, rid)
export const collectRids = (firstHeap: { scan(emit: (rid: Rid) => boolean | void): void }): Rid[] => {
        const rids: Rid[] = []
        firstHeap.scan((rid: Rid) => void rids.push(rid))
        return rids
}
export const EMPTY_ITER: RowIterator = { next: () => null, close: () => {} }
export const fromRows = (rows: Row[]): RowIterator => {
        let i = 0
        return { next: () => (i < rows.length ? rows[i++] : null), close: () => {} }
}
export const isNullish = (v: unknown): boolean => v === null || v === undefined
export const compilePredicate = (pred: RowPredicate | undefined): RowPredicate => pred ?? (() => true)
export type PredInput = RowPredicate | undefined

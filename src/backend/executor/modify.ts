import type { UpdateOp, DeleteOp, InsertOp, Row, RowSetter } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, fromRows, compilePredicate } from './utils'
const colIndexOf = (rel: RelationDescriptor, name: string): number => rel.columns.findIndex((c) => c.name === name || c.key === name)
export const createUpdate = (catalog: Catalog, ast: UpdateOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _pred = compilePredicate(ast.predicate)
        const _setters: Record<string, RowSetter> = ast.setters ?? {}
        const _rids = collectRids(_rel.heaps[0])
        const _changed: Row[] = []
        for (const rid of _rids) {
                const row = buildRow(catalog, _rel, rid)
                if (!_pred(row)) continue
                for (const k of Object.keys(_setters)) {
                        const colIdx = colIndexOf(_rel, k)
                        if (colIdx < 0) continue
                        catalog.writeCell(_rel, colIdx, rid, _setters[k](row))
                }
                _changed.push(buildRow(catalog, _rel, rid))
        }
        if (ast.returning) return fromRows(_changed)
        return fromRows([{ rowCount: _changed.length, changes: _changed.length, updated: _changed.length }])
}
const removeTuple = (catalog: Catalog, rel: RelationDescriptor, rid: Rid) => {
        for (let i = 0; i < rel.heaps.length; i++) rel.heaps[i].delete(rid)
        catalog.clearNull(rel, rid)
}
const cascadeFrom = (catalog: Catalog, parent: RelationDescriptor, parentRows: Row[]) => {
        for (const child of catalog.list()) {
                for (let ci = 0; ci < child.columns.length; ci++) {
                        const ref = child.columns[ci].references
                        if (!ref || ref.table !== parent.name || ref.onDelete !== 'cascade') continue
                        const targets = new Set(parentRows.map((r) => r[ref.column]))
                        const victims: Rid[] = []
                        child.heaps[0].scan((rid: Rid) => {
                                const row = buildRow(catalog, child, rid)
                                if (targets.has(row[child.columns[ci].name])) victims.push(rid)
                        })
                        if (victims.length === 0) continue
                        const childRows = victims.map((rid) => buildRow(catalog, child, rid))
                        for (const rid of victims) removeTuple(catalog, child, rid)
                        cascadeFrom(catalog, child, childRows)
                }
        }
}
export const createDelete = (catalog: Catalog, ast: DeleteOp): RowIterator => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _pred = compilePredicate(ast.predicate)
        const _rids = collectRids(_rel.heaps[0])
        const _removed: Row[] = []
        for (const rid of _rids) {
                const row = buildRow(catalog, _rel, rid)
                if (!_pred(row)) continue
                _removed.push(row)
                removeTuple(catalog, _rel, rid)
        }
        if (_removed.length > 0) cascadeFrom(catalog, _rel, _removed)
        if (ast.returning) return fromRows(_removed.map((r) => ({ ...r })))
        return fromRows([{ rowCount: _removed.length, deleted: _removed.length }])
}
export const createInsert = (catalog: Catalog, ast: InsertOp): RowIterator => {
        const _name = tableNameOf(ast.table)
        const _rows: Row[] = ast.values || []
        const _rids: Rid[] = []
        for (const row of _rows) _rids.push(catalog.insertRow(_name, row))
        return fromRows(ast.returning ? [{ rowCount: _rids.length, rids: _rids }] : [{ rowCount: _rids.length }])
}

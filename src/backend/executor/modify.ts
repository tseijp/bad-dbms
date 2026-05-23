import type { UpdateOp, DeleteOp, InsertOp, Row, RowSetter } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, fromRows, compilePredicate, stripRid } from './utils'
const colIndexOf = (rel: RelationDescriptor, name: string): number => rel.columns.findIndex((c) => c.name === name)
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
                        const refCol = parent.columns.find((c) => c.name === ref.column)
                        const targets = new Set(parentRows.map((r) => r[refCol ? refCol.name : ref.column]))
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
        return fromRows([{ rowCount: _removed.length, changes: _removed.length, deleted: _removed.length }])
}
const findConflictRid = (catalog: Catalog, rel: RelationDescriptor, row: Row): Rid | null => {
        const keyCols = rel.columns.filter((c) => c.isPrimary || c.isUnique)
        if (keyCols.length === 0) return null
        let hit: Rid | null = null
        for (const col of keyCols) {
                if (hit) break
                const want = row[col.name]
                if (want === undefined || want === null) continue
                rel.heaps[0].scan((rid: Rid) => {
                        if (hit) return false
                        const existing = buildRow(catalog, rel, rid)
                        if (existing[col.name] === want) hit = rid
                })
        }
        return hit
}
const applyConflictUpdate = (catalog: Catalog, rel: RelationDescriptor, rid: Rid, set: Record<string, unknown>) => {
        for (const k of Object.keys(set)) {
                const colIdx = colIndexOf(rel, k)
                if (colIdx < 0) continue
                catalog.writeCell(rel, colIdx, rid, set[k])
        }
}
export const createInsert = (catalog: Catalog, ast: InsertOp): RowIterator => {
        const _name = tableNameOf(ast.table)
        const _rel = catalog.resolve(_name)
        const _rows: Row[] = ast.values || []
        if (!ast.conflict) {
                const rids = catalog.insertRows(_name, _rows)
                if (ast.returning) return fromRows(rids.map((rid) => stripRid(buildRow(catalog, _rel, rid))))
                return fromRows([{ rowCount: rids.length, changes: rids.length }])
        }
        const _conflict = ast.conflict
        const _result: Rid[] = []
        for (const row of _rows) {
                const clash = findConflictRid(catalog, _rel, row)
                if (clash) {
                        if (_conflict.action === 'update') applyConflictUpdate(catalog, _rel, clash, _conflict.set ?? row)
                        _result.push(clash)
                        continue
                }
                _result.push(catalog.insertRow(_name, row))
        }
        if (ast.returning) return fromRows(_result.map((rid) => stripRid(buildRow(catalog, _rel, rid))))
        return fromRows([{ rowCount: _result.length, changes: _result.length }])
}

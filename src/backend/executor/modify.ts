import type { UpdateOp, DeleteOp, InsertOp, Row, RowSetter } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, fromRows, compilePredicate, stripRid } from './utils'
export const createInsert = async (catalog: Catalog, ast: InsertOp): Promise<RowIterator> => {
        const _name = tableNameOf(ast.table)
        const _rids = await catalog.insertRows(_name, ast.values ?? [])
        if (ast.returning) {
                const _rel = catalog.resolve(_name)
                const rows: Row[] = []
                for (const rid of _rids) rows.push(stripRid(await buildRow(catalog, _rel, rid)))
                return fromRows(rows)
        }
        return fromRows([{ rowCount: _rids.length, changes: _rids.length, inserted: _rids.length }])
}
export const createUpdate = async (catalog: Catalog, ast: UpdateOp): Promise<RowIterator> => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _pred = compilePredicate(ast.predicate)
        const _setters: Record<string, RowSetter> = ast.setters ?? {}
        const _rids = await collectRids(_rel.heaps[0])
        const _changed: Row[] = []
        for (const rid of _rids) {
                const row = await buildRow(catalog, _rel, rid)
                if (!_pred(row)) continue
                for (const k of Object.keys(_setters)) {
                        await catalog.writeCell(_rel, _rel.columns.findIndex((c) => c.name === k), rid, _setters[k](row))
                }
                _changed.push(await buildRow(catalog, _rel, rid))
        }
        if (ast.returning) return fromRows(_changed)
        return fromRows([{ rowCount: _changed.length, changes: _changed.length, updated: _changed.length }])
}
const removeTuple = async (catalog: Catalog, rel: RelationDescriptor, rid: Rid) => {
        for (let i = 0; i < rel.heaps.length; i++) await rel.heaps[i].delete(rid)
        catalog.clearNull(rel, rid)
}
const cascadeFrom = async (catalog: Catalog, parent: RelationDescriptor, parentRows: Row[]) => {
        for (const child of catalog.list()) {
                for (let ci = 0; ci < child.columns.length; ci++) {
                        const ref = child.columns[ci].references
                        if (!ref || ref.table !== parent.name || ref.onDelete !== 'cascade') continue
                        const refCol = parent.columns.find((c) => c.name === ref.column)
                        const targets = new Set(parentRows.map((r) => r[refCol ? refCol.name : ref.column]))
                        const victims: Rid[] = []
                        await child.heaps[0].scan(async (rid: Rid) => {
                                const row = await buildRow(catalog, child, rid)
                                if (targets.has(row[child.columns[ci].name])) victims.push(rid)
                        })
                        if (victims.length === 0) continue
                        const childRows: Row[] = []
                        for (const rid of victims) childRows.push(await buildRow(catalog, child, rid))
                        for (const rid of victims) await removeTuple(catalog, child, rid)
                        await cascadeFrom(catalog, child, childRows)
                }
        }
}
export const createDelete = async (catalog: Catalog, ast: DeleteOp): Promise<RowIterator> => {
        const _rel = catalog.resolve(tableNameOf(ast.table))
        const _pred = compilePredicate(ast.predicate)
        const _rids = await collectRids(_rel.heaps[0])
        const _removed: Row[] = []
        for (const rid of _rids) {
                const row = await buildRow(catalog, _rel, rid)
                if (!_pred(row)) continue
                _removed.push(row)
                await removeTuple(catalog, _rel, rid)
        }
        if (_removed.length > 0) await cascadeFrom(catalog, _rel, _removed)
        if (ast.returning) return fromRows(_removed.map((r) => ({ ...r })))
        return fromRows([{ rowCount: _removed.length, changes: _removed.length, deleted: _removed.length }])
}

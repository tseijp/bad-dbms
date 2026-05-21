import type { UpdateOp, DeleteOp, InsertOp, Row, RowSetter } from '../../shared/types'
import type { Catalog } from '../catalog'
import type { RelationDescriptor, RowIterator, Rid } from '../types'
import { tableNameOf, buildRow, collectRids, fromRows, compilePredicate, compileSetter, SetterInput } from './expr'
// DML operators: update / delete / insert, plus the recursive FK cascade.
const colIndexOf = (rel: RelationDescriptor, name: string): number => rel.columns.findIndex((c) => c.name === name || c.key === name)
export const makeUpdate = (catalog: Catalog, ast: UpdateOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const pred = compilePredicate(ast.predicate)
        const setters: Record<string, SetterInput> = ast.setters ?? {}
        const compiled: Record<string, RowSetter> = {}
        for (const k of Object.keys(setters)) compiled[k] = compileSetter(setters[k])
        const rids = collectRids(rel.heaps[0])
        const changed: Row[] = []
        for (const rid of rids) {
                const row = buildRow(catalog, rel, rid)
                if (!pred(row)) continue
                for (const k of Object.keys(compiled)) {
                        const colIdx = colIndexOf(rel, k)
                        if (colIdx < 0) continue
                        catalog.writeCell(rel, colIdx, rid, compiled[k](row))
                }
                changed.push(buildRow(catalog, rel, rid))
        }
        if (ast.returning) return fromRows(changed)
        return fromRows([{ rowCount: changed.length, changes: changed.length, updated: changed.length }])
}
// remove a tuple from every column heap and forget its null cells.
const removeTuple = (catalog: Catalog, rel: RelationDescriptor, rid: Rid) => {
        for (let i = 0; i < rel.heaps.length; i++) rel.heaps[i].delete(rid)
        catalog.clearNull(rel, rid)
}
// cascade delete: every FK referencing this relation with onDelete cascade
// loses its matching child rows, recursively for self-referential trees.
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
export const makeDelete = (catalog: Catalog, ast: DeleteOp): RowIterator => {
        const rel = catalog.resolve(tableNameOf(ast.table))
        const pred = compilePredicate(ast.predicate)
        const rids = collectRids(rel.heaps[0])
        const removed: Row[] = []
        for (const rid of rids) {
                const row = buildRow(catalog, rel, rid)
                if (!pred(row)) continue
                removed.push(row)
                removeTuple(catalog, rel, rid)
        }
        if (removed.length > 0) cascadeFrom(catalog, rel, removed)
        if (ast.returning) return fromRows(removed.map((r) => ({ ...r })))
        return fromRows([{ rowCount: removed.length, deleted: removed.length }])
}
export const makeInsert = (catalog: Catalog, ast: InsertOp): RowIterator => {
        const name = tableNameOf(ast.table)
        const rows: Row[] = ast.values || []
        const rids: Rid[] = []
        for (const row of rows) rids.push(catalog.insertRow(name, row))
        return fromRows(ast.returning ? [{ rowCount: rids.length, rids }] : [{ rowCount: rids.length }])
}

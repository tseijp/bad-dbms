import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import type { ColumnType, Rid, Row } from '../shared/types'
import type { BufferPool, StorageManager, FreeSpaceMap, ColumnMeta, ColumnCodec, IndexDescriptor, RelationDescriptor, HeapHandle, AccessIndex } from './types'
export type { ColumnType } from '../shared/types'
const BYTE_SIZE: Record<ColumnType, number> = { i32: 4, f32: 4, u32: 4 }
const COLUMN_FORK_BASE = 10
const INDEX_FORK_BASE = 1000
const STORAGE_STRIDE = 10000
const storageRelOf = (relId: number, forkId: number) => relId * STORAGE_STRIDE + forkId
const ridKey = (rid: Rid): string => `${rid[0]}:${rid[1]}`
const buildColumn = (name: string, def: Partial<ColumnMeta>, forkId: number): ColumnMeta => ({
        name: def.name ?? name,
        type: def.type ?? 'i32',
        byteSize: BYTE_SIZE[def.type ?? 'i32'],
        forkId,
        isPrimary: !!def.isPrimary,
        isUnique: !!def.isUnique,
        notNull: !!def.notNull,
        isText: !!def.isText,
        defaultValue: def.defaultValue,
        defaultFn: def.defaultFn,
        references: def.references,
})
const needsIndex = (col: ColumnMeta) => col.isPrimary || col.isUnique
const encodeCell = (col: ColumnMeta, codec: ColumnCodec, value: unknown): number => {
        if (!col.isText) return Number(value)
        const s = String(value)
        const hit = codec.intern.get(s)
        if (hit !== undefined) return hit
        const id = codec.strings.length + 1
        codec.strings.push(s)
        codec.intern.set(s, id)
        return id
}
const decodeCell = (col: ColumnMeta, codec: ColumnCodec, raw: number | undefined): unknown => {
        if (!col.isText) return raw
        if (raw === undefined || raw <= 0) return ''
        return codec.strings[raw - 1] ?? ''
}
const resolveInsertValue = (col: ColumnMeta, row: Row): { value: unknown; isNull: boolean } => {
        const has = Object.prototype.hasOwnProperty.call(row, col.name)
        const raw = has ? row[col.name] : undefined
        if (has && raw !== undefined && raw !== null) return { value: raw, isNull: false }
        if (has && raw === null) return { value: col.isText ? '' : 0, isNull: true }
        if (col.defaultFn) return { value: col.defaultFn(), isNull: false }
        if (col.defaultValue !== undefined) return { value: col.defaultValue, isNull: false }
        return { value: col.isText ? '' : 0, isNull: true }
}
export interface CatalogDeps {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
}
type Slot = { value: unknown; isNull: boolean }
export const createCatalog = ({ buffer, smgr, fsm }: CatalogDeps) => {
        const _relations = new Map<string, RelationDescriptor>()
        let _nextRelId = 1
        const _makeHeap = (relId: number, col: ColumnMeta): HeapHandle => createHeap({ buffer, smgr, fsm, relId: storageRelOf(relId, col.forkId), valueSize: col.byteSize, valueType: col.type })
        const _makeIndex = (relId: number, indexForkId: number): AccessIndex => createNBTree({ buffer, smgr, fsm, relId: storageRelOf(relId, indexForkId), forkId: 0 })
        const resolve = (name: string): RelationDescriptor => {
                const rel = _relations.get(name)
                if (!rel) throw new Error(`relation not found: ${name}`)
                return rel
        }
        const _columnValues = (rel: RelationDescriptor, colIdx: number): unknown[] => {
                const col = rel.columns[colIdx]
                const codec = rel.codecs[colIdx]
                const out: unknown[] = []
                rel.heaps[0].scan((rid: Rid) => {
                        if (codec.nulls.has(ridKey(rid))) return
                        out.push(decodeCell(col, codec, rel.heaps[colIdx].read(rid)))
                })
                return out
        }
        const _checkBatch = (rel: RelationDescriptor, batch: Slot[][]): void => {
                rel.columns.forEach((col, i) => {
                        const unique = col.isUnique || col.isPrimary
                        const existing = unique ? new Set(_columnValues(rel, i)) : null
                        const seen = new Set<unknown>()
                        for (const slots of batch) {
                                if (col.notNull && slots[i].isNull) throw new Error(`null value in notNull column: ${col.name}`)
                                if (!unique || slots[i].isNull) continue
                                const v = slots[i].value
                                if (existing!.has(v) || seen.has(v)) throw new Error(`unique violation: ${col.name}`)
                                seen.add(v)
                        }
                })
        }
        const _writeRow = (rel: RelationDescriptor, slots: Slot[]): Rid => {
                const rids = rel.columns.map((col, i) => rel.heaps[i].insert(encodeCell(col, rel.codecs[i], slots[i].value)))
                const rid = rids[0]
                const rk = ridKey(rid)
                slots.forEach((slot, i) => slot.isNull && rel.codecs[i].nulls.add(rk))
                for (const idx of rel.indexes) {
                        const ci = idx.columnIdx
                        idx.handle.insert(encodeCell(rel.columns[ci], rel.codecs[ci], slots[ci].value), rid)
                }
                return rid
        }
        const insertRows = (relName: string, rows: Row[]): Rid[] => {
                const rel = resolve(relName)
                const batch = rows.map((row) => rel.columns.map((col) => resolveInsertValue(col, row)))
                _checkBatch(rel, batch)
                return batch.map((slots) => _writeRow(rel, slots))
        }
        const insertRow = (relName: string, row: Row): Rid => insertRows(relName, [row])[0]
        return {
                register(name: string, columnsDef: Record<string, Partial<ColumnMeta>>): RelationDescriptor {
                        const relId = _nextRelId++
                        const columns: ColumnMeta[] = []
                        const heaps: HeapHandle[] = []
                        const codecs: ColumnCodec[] = []
                        Object.keys(columnsDef).forEach((ckey, i) => {
                                const col = buildColumn(ckey, columnsDef[ckey], COLUMN_FORK_BASE + i)
                                columns.push(col)
                                heaps.push(_makeHeap(relId, col))
                                codecs.push({ strings: [], intern: new Map(), nulls: new Set() })
                        })
                        const indexes: IndexDescriptor[] = []
                        const idxHandles: AccessIndex[] = []
                        columns.forEach((col, i) => {
                                if (!needsIndex(col)) return
                                const forkId = INDEX_FORK_BASE + indexes.length
                                const handle = _makeIndex(relId, forkId)
                                indexes.push({ name: `${name}_${col.name}_idx`, columnIdx: i, forkId, handle })
                                idxHandles.push(handle)
                        })
                        const rel: RelationDescriptor = { relId, name, columns, indexes, heaps, idxHandles, codecs }
                        _relations.set(name, rel)
                        return rel
                },
                resolve,
                find(name: string): RelationDescriptor | undefined {
                        return _relations.get(name)
                },
                ridKey,
                readRow(rel: RelationDescriptor, rid: Rid): Row {
                        const row: Row = { __rid: rid }
                        const rk = ridKey(rid)
                        rel.columns.forEach((col, i) => {
                                row[col.name] = rel.codecs[i].nulls.has(rk) ? null : decodeCell(col, rel.codecs[i], rel.heaps[i].read(rid))
                        })
                        return row
                },
                encodeCell,
                decodeCell,
                list(): RelationDescriptor[] {
                        return Array.from(_relations.values())
                },
                insertRow,
                insertRows,
                writeCell(rel: RelationDescriptor, colIdx: number, rid: Rid, value: unknown): void {
                        const col = rel.columns[colIdx]
                        const codec = rel.codecs[colIdx]
                        const rk = ridKey(rid)
                        if (value === null || value === undefined) {
                                if (col.notNull) throw new Error(`null value in notNull column: ${col.name}`)
                                codec.nulls.add(rk)
                                rel.heaps[colIdx].update(rid, encodeCell(col, codec, col.isText ? '' : 0))
                                return
                        }
                        if (col.isUnique || col.isPrimary) {
                                let clash = false
                                rel.heaps[0].scan((other: Rid) => {
                                        if (ridKey(other) === rk || codec.nulls.has(ridKey(other))) return
                                        if (decodeCell(col, codec, rel.heaps[colIdx].read(other)) === value) clash = true
                                })
                                if (clash) throw new Error(`unique violation: ${col.name}`)
                        }
                        codec.nulls.delete(rk)
                        rel.heaps[colIdx].update(rid, encodeCell(col, codec, value))
                },
                clearNull(rel: RelationDescriptor, rid: Rid): void {
                        const rk = ridKey(rid)
                        for (const codec of rel.codecs) codec.nulls.delete(rk)
                },
                snapshot(): Map<string, Row[]> {
                        const snap = new Map<string, Row[]>()
                        for (const rel of _relations.values()) {
                                const rows: Row[] = []
                                rel.heaps[0].scan((rid: Rid) => {
                                        const rk = ridKey(rid)
                                        const row: Row = {}
                                        rel.columns.forEach((col, i) => {
                                                row[col.name] = rel.codecs[i].nulls.has(rk) ? null : decodeCell(col, rel.codecs[i], rel.heaps[i].read(rid))
                                        })
                                        rows.push(row)
                                })
                                snap.set(rel.name, rows)
                        }
                        return snap
                },
                restore(snap: Map<string, Row[]>): void {
                        for (const rel of _relations.values()) {
                                const victims: Rid[] = []
                                rel.heaps[0].scan((rid: Rid) => void victims.push(rid))
                                for (const rid of victims) for (const heap of rel.heaps) heap.delete(rid)
                                for (const codec of rel.codecs) {
                                        codec.nulls.clear()
                                        codec.strings.length = 0
                                        codec.intern.clear()
                                }
                                for (const row of snap.get(rel.name) ?? []) insertRow(rel.name, row)
                        }
                },
        }
}
export type Catalog = ReturnType<typeof createCatalog>

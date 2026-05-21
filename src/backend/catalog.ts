import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import { createHashIndex } from './access/hash'
import type { ColumnType, ColumnDescriptor, Rid, Row } from '../shared/types'
import type { BufferPool, StorageManager, FreeSpaceMap, ColumnMeta, ColumnCodec, IndexDescriptor, RelationDescriptor, TupleDescriptor, HeapHandle, AccessIndex } from './types'
export type { ColumnType } from '../shared/types'
const BYTE_SIZE: Record<ColumnType, number> = { i32: 4, f32: 4, u32: 4 }
const normalizeType = (t: string): ColumnType => {
        if (t === 'i32' || t === 'f32' || t === 'u32') return t
        if (t === 'integer' || t === 'int') return 'i32'
        if (t === 'float' || t === 'real') return 'f32'
        if (t === 'uint' || t === 'unsigned') return 'u32'
        return 'u32'
}
const fromColDescriptor = (d: ColumnDescriptor): Partial<ColumnMeta> => ({
        key: d.name,
        name: d.name,
        type: normalizeType(d.type),
        isPrimary: !!d.primaryKey,
        isUnique: !!d.unique,
        hasOrder: !!d.hasOrder,
        notNull: !!d.notNull,
        isText: d.tag === 'str',
        defaultValue: d.defaultValue,
        defaultFn: d.defaultFn,
})
const COLUMN_FORK_BASE = 10
const INDEX_FORK_BASE = 1000
const STORAGE_STRIDE = 10000
const storageRelOf = (relId: number, forkId: number) => relId * STORAGE_STRIDE + forkId
const ridKey = (rid: Rid): string => `${rid[0]}:${rid[1]}`
const buildColumn = (key: string, def: Partial<ColumnMeta>, forkId: number): ColumnMeta => ({
        name: def.name ?? key,
        key,
        type: def.type ?? 'i32',
        byteSize: BYTE_SIZE[def.type ?? 'i32'],
        forkId,
        isPrimary: !!def.isPrimary,
        isUnique: !!def.isUnique,
        hasOrder: !!def.hasOrder,
        notNull: !!def.notNull,
        isText: !!def.isText,
        defaultValue: def.defaultValue,
        defaultFn: def.defaultFn,
        references: def.references,
})
const needsIndex = (col: ColumnMeta) => col.isPrimary || col.isUnique || col.hasOrder
const indexKindOf = (col: ColumnMeta): 'nbtree' | 'hash' => (col.hasOrder || col.isPrimary || col.isUnique ? 'nbtree' : 'hash')
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
        if (raw === undefined) return undefined
        if (!col.isText) return raw
        if (raw <= 0) return ''
        return codec.strings[raw - 1] ?? ''
}
const resolveInsertValue = (col: ColumnMeta, row: Row): { value: unknown; isNull: boolean } => {
        const has = Object.prototype.hasOwnProperty.call(row, col.key)
        const raw = has ? row[col.key] : undefined
        if (has && raw !== undefined) {
                if (raw === null) return { value: col.isText ? '' : 0, isNull: true }
                return { value: raw, isNull: false }
        }
        if (col.defaultFn) return { value: col.defaultFn(), isNull: false }
        if (col.defaultValue !== undefined) return { value: col.defaultValue, isNull: false }
        return { value: col.isText ? '' : 0, isNull: true }
}
export interface CatalogDeps {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
}
interface TableLike {
        $meta?: { name: string; columns: Array<{ $col: ColumnDescriptor }> }
}
type TableOrName = string | TableLike
export const createCatalog = (deps: CatalogDeps) => {
        const { buffer: _buffer, smgr: _smgr, fsm: _fsm } = deps
        const _relations = new Map<string, RelationDescriptor>()
        let _nextRelId = 1
        const _makeHeap = (relId: number, col: ColumnMeta): HeapHandle => {
                const storageRel = storageRelOf(relId, col.forkId)
                return createHeap({
                        buffer: _buffer,
                        smgr: _smgr,
                        fsm: _fsm,
                        relId: storageRel,
                        valueSize: col.byteSize,
                        valueType: col.type,
                })
        }
        const _makeIndex = (relId: number, indexForkId: number, kind: 'nbtree' | 'hash'): AccessIndex => {
                const storageRel = storageRelOf(relId, indexForkId)
                if (kind === 'hash') return createHashIndex({ buffer: _buffer, smgr: _smgr, fsm: _fsm, relId: storageRel, forkId: 0 })
                return createNBTree({ buffer: _buffer, smgr: _smgr, fsm: _fsm, relId: storageRel, forkId: 0 })
        }
        const register = (name: string, columnsDef: Record<string, Partial<ColumnMeta>>): RelationDescriptor => {
                const existing = _relations.get(name)
                if (existing) return existing
                const relId = _nextRelId++
                const colKeys = Object.keys(columnsDef)
                const columns: ColumnMeta[] = []
                const heaps: HeapHandle[] = []
                const codecs: ColumnCodec[] = []
                for (let i = 0; i < colKeys.length; i++) {
                        const ckey = colKeys[i]
                        const forkId = COLUMN_FORK_BASE + i
                        const col = buildColumn(ckey, columnsDef[ckey], forkId)
                        columns.push(col)
                        heaps.push(_makeHeap(relId, col))
                        codecs.push({ strings: [], intern: new Map(), nulls: new Set() })
                }
                const indexes: IndexDescriptor[] = []
                const idxHandles: AccessIndex[] = []
                let idxCounter = 0
                for (let i = 0; i < columns.length; i++) {
                        const col = columns[i]
                        if (!needsIndex(col)) continue
                        const kind = indexKindOf(col)
                        const indexForkId = INDEX_FORK_BASE + idxCounter++
                        const handle = _makeIndex(relId, indexForkId, kind)
                        const desc: IndexDescriptor = { name: `${name}_${col.name}_idx`, columnIdx: i, kind, forkId: indexForkId, handle }
                        indexes.push(desc)
                        idxHandles.push(handle)
                }
                const rel: RelationDescriptor = { relId, name, columns, indexes, heaps, idxHandles, codecs }
                _relations.set(name, rel)
                return rel
        }
        const _nameOf = (nameOrTable: TableOrName): string => {
                if (typeof nameOrTable === 'string') return nameOrTable
                if (nameOrTable && nameOrTable.$meta) return nameOrTable.$meta.name
                return ''
        }
        const find = (nameOrTable: TableOrName): RelationDescriptor | undefined => _relations.get(_nameOf(nameOrTable))
        const resolve = (nameOrTable: TableOrName): RelationDescriptor => {
                const rel = find(nameOrTable)
                if (!rel) throw new Error(`relation not found: ${_nameOf(nameOrTable)}`)
                return rel
        }
        const readRow = (rel: RelationDescriptor, rid: Rid): Row => {
                const row: Row = { __rid: rid }
                const rk = ridKey(rid)
                for (let i = 0; i < rel.columns.length; i++) {
                        const col = rel.columns[i]
                        if (rel.codecs[i].nulls.has(rk)) {
                                row[col.name] = null
                                continue
                        }
                        row[col.name] = decodeCell(col, rel.codecs[i], rel.heaps[i].read(rid))
                }
                return row
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
        type Slot = { value: unknown; isNull: boolean }
        const _checkBatch = (rel: RelationDescriptor, batch: Slot[][]): void => {
                for (let i = 0; i < rel.columns.length; i++) {
                        const col = rel.columns[i]
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
                }
        }
        const _writeRow = (rel: RelationDescriptor, slots: Slot[]): Rid => {
                let rid: Rid | null = null
                for (let i = 0; i < rel.columns.length; i++) {
                        const r = rel.heaps[i].insert(encodeCell(rel.columns[i], rel.codecs[i], slots[i].value))
                        if (i === 0) rid = r
                }
                if (!rid) throw new Error(`insert produced no rid: ${rel.name}`)
                const rk = ridKey(rid)
                for (let i = 0; i < rel.columns.length; i++) if (slots[i].isNull) rel.codecs[i].nulls.add(rk)
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
                register,
                resolve,
                find,
                ridKey,
                readRow,
                encodeCell,
                decodeCell,
                registerTable(tableObj: TableLike): RelationDescriptor | null {
                        if (!tableObj || !tableObj.$meta) return null
                        const name = tableObj.$meta.name
                        const existing = _relations.get(name)
                        if (existing) return existing
                        const def: Record<string, Partial<ColumnMeta>> = {}
                        for (const col of tableObj.$meta.columns) {
                                const cd = col.$col
                                def[cd.name] = fromColDescriptor(cd)
                        }
                        return register(name, def)
                },
                tupleDescriptor(rel: RelationDescriptor): TupleDescriptor {
                        const cols = rel.columns.map((c, i) => {
                                const idxes = rel.indexes.filter((x) => x.columnIdx === i)
                                return { name: c.name, type: c.type, byteSize: c.byteSize, forkId: c.forkId, heap: rel.heaps[i], indexes: idxes }
                        })
                        return { columns: cols }
                },
                findIndex(rel: RelationDescriptor, indexName: string): IndexDescriptor | undefined {
                        return rel.indexes.find((x) => x.name === indexName)
                },
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
                                        for (let i = 0; i < rel.columns.length; i++) {
                                                const col = rel.columns[i]
                                                if (rel.codecs[i].nulls.has(rk)) row[col.key] = null
                                                else row[col.key] = decodeCell(col, rel.codecs[i], rel.heaps[i].read(rid))
                                        }
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
                                for (const rid of victims) for (let i = 0; i < rel.heaps.length; i++) rel.heaps[i].delete(rid)
                                for (let i = 0; i < rel.columns.length; i++) {
                                        rel.codecs[i].nulls.clear()
                                        rel.codecs[i].strings.length = 0
                                        rel.codecs[i].intern.clear()
                                }
                                const rows = snap.get(rel.name) ?? []
                                for (const row of rows) insertRow(rel.name, row)
                        }
                },
                scanTable(nameOrTable: TableOrName, emit: (rid: Rid, row: Row) => boolean | void) {
                        const rel = find(nameOrTable)
                        if (!rel) return
                        let stopped = false
                        rel.heaps[0].scan((rid: Rid) => {
                                if (stopped) return false
                                const r = emit(rid, readRow(rel, rid))
                                if (r === false) {
                                        stopped = true
                                        return false
                                }
                        })
                },
        }
}
export type Catalog = ReturnType<typeof createCatalog>

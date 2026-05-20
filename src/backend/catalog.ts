import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import { createHashIndex } from './access/hash'
import type { ColumnType, ColumnDescriptor, Rid, Row } from '../shared/types'
import type { BufferPool, StorageManager, FreeSpaceMap, ColumnMeta, IndexDescriptor, RelationDescriptor, TupleDescriptor, HeapHandle, AccessIndex } from './types'
export type { ColumnType } from '../shared/types'
const BYTE_SIZE: Record<ColumnType, number> = { i32: 4, f32: 4, u32: 4 }
const normalizeType = (t: string): ColumnType => {
        if (t === 'i32' || t === 'f32' || t === 'u32') return t
        if (t === 'integer' || t === 'int') return 'i32'
        if (t === 'float' || t === 'real') return 'f32'
        if (t === 'uint' || t === 'unsigned') return 'u32'
        return 'u32'
}
export interface ColumnDef {
        type: ColumnType
        isPrimary: boolean
        isUnique: boolean
        hasOrder: boolean
}
const fromColDescriptor = (d: ColumnDescriptor): ColumnDef => ({
        type: normalizeType(d.type),
        isPrimary: !!d.primaryKey,
        isUnique: !!d.unique,
        hasOrder: !!d.hasOrder,
})
const COLUMN_FORK_BASE = 10
const INDEX_FORK_BASE = 1000
const STORAGE_STRIDE = 10000
const storageRelOf = (relId: number, forkId: number) => relId * STORAGE_STRIDE + forkId
const buildColumn = (name: string, def: Partial<ColumnDef>, forkId: number): ColumnMeta => ({
        name,
        type: def.type ?? 'i32',
        byteSize: BYTE_SIZE[def.type ?? 'i32'],
        forkId,
        isPrimary: !!def.isPrimary,
        isUnique: !!def.isUnique,
        hasOrder: !!def.hasOrder,
})
const needsIndex = (col: ColumnMeta) => col.isPrimary || col.isUnique || col.hasOrder
const indexKindOf = (col: ColumnMeta): 'nbtree' | 'hash' => (col.hasOrder || col.isPrimary || col.isUnique ? 'nbtree' : 'hash')
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
        const register = (name: string, columnsDef: Record<string, Partial<ColumnDef>>): RelationDescriptor => {
                const existing = _relations.get(name)
                if (existing) return existing
                const relId = _nextRelId++
                const colNames = Object.keys(columnsDef)
                const columns: ColumnMeta[] = []
                const heaps: HeapHandle[] = []
                for (let i = 0; i < colNames.length; i++) {
                        const cname = colNames[i]
                        const forkId = COLUMN_FORK_BASE + i
                        const col = buildColumn(cname, columnsDef[cname], forkId)
                        columns.push(col)
                        heaps.push(_makeHeap(relId, col))
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
                const rel: RelationDescriptor = { relId, name, columns, indexes, heaps, idxHandles }
                _relations.set(name, rel)
                return rel
        }
        const nameOf = (nameOrTable: TableOrName): string => {
                if (typeof nameOrTable === 'string') return nameOrTable
                if (nameOrTable && nameOrTable.$meta) return nameOrTable.$meta.name
                return ''
        }
        const find = (nameOrTable: TableOrName): RelationDescriptor | undefined => _relations.get(nameOf(nameOrTable))
        const resolve = (nameOrTable: TableOrName): RelationDescriptor => {
                const rel = find(nameOrTable)
                if (!rel) throw new Error(`relation not found: ${nameOf(nameOrTable)}`)
                return rel
        }
        return {
                register,
                resolve,
                find,
                registerTable(tableObj: TableLike): RelationDescriptor | null {
                        if (!tableObj || !tableObj.$meta) return null
                        const name = tableObj.$meta.name
                        const existing = _relations.get(name)
                        if (existing) return existing
                        const def: Record<string, ColumnDef> = {}
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
                insertRow(relName: string, row: Row): Rid {
                        const rel = resolve(relName)
                        let rid: Rid | null = null
                        for (let i = 0; i < rel.columns.length; i++) {
                                const col = rel.columns[i]
                                const v = Number(row[col.name] ?? 0)
                                const r = rel.heaps[i].insert(v)
                                if (i === 0) rid = r
                        }
                        if (!rid) throw new Error(`insert produced no rid: ${relName}`)
                        for (const idx of rel.indexes) {
                                const col = rel.columns[idx.columnIdx]
                                const key = Number(row[col.name] ?? 0)
                                idx.handle.insert(key, rid)
                        }
                        return rid
                },
                scanTable(nameOrTable: TableOrName, emit: (rid: Rid, row: Row) => boolean | void) {
                        const rel = find(nameOrTable)
                        if (!rel) return
                        const heaps = rel.heaps
                        const cols = rel.columns
                        let stopped = false
                        heaps[0].scan((rid: Rid) => {
                                if (stopped) return false
                                const row: Row = { __rid: rid }
                                for (let i = 0; i < cols.length; i++) row[cols[i].name] = heaps[i].read(rid)
                                const r = emit(rid, row)
                                if (r === false) {
                                        stopped = true
                                        return false
                                }
                        })
                },
        }
}
export type Catalog = ReturnType<typeof createCatalog>

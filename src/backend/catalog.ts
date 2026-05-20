import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import { createHashIndex } from './access/hash'
export type ColType = 'i32' | 'f32' | 'u32'
const BYTE_SIZE: any = { i32: 4, f32: 4, u32: 4 }
const normalizeType = (t: any): ColType => {
        if (t === 'i32' || t === 'f32' || t === 'u32') return t
        if (t === 'integer' || t === 'int') return 'i32'
        if (t === 'float' || t === 'real') return 'f32'
        if (t === 'uint' || t === 'unsigned') return 'u32'
        return 'u32'
}
const fromColDescriptor = (d: any) => ({
        type: normalizeType(d.type),
        isPrimary: !!d.primaryKey,
        isUnique: !!d.unique,
        hasOrder: !!d.hasOrder,
})
const COLUMN_FORK_BASE = 10
const INDEX_FORK_BASE = 1000
const STORAGE_STRIDE = 10000
const storageRelOf = (relId: number, forkId: number) => relId * STORAGE_STRIDE + forkId
const buildColumn = (name: string, def: any, forkId: number) => ({
        name,
        type: (def.type ?? 'i32') as ColType,
        byteSize: BYTE_SIZE[def.type ?? 'i32'],
        forkId,
        isPrimary: !!def.isPrimary,
        isUnique: !!def.isUnique,
        hasOrder: !!def.hasOrder,
})
const needsIndex = (col: any) => col.isPrimary || col.isUnique || col.hasOrder
const indexKindOf = (col: any) => (col.hasOrder || col.isPrimary || col.isUnique ? 'nbtree' : 'hash')
export const createCatalog = (deps: any) => {
        const { buffer: _buffer, smgr: _smgr, fsm: _fsm } = deps
        const _relations = new Map<string, any>()
        let _nextRelId = 1
        const _makeHeap = (relId: number, col: any) => {
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
        const _makeIndex = (relId: number, indexForkId: number, kind: string) => {
                const storageRel = storageRelOf(relId, indexForkId)
                if (kind === 'hash') return createHashIndex({ buffer: _buffer, smgr: _smgr, fsm: _fsm, relId: storageRel, forkId: 0 })
                return createNBTree({ buffer: _buffer, smgr: _smgr, fsm: _fsm, relId: storageRel, forkId: 0 })
        }
        const register = (name: string, columnsDef: any) => {
                if (_relations.has(name)) return _relations.get(name)
                const relId = _nextRelId++
                const colNames = Object.keys(columnsDef)
                const columns: any[] = []
                const heaps: any[] = []
                for (let i = 0; i < colNames.length; i++) {
                        const cname = colNames[i]
                        const forkId = COLUMN_FORK_BASE + i
                        const col = buildColumn(cname, columnsDef[cname], forkId)
                        columns.push(col)
                        heaps.push(_makeHeap(relId, col))
                }
                const indexes: any[] = []
                const idxHandles: any[] = []
                let idxCounter = 0
                for (let i = 0; i < columns.length; i++) {
                        const col = columns[i]
                        if (!needsIndex(col)) continue
                        const kind = indexKindOf(col)
                        const indexForkId = INDEX_FORK_BASE + idxCounter++
                        const handle = _makeIndex(relId, indexForkId, kind)
                        const desc = { name: `${name}_${col.name}_idx`, columnIdx: i, kind, forkId: indexForkId, handle }
                        indexes.push(desc)
                        idxHandles.push(handle)
                }
                const rel = { relId, name, columns, indexes, heaps, idxHandles }
                _relations.set(name, rel)
                return rel
        }
        const resolve = (nameOrTable: any) => {
                if (typeof nameOrTable === 'string') return _relations.get(nameOrTable)
                if (nameOrTable && nameOrTable.$meta) return _relations.get(nameOrTable.$meta.name)
                return undefined
        }
        return {
                register,
                resolve,
                registerTable(tableObj: any) {
                        if (!tableObj || !tableObj.$meta) return null
                        const name = tableObj.$meta.name
                        if (_relations.has(name)) return _relations.get(name)
                        const def: any = {}
                        for (const col of tableObj.$meta.columns) def[col.$col.name] = fromColDescriptor(col.$col)
                        return register(name, def)
                },
                tupleDescriptor(rel: any) {
                        const cols = rel.columns.map((c: any, i: number) => {
                                const idxes = rel.indexes.filter((x: any) => x.columnIdx === i)
                                return { name: c.name, type: c.type, byteSize: c.byteSize, forkId: c.forkId, heap: rel.heaps[i], indexes: idxes }
                        })
                        return { columns: cols }
                },
                findIndex(rel: any, indexName: string) {
                        return rel.indexes.find((x: any) => x.name === indexName)
                },
                list() {
                        return Array.from(_relations.values())
                },
                insertRow(relName: string, row: any) {
                        const rel = _relations.get(relName)
                        if (!rel) return null
                        let rid: any = null
                        for (let i = 0; i < rel.columns.length; i++) {
                                const col = rel.columns[i]
                                const v = row[col.name] ?? 0
                                const r = rel.heaps[i].insert(v)
                                if (i === 0) rid = r
                        }
                        for (const idx of rel.indexes) {
                                const col = rel.columns[idx.columnIdx]
                                const key = row[col.name] ?? 0
                                if (idx.kind === 'nbtree') idx.handle.insert(key, rid)
                                else idx.handle.insert(key, rid)
                        }
                        return rid
                },
                scanTable(nameOrTable: any, emit: (rid: any, row: any) => boolean | void) {
                        const rel = resolve(nameOrTable)
                        if (!rel) return
                        const heaps = rel.heaps
                        const cols = rel.columns
                        let stopped = false
                        heaps[0].scan((rid: any) => {
                                if (stopped) return false
                                const row: any = { __rid: rid }
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

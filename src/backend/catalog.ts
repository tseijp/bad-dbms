import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import { createHashIndex } from './access/hash'

export type ColType = 'i32' | 'f32' | 'u32'

const BYTE_SIZE: any = { i32: 4, f32: 4, u32: 4 }

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
        const { buffer, smgr, fsm } = deps
        const relations = new Map<string, any>()
        let nextRelId = 1
        const makeHeap = (relId: number, col: any) => {
                const storageRel = storageRelOf(relId, col.forkId)
                return createHeap({
                        buffer,
                        smgr,
                        fsm,
                        relId: storageRel,
                        valueSize: col.byteSize,
                        valueType: col.type,
                })
        }
        const makeIndex = (relId: number, indexForkId: number, kind: string) => {
                const storageRel = storageRelOf(relId, indexForkId)
                if (kind === 'hash')
                        return createHashIndex({ buffer, smgr, fsm, relId: storageRel, forkId: 0 })
                return createNBTree({ buffer, smgr, fsm, relId: storageRel, forkId: 0 })
        }
        const register = (name: string, columnsDef: any) => {
                if (relations.has(name)) return relations.get(name)
                const relId = nextRelId++
                const colNames = Object.keys(columnsDef)
                const columns: any[] = []
                const heaps: any[] = []
                for (let i = 0; i < colNames.length; i++) {
                        const cname = colNames[i]
                        const forkId = COLUMN_FORK_BASE + i
                        const col = buildColumn(cname, columnsDef[cname], forkId)
                        columns.push(col)
                        heaps.push(makeHeap(relId, col))
                }
                const indexes: any[] = []
                const idxHandles: any[] = []
                let idxCounter = 0
                for (let i = 0; i < columns.length; i++) {
                        const col = columns[i]
                        if (!needsIndex(col)) continue
                        const kind = indexKindOf(col)
                        const indexForkId = INDEX_FORK_BASE + idxCounter++
                        const handle = makeIndex(relId, indexForkId, kind)
                        const desc = { name: `${name}_${col.name}_idx`, columnIdx: i, kind, forkId: indexForkId, handle }
                        indexes.push(desc)
                        idxHandles.push(handle)
                }
                const rel = { relId, name, columns, indexes, heaps, idxHandles }
                relations.set(name, rel)
                return rel
        }
        const resolve = (name: string) => relations.get(name)
        const tupleDescriptor = (rel: any) => {
                const cols = rel.columns.map((c: any, i: number) => {
                        const idxes = rel.indexes.filter((x: any) => x.columnIdx === i)
                        return { name: c.name, type: c.type, byteSize: c.byteSize, forkId: c.forkId, heap: rel.heaps[i], indexes: idxes }
                })
                return { columns: cols }
        }
        const findIndex = (rel: any, indexName: string) => rel.indexes.find((x: any) => x.name === indexName)
        const list = () => Array.from(relations.values())
        const insertRow = (relName: string, row: any) => {
                const rel = relations.get(relName)
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
        }
        return { register, resolve, tupleDescriptor, findIndex, list, insertRow }
}

export type Catalog = ReturnType<typeof createCatalog>

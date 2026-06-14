import { createHeap } from '../access/heap'
import { ridKey, buildColumn, makeCodec, encodeCell, decodeCell, COLUMN_FORK_BASE } from '../column'
import type { ColumnDef, Rid } from '../../shared/types'
import type { BufferPool, StorageManager, FreeSpaceMap, ColumnMeta, RelationDescriptor } from '../types'
export interface AlterDeps {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
}
const nextForkOf = (rel: RelationDescriptor) => rel.columns.reduce((m, c) => Math.max(m, c.forkId), COLUMN_FORK_BASE - 1) + 1
const colIndexOf = (rel: RelationDescriptor, name: string): number => {
        const i = rel.columns.findIndex((c) => c.name === name)
        if (i < 0) throw new Error(`column not found: ${name}`)
        return i
}
const defaultOf = (col: ColumnMeta): unknown => {
        if (col.defaultValue !== undefined) return col.defaultValue
        if (col.defaultFn) return col.defaultFn()
        return undefined
}
const columnPathOf = (rel: RelationDescriptor, name: string) => `${rel.name}/${name}`
export const createAlterOps = ({ buffer, smgr, fsm }: AlterDeps) => {
        const _unlink = async (path: string) => {
                const storageId = smgr.intern(path)
                buffer.drop(storageId)
                fsm.drop(storageId, 0)
                await smgr.unlink(smgr.open(storageId), 0)
        }
        return {
                async addColumn(rel: RelationDescriptor, def: ColumnDef): Promise<void> {
                        if (rel.columns.some((c) => c.name === def.name)) throw new Error(`column already exists: ${def.name}`)
                        const col = buildColumn(def.name, def as Partial<ColumnMeta>, nextForkOf(rel))
                        const heap = createHeap({ buffer, smgr, fsm, relId: smgr.intern(columnPathOf(rel, col.name)), valueSize: col.byteSize, valueType: col.type })
                        const codec = makeCodec()
                        rel.columns.push(col)
                        rel.heaps.push(heap)
                        rel.codecs.push(codec)
                        await rel.heaps[0].scan(async (rid: Rid) => {
                                if ((await heap.read(rid)) !== undefined) return
                                const v = defaultOf(col)
                                if (v === undefined || v === null) codec.nulls.add(ridKey(rid))
                                await heap.place(rid, encodeCell(col, codec, v ?? (col.isText ? '' : 0)))
                        })
                },
                async dropColumn(rel: RelationDescriptor, name: string): Promise<void> {
                        const i = colIndexOf(rel, name)
                        if (i === 0) throw new Error(`cannot drop anchor column: ${name}`)
                        const [col] = rel.columns.splice(i, 1)
                        rel.heaps.splice(i, 1)
                        rel.codecs.splice(i, 1)
                        for (const idx of rel.indexes.filter((x) => x.columnIdx === i)) await _unlink(columnPathOf(rel, idx.name))
                        rel.indexes = rel.indexes.filter((x) => x.columnIdx !== i)
                        for (const idx of rel.indexes) if (idx.columnIdx > i) idx.columnIdx--
                        await _unlink(columnPathOf(rel, col.name))
                },
                renameColumn(rel: RelationDescriptor, name: string, to: string): void {
                        if (rel.columns.some((c) => c.name === to)) throw new Error(`column already exists: ${to}`)
                        rel.columns[colIndexOf(rel, name)].name = to
                },
                setDefault(rel: RelationDescriptor, name: string, value: unknown): void {
                        rel.columns[colIndexOf(rel, name)].defaultValue = value
                },
                dropDefault(rel: RelationDescriptor, name: string): void {
                        const col = rel.columns[colIndexOf(rel, name)]
                        col.defaultValue = undefined
                        col.defaultFn = undefined
                },
                async addUnique(rel: RelationDescriptor, name: string): Promise<void> {
                        const i = colIndexOf(rel, name)
                        const col = rel.columns[i]
                        const codec = rel.codecs[i]
                        const seen = new Set<unknown>()
                        await rel.heaps[0].scan(async (rid: Rid) => {
                                if (codec.nulls.has(ridKey(rid))) return
                                const v = decodeCell(col, codec, await rel.heaps[i].read(rid))
                                if (seen.has(v)) throw new Error(`unique violation: ${name}`)
                                seen.add(v)
                        })
                        col.isUnique = true
                },
                dropUnique(rel: RelationDescriptor, name: string): void {
                        rel.columns[colIndexOf(rel, name)].isUnique = false
                },
                async dropTable(rel: RelationDescriptor): Promise<void> {
                        for (const col of rel.columns) await _unlink(columnPathOf(rel, col.name))
                        for (const idx of rel.indexes) await _unlink(columnPathOf(rel, idx.name))
                },
        }
}
export type AlterOps = ReturnType<typeof createAlterOps>

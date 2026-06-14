import { createHeap } from './access/heap'
import { createNBTree } from './access/nbtree'
import { createAlterOps } from './commands/tablecmds'
import { buildColumn, needsIndex, makeCodec, encodeCell, decodeCell, resolveInsertValue, ridKey, COLUMN_FORK_BASE, INDEX_FORK_BASE } from './column'
import type { Rid, Row } from '../shared/types'
import type { BufferPool, ColumnMeta, FreeSpaceMap, RelationDescriptor, StorageManager } from './types'
export type { ColumnType } from '../shared/types'
export interface CatalogDeps {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
}
const columnPathOf = (rel: RelationDescriptor, col: ColumnMeta) => `${rel.name}/${col.name}`
const emptyRel = (relId: number, name: string): RelationDescriptor => ({ relId, name, columns: [], indexes: [], heaps: [], codecs: [] })
const resetCodec = (codec: { nulls: Set<string>; strings: string[]; intern: Map<string, number> }) => {
        codec.nulls.clear()
        codec.strings.length = 0
        codec.intern.clear()
}
export const createCatalog = ({ buffer, smgr, fsm }: CatalogDeps) => {
        const _relations = new Map<string, RelationDescriptor>()
        const alter = createAlterOps({ buffer, smgr, fsm })
        const resolve = (name: string): RelationDescriptor => {
                const rel = _relations.get(name)
                if (rel) return rel
                throw new Error(`relation not found: ${name}`)
        }
        const _heapOf = (rel: RelationDescriptor, col: ColumnMeta) => createHeap({ buffer, smgr, fsm, relId: smgr.intern(columnPathOf(rel, col)), valueSize: col.byteSize, valueType: col.type })
        const _indexOf = (rel: RelationDescriptor, col: ColumnMeta, columnIdx: number) => {
                const forkId = INDEX_FORK_BASE + rel.indexes.length
                const name = `${col.name}_idx`
                return { name, columnIdx, forkId, handle: createNBTree({ buffer, smgr, fsm, relId: smgr.intern(`${rel.name}/${name}`), forkId: 0 }) }
        }
        const _valueOf = async (rel: RelationDescriptor, colIdx: number, rid: Rid) => decodeCell(rel.columns[colIdx], rel.codecs[colIdx], await rel.heaps[colIdx].read(rid))
        const _assertUnique = async (rel: RelationDescriptor, colIdx: number, value: unknown, self?: Rid) => {
                const col = rel.columns[colIdx]
                if (!col.isPrimary && !col.isUnique) return
                if (value === null || value === undefined) return
                const selfKey = self ? ridKey(self) : ''
                await rel.heaps[0].scan(async (rid: Rid) => {
                        if (ridKey(rid) === selfKey) return
                        if ((await _valueOf(rel, colIdx, rid)) !== value) return
                        throw new Error(`unique violation: ${col.name}`)
                })
        }
        const readRow = async (rel: RelationDescriptor, rid: Rid): Promise<Row> => {
                const row: Row = { __rid: rid }
                const rk = ridKey(rid)
                for (let i = 0; i < rel.columns.length; i++) row[rel.columns[i].name] = rel.codecs[i].nulls.has(rk) ? null : await _valueOf(rel, i, rid)
                return row
        }
        const _assertInsert = async (rel: RelationDescriptor, batch: ReturnType<typeof resolveInsertValue>[][]) => {
                for (let i = 0; i < rel.columns.length; i++) {
                        const col = rel.columns[i]
                        const seen = new Set<unknown>()
                        for (const values of batch) {
                                if ((col.notNull || col.isPrimary) && values[i].isNull) throw new Error(`null value in notNull column: ${col.name}`)
                                if (!col.isPrimary && !col.isUnique) continue
                                if (values[i].isNull) continue
                                if (seen.has(values[i].value)) throw new Error(`unique violation: ${col.name}`)
                                seen.add(values[i].value)
                        }
                        for (const value of seen) await _assertUnique(rel, i, value)
                }
        }
        const insertRows = async (name: string, rows: Row[]): Promise<Rid[]> => {
                const rel = resolve(name)
                const batch = rows.map((row) => rel.columns.map((col) => resolveInsertValue(col, row)))
                await _assertInsert(rel, batch)
                const out: Rid[] = []
                for (const values of batch) {
                        const rids: Rid[] = []
                        for (let i = 0; i < rel.columns.length; i++) rids.push(await rel.heaps[i].insert(encodeCell(rel.columns[i], rel.codecs[i], values[i].value)))
                        const rid = rids[0]
                        const rk = ridKey(rid)
                        for (let i = 0; i < values.length; i++) if (values[i].isNull) rel.codecs[i].nulls.add(rk)
                        for (const idx of rel.indexes) await idx.handle.insert(encodeCell(rel.columns[idx.columnIdx], rel.codecs[idx.columnIdx], values[idx.columnIdx].value), rid)
                        out.push(rid)
                }
                return out
        }
        return {
                register(name: string, columnsDef: Record<string, Partial<ColumnMeta>>): RelationDescriptor {
                        const rel = emptyRel(smgr.intern(name), name)
                        for (const key of Object.keys(columnsDef)) {
                                const col = buildColumn(key, columnsDef[key], COLUMN_FORK_BASE + rel.columns.length)
                                rel.columns.push(col)
                                rel.heaps.push(_heapOf(rel, col))
                                rel.codecs.push(makeCodec())
                                if (!needsIndex(col)) continue
                                const idx = _indexOf(rel, col, rel.columns.length - 1)
                                rel.indexes.push(idx)
                        }
                        _relations.set(name, rel)
                        return rel
                },
                resolve,
                find(name: string) {
                        return _relations.get(name)
                },
                alter,
                rename(name: string, to: string): void {
                        const rel = resolve(name)
                        _relations.delete(name)
                        rel.name = to
                        _relations.set(to, rel)
                },
                async dropTable(name: string): Promise<void> {
                        const rel = resolve(name)
                        await alter.dropTable(rel)
                        _relations.delete(name)
                },
                ridKey,
                readRow,
                encodeCell,
                decodeCell,
                list() {
                        return Array.from(_relations.values())
                },
                insertRows,
                async writeCell(rel: RelationDescriptor, colIdx: number, rid: Rid, value: unknown): Promise<void> {
                        const col = rel.columns[colIdx]
                        const codec = rel.codecs[colIdx]
                        const rk = ridKey(rid)
                        if (value === null || value === undefined) {
                                if (col.notNull) throw new Error(`null value in notNull column: ${col.name}`)
                                codec.nulls.add(rk)
                                await rel.heaps[colIdx].update(rid, encodeCell(col, codec, col.isText ? '' : 0))
                                return
                        }
                        await _assertUnique(rel, colIdx, value, rid)
                        codec.nulls.delete(rk)
                        await rel.heaps[colIdx].update(rid, encodeCell(col, codec, value))
                },
                clearNull(rel: RelationDescriptor, rid: Rid): void {
                        const rk = ridKey(rid)
                        for (const codec of rel.codecs) codec.nulls.delete(rk)
                },
                async snapshot(): Promise<Map<string, Row[]>> {
                        const snap = new Map<string, Row[]>()
                        for (const rel of _relations.values()) {
                                const rows: Row[] = []
                                await rel.heaps[0].scan(async (rid: Rid) => void rows.push(await readRow(rel, rid)))
                                snap.set(rel.name, rows)
                        }
                        return snap
                },
                async restore(snap: Map<string, Row[]>): Promise<void> {
                        for (const rel of _relations.values()) {
                                const victims: Rid[] = []
                                await rel.heaps[0].scan((rid: Rid) => void victims.push(rid))
                                for (const rid of victims) for (const heap of rel.heaps) await heap.delete(rid)
                                for (const codec of rel.codecs) resetCodec(codec)
                                for (const row of snap.get(rel.name) ?? []) await insertRows(rel.name, [row])
                        }
                },
        }
}
export type Catalog = ReturnType<typeof createCatalog>

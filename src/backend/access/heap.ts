import { createPage } from '../storage/page'
import type { Rid } from '../../shared/types'
import type { ColumnType, Page, Frame, BufferPool, StorageManager, FreeSpaceMap, HeapHandle } from '../types'
export type ValueType = ColumnType
export interface HeapOptions {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
        relId: number
        valueSize: number
        valueType: ValueType
}
const HEAP_FORK = 0
export const createHeap = ({ buffer, smgr, fsm, relId, valueSize, valueType }: HeapOptions): HeapHandle => {
        const _rel = smgr.open(relId)
        const _pinPage = (blockNo: number) => buffer.pin(relId, HEAP_FORK, blockNo)
        const _unpin = (frame: Frame, dirty?: boolean) => buffer.unpin(frame, dirty)
        const _computeFree = (page: Page) => (page.capacity(valueSize) - page.liveCount()) * valueSize
        const _findOrAllocPage = async (): Promise<{ frame: Frame; page: Page; isNew: boolean }> => {
                let blockNo = fsm.findPage(relId, HEAP_FORK, valueSize)
                let isNew = false
                if (blockNo < 0) {
                        blockNo = await smgr.extend(_rel, HEAP_FORK)
                        isNew = true
                }
                const frame = await _pinPage(blockNo)
                const page = createPage(frame.bytes)
                if (isNew) page.setHeader({ kind: 'data', slotCount: 0 })
                return { frame, page, isNew }
        }
        const _findDeadSlot = (page: Page): number => {
                const cap = page.capacity(valueSize)
                for (let i = 0; i < cap; i++) if (!page.isAlive(i)) return i
                return -1
        }
        const _append = async (value: number): Promise<Rid> => {
                let { frame, page } = await _findOrAllocPage()
                let slot = page.getHeader().slotCount || 0
                if (slot >= page.capacity(valueSize)) {
                        fsm.update(relId, HEAP_FORK, frame.blockNo, 0)
                        await _unpin(frame, true)
                        const blockNo = await smgr.extend(_rel, HEAP_FORK)
                        frame = await _pinPage(blockNo)
                        page = createPage(frame.bytes)
                        page.setHeader({ kind: 'data', slotCount: 0 })
                        slot = 0
                }
                const blockNo = frame.blockNo
                page.setAlive(slot, true)
                page.writeValue(slot, valueType, value)
                page.setHeader({ slotCount: slot + 1 })
                const free = _computeFree(page)
                await _unpin(frame, true)
                fsm.update(relId, HEAP_FORK, blockNo, free)
                return [blockNo, slot]
        }
        return {
                async insert(value: number): Promise<Rid> {
                        let { frame, page } = await _findOrAllocPage()
                        let slot = _findDeadSlot(page)
                        if (slot < 0) {
                                await _unpin(frame, true)
                                const blockNo = await smgr.extend(_rel, HEAP_FORK)
                                frame = await _pinPage(blockNo)
                                page = createPage(frame.bytes)
                                page.setHeader({ kind: 'data', slotCount: 0 })
                                slot = 0
                        }
                        const blockNo = frame.blockNo
                        page.setAlive(slot, true)
                        page.writeValue(slot, valueType, value)
                        if (slot + 1 > (page.getHeader().slotCount || 0)) page.setHeader({ slotCount: slot + 1 })
                        const free = _computeFree(page)
                        await _unpin(frame, true)
                        fsm.update(relId, HEAP_FORK, blockNo, free)
                        return [blockNo, slot]
                },
                async read(rid: Rid): Promise<number | undefined> {
                        const frame = await _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                await _unpin(frame)
                                return undefined
                        }
                        const v = page.readValue(rid[1], valueType)
                        await _unpin(frame)
                        return v
                },
                async update(rid: Rid, value: number): Promise<Rid> {
                        const frame = await _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                await _unpin(frame)
                                return rid
                        }
                        page.writeValue(rid[1], valueType, value)
                        await _unpin(frame, true)
                        return rid
                },
                async place(rid: Rid, value: number): Promise<void> {
                        const frame = await _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        const slotCount = page.getHeader().slotCount || 0
                        page.setAlive(rid[1], true)
                        page.writeValue(rid[1], valueType, value)
                        page.setHeader({ kind: 'data', slotCount: Math.max(slotCount, rid[1] + 1) })
                        const free = _computeFree(page)
                        await _unpin(frame, true)
                        fsm.update(relId, HEAP_FORK, rid[0], free)
                },
                async delete(rid: Rid): Promise<void> {
                        const frame = await _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        page.setAlive(rid[1], false)
                        const free = _computeFree(page)
                        await _unpin(frame, true)
                        fsm.update(relId, HEAP_FORK, rid[0], free)
                },
                async scan(emit: (rid: Rid, value: number) => boolean | void | Promise<boolean | void>): Promise<void> {
                        const total = await smgr.nBlocks(_rel, HEAP_FORK)
                        for (let blockNo = 0; blockNo < total; blockNo++) {
                                const frame = await _pinPage(blockNo)
                                const page = createPage(frame.bytes)
                                const cap = page.capacity(valueSize)
                                let stop = false
                                for (let slot = 0; slot < cap; slot++) {
                                        if (!page.isAlive(slot)) continue
                                        const v = page.readValue(slot, valueType)
                                        if ((await emit([blockNo, slot], v)) === false) {
                                                stop = true
                                                break
                                        }
                                }
                                await _unpin(frame)
                                if (stop) return
                        }
                },
                async bulkLoad(values: number[]): Promise<Rid[]> {
                        const out: Rid[] = []
                        for (const v of values) out.push(await _append(v))
                        return out
                },
        }
}
export type Heap = HeapHandle

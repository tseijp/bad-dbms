import { createPage } from '../storage/page'
import type { Rid } from '../../shared/types'
import type { ColumnType, Page, Frame, BufferPool, StorageManager, FreeSpaceMap, HeapHandle } from '../types'
export type { Rid } from '../../shared/types'
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
        const _pinPage = (blockNo: number) => buffer.pin(relId, HEAP_FORK, blockNo)
        const _unpin = (frame: Frame) => buffer.unpin(frame)
        const _computeFree = (page: Page) => (page.capacity(valueSize) - page.liveCount()) * valueSize
        const _findOrAllocPage = (): { frame: Frame; page: Page; isNew: boolean } => {
                let blockNo = fsm.findPage(relId, HEAP_FORK, valueSize)
                let isNew = false
                if (blockNo < 0) {
                        blockNo = smgr.extend(relId, HEAP_FORK)
                        isNew = true
                }
                const frame = _pinPage(blockNo)
                const page = createPage(frame.bytes)
                if (isNew) page.setHeader({ kind: 'data', slotCount: 0 })
                return { frame, page, isNew }
        }
        const _findDeadSlot = (page: Page): number => {
                const cap = page.capacity(valueSize)
                for (let i = 0; i < cap; i++) if (!page.isAlive(i)) return i
                return -1
        }
        const _append = (value: number): Rid => {
                let { frame, page } = _findOrAllocPage()
                let slot = page.getHeader().slotCount || 0
                if (slot >= page.capacity(valueSize)) {
                        fsm.update(relId, HEAP_FORK, frame.blockNo, 0)
                        _unpin(frame)
                        const blockNo = smgr.extend(relId, HEAP_FORK)
                        frame = _pinPage(blockNo)
                        page = createPage(frame.bytes)
                        page.setHeader({ kind: 'data', slotCount: 0 })
                        slot = 0
                }
                const blockNo = frame.blockNo
                page.setAlive(slot, true)
                page.writeValue(slot, valueType, value)
                page.setHeader({ slotCount: slot + 1 })
                const free = _computeFree(page)
                _unpin(frame)
                fsm.update(relId, HEAP_FORK, blockNo, free)
                return [blockNo, slot]
        }
        return {
                insert(value: number): Rid {
                        let { frame, page } = _findOrAllocPage()
                        let slot = _findDeadSlot(page)
                        if (slot < 0) {
                                _unpin(frame)
                                const blockNo = smgr.extend(relId, HEAP_FORK)
                                frame = _pinPage(blockNo)
                                page = createPage(frame.bytes)
                                page.setHeader({ kind: 'data', slotCount: 0 })
                                slot = 0
                        }
                        const blockNo = frame.blockNo
                        page.setAlive(slot, true)
                        page.writeValue(slot, valueType, value)
                        if (slot + 1 > (page.getHeader().slotCount || 0)) page.setHeader({ slotCount: slot + 1 })
                        const free = _computeFree(page)
                        _unpin(frame)
                        fsm.update(relId, HEAP_FORK, blockNo, free)
                        return [blockNo, slot]
                },
                read(rid: Rid): number | undefined {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                _unpin(frame)
                                return undefined
                        }
                        const v = page.readValue(rid[1], valueType)
                        _unpin(frame)
                        return v
                },
                update(rid: Rid, value: number): Rid {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                _unpin(frame)
                                return rid
                        }
                        page.writeValue(rid[1], valueType, value)
                        _unpin(frame)
                        return rid
                },
                delete(rid: Rid): void {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        page.setAlive(rid[1], false)
                        const free = _computeFree(page)
                        _unpin(frame)
                        fsm.update(relId, HEAP_FORK, rid[0], free)
                },
                scan(emit: (rid: Rid, value: number) => boolean | void): void {
                        for (let blockNo = 0; blockNo < smgr.nBlocks(relId, HEAP_FORK); blockNo++) {
                                const frame = _pinPage(blockNo)
                                const page = createPage(frame.bytes)
                                const cap = page.capacity(valueSize)
                                let stop = false
                                for (let slot = 0; slot < cap; slot++) {
                                        if (!page.isAlive(slot)) continue
                                        const v = page.readValue(slot, valueType)
                                        if (emit([blockNo, slot], v) === false) {
                                                stop = true
                                                break
                                        }
                                }
                                _unpin(frame)
                                if (stop) return
                        }
                },
                bulkLoad(values: number[]): Rid[] {
                        return values.map((v) => _append(v))
                },
        }
}
export type Heap = HeapHandle

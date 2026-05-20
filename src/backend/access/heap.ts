import { createPage } from '../storage/page'
export type Rid = [number, number]
export type ValueType = 'i32' | 'f32' | 'u32'
export interface HeapOptions {
        buffer: any
        smgr: any
        fsm: any
        relId: number
        valueSize: number
        valueType: ValueType
}
const HEAP_FORK = 0
export const createHeap = ({ buffer, smgr, fsm, relId, valueSize, valueType }: HeapOptions) => {
        const _pinPage = (blockNo: number, hint?: string) => buffer.pin(relId, HEAP_FORK, blockNo, hint)
        const _unpin = (frame: any, dirty?: boolean) => buffer.unpin(frame, dirty)
        const _computeFree = (page: any) => (page.capacity(valueSize) - page.liveCount()) * valueSize
        const _findOrAllocPage = (): { frame: any; page: any; isNew: boolean } => {
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
        const _findDeadSlot = (page: any): number => {
                const cap = page.capacity(valueSize)
                for (let i = 0; i < cap; i++) if (!page.isAlive(i)) return i
                return -1
        }
        const _append = (value: any): Rid => {
                let { frame, page } = _findOrAllocPage()
                let slot = page.getHeader().slotCount || 0
                if (slot >= page.capacity(valueSize)) {
                        fsm.update(relId, HEAP_FORK, frame.blockNo, 0)
                        _unpin(frame, false)
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
                _unpin(frame, true)
                fsm.update(relId, HEAP_FORK, blockNo, free)
                return [blockNo, slot]
        }
        return {
                insert(value: any): Rid {
                        let { frame, page, isNew } = _findOrAllocPage()
                        let slot = _findDeadSlot(page)
                        if (slot < 0) {
                                _unpin(frame, false)
                                const blockNo = smgr.extend(relId, HEAP_FORK)
                                frame = _pinPage(blockNo)
                                page = createPage(frame.bytes)
                                page.setHeader({ kind: 'data', slotCount: 0 })
                                isNew = true
                                slot = 0
                        }
                        const blockNo = frame.blockNo
                        page.setAlive(slot, true)
                        page.writeValue(slot, valueType, value)
                        const prevCount = page.getHeader().slotCount || 0
                        if (slot + 1 > prevCount) page.setHeader({ slotCount: slot + 1 })
                        const free = _computeFree(page)
                        _unpin(frame, true)
                        fsm.update(relId, HEAP_FORK, blockNo, free)
                        return [blockNo, slot]
                },
                read(rid: Rid): any {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                _unpin(frame, false)
                                return undefined
                        }
                        const v = page.readValue(rid[1], valueType)
                        _unpin(frame, false)
                        return v
                },
                update(rid: Rid, value: any): Rid {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        if (!page.isAlive(rid[1])) {
                                _unpin(frame, false)
                                return rid
                        }
                        page.writeValue(rid[1], valueType, value)
                        _unpin(frame, true)
                        return rid
                },
                delete(rid: Rid): void {
                        const frame = _pinPage(rid[0])
                        const page = createPage(frame.bytes)
                        page.setAlive(rid[1], false)
                        const free = _computeFree(page)
                        _unpin(frame, true)
                        fsm.update(relId, HEAP_FORK, rid[0], free)
                },
                scan(emit: (rid: Rid, value: any) => boolean | void): void {
                        const n = smgr.nBlocks(relId, HEAP_FORK)
                        for (let blockNo = 0; blockNo < n; blockNo++) {
                                const frame = _pinPage(blockNo, 'bulk_read')
                                const page = createPage(frame.bytes)
                                const cap = page.capacity(valueSize)
                                let stop = false
                                for (let slot = 0; slot < cap; slot++) {
                                        if (!page.isAlive(slot)) continue
                                        const v = page.readValue(slot, valueType)
                                        const r = emit([blockNo, slot], v)
                                        if (r === false) {
                                                stop = true
                                                break
                                        }
                                }
                                _unpin(frame, false)
                                if (stop) return
                        }
                },
                bulkLoad(values: any[]): Rid[] {
                        return values.map((v) => _append(v))
                },
        }
}
export type Heap = ReturnType<typeof createHeap>

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
        const pinPage = (blockNo: number, hint?: string) => buffer.pin(relId, HEAP_FORK, blockNo, hint)
        const unpin = (frame: any, dirty?: boolean) => buffer.unpin(frame, dirty)
        const computeFree = (page: any) => (page.capacity(valueSize) - page.liveCount()) * valueSize
        const findOrAllocPage = (): { frame: any; page: any; isNew: boolean } => {
                let blockNo = fsm.findPage(relId, HEAP_FORK, valueSize)
                let isNew = false
                if (blockNo < 0) {
                        blockNo = smgr.extend(relId, HEAP_FORK)
                        isNew = true
                }
                const frame = pinPage(blockNo)
                const page = createPage(frame.bytes)
                if (isNew) page.setHeader({ kind: 'data', slotCount: 0 })
                return { frame, page, isNew }
        }
        const findDeadSlot = (page: any): number => {
                const cap = page.capacity(valueSize)
                for (let i = 0; i < cap; i++) if (!page.isAlive(i)) return i
                return -1
        }
        const insert = (value: any): Rid => {
                const { frame, page, isNew } = findOrAllocPage()
                const blockNo = frame.blockNo
                let slot = findDeadSlot(page)
                if (slot < 0) slot = 0
                page.setAlive(slot, true)
                page.writeValue(slot, valueType, value)
                if (isNew) page.setHeader({ kind: 'data' })
                const free = computeFree(page)
                unpin(frame, true)
                fsm.update(relId, HEAP_FORK, blockNo, free)
                return [blockNo, slot]
        }
        const read = (rid: Rid): any => {
                const frame = pinPage(rid[0])
                const page = createPage(frame.bytes)
                if (!page.isAlive(rid[1])) {
                        unpin(frame, false)
                        return undefined
                }
                const v = page.readValue(rid[1], valueType)
                unpin(frame, false)
                return v
        }
        const update = (rid: Rid, value: any): Rid => {
                const frame = pinPage(rid[0])
                const page = createPage(frame.bytes)
                if (!page.isAlive(rid[1])) {
                        unpin(frame, false)
                        return rid
                }
                page.writeValue(rid[1], valueType, value)
                unpin(frame, true)
                return rid
        }
        const remove = (rid: Rid): void => {
                const frame = pinPage(rid[0])
                const page = createPage(frame.bytes)
                page.setAlive(rid[1], false)
                const free = computeFree(page)
                unpin(frame, true)
                fsm.update(relId, HEAP_FORK, rid[0], free)
        }
        const scan = (emit: (rid: Rid, value: any) => boolean | void): void => {
                const n = smgr.nBlocks(relId, HEAP_FORK)
                for (let blockNo = 0; blockNo < n; blockNo++) {
                        const frame = pinPage(blockNo, 'bulk_read')
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
                        unpin(frame, false)
                        if (stop) return
                }
        }
        return { insert, read, update, delete: remove, scan }
}

export type Heap = ReturnType<typeof createHeap>

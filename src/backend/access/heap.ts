import { NONE, type Rid } from '../storage/page'

export type HeapPage = { id: number; count: number; live: number; alive: Uint8Array }
export type HeapMeta = { next: number; pages: number; tuples: number; live: number; pageCapacity: number; head: number; tail: number }
export type HeapOptions = { pageCapacity?: number }

const hasRoom = (p: HeapPage, cap: number) => p.count < cap || p.live < cap
const isLive = (p: HeapPage | undefined, slot: number) => p !== undefined && slot >= 0 && slot < p.count && p.alive[slot] === 1

const firstFree = (p: HeapPage, cap: number) => {
        if (p.count < cap) return p.count
        for (let i = 0; i < cap; i++) if (p.alive[i] === 0) return i
        return NONE
}

export const createHeap = <T = unknown>({ pageCapacity = 256 }: HeapOptions = {}) => {
        const meta: HeapMeta = { next: 1, pages: 0, tuples: 0, live: 0, pageCapacity, head: NONE, tail: NONE }
        const pages = new Map<number, HeapPage>()
        const data = new Map<number, T[]>()
        const order: number[] = []
        const getPage = (id: number) => pages.get(id) as HeapPage
        const getData = (id: number) => data.get(id) as T[]
        const createPage = () => {
                const p: HeapPage = { id: meta.next++, count: 0, live: 0, alive: new Uint8Array(pageCapacity) }
                pages.set(p.id, p)
                data.set(p.id, new Array(pageCapacity))
                order.push(p.id)
                meta.pages += 1
                if (meta.head === NONE) meta.head = p.id
                meta.tail = p.id
                return p
        }
        const writable = () => {
                if (meta.tail === NONE) return createPage()
                const tail = getPage(meta.tail)
                if (hasRoom(tail, pageCapacity)) return tail
                for (const id of order) {
                        const p = getPage(id)
                        if (hasRoom(p, pageCapacity)) return p
                }
                return createPage()
        }
        const liveTuple = (rid: Rid) => {
                const p = pages.get(rid[0])
                if (!isLive(p, rid[1])) return undefined
                return { page: p, data: getData(rid[0]) }
        }
        const insert = (value: T): Rid => {
                const p = writable()
                const slot = firstFree(p, pageCapacity)
                getData(p.id)[slot] = value
                p.alive[slot] = 1
                if (slot === p.count) p.count += 1
                p.live += 1
                meta.tuples += 1
                meta.live += 1
                return [p.id, slot]
        }
        const read = (rid: Rid) => liveTuple(rid)?.data[rid[1]]
        const update = (rid: Rid, value: T) => {
                const tuple = liveTuple(rid)
                if (tuple === undefined) return false
                tuple.data[rid[1]] = value
                return true
        }
        const deleteRid = (rid: Rid) => {
                const tuple = liveTuple(rid)
                if (!tuple?.page) return false
                tuple.page.alive[rid[1]] = 0
                tuple.page.live -= 1
                meta.live -= 1
                return true
        }
        const scan = (emit: (rid: Rid, value: T) => boolean) => {
                for (const id of order)
                        for (let i = 0, p = getPage(id), buf = getData(id); i < p.count; i++) {
                                if (p.alive[i] === 0) continue
                                if (!emit([id, i], buf[i])) return
                        }
        }
        const vacuum = () => {
                let removed = 0
                for (const id of order) {
                        const p = getPage(id)
                        const buf = getData(id)
                        let write = 0
                        for (let read = 0; read < p.count; read++) {
                                if (p.alive[read] === 0) continue
                                if (write !== read) buf[write] = buf[read]
                                write += 1
                        }
                        buf.fill(undefined as T, write, p.count)
                        p.alive.fill(1, 0, write)
                        p.alive.fill(0, write, pageCapacity)
                        removed += p.count - write
                        p.count = write
                }
                meta.tuples = meta.live
                return removed
        }
        const bulkLoad = (values: Iterable<T>) => Array.from(values, insert)
        const stats = () => ({ pages: meta.pages, tuples: meta.tuples, live: meta.live, pageCapacity, head: meta.head, tail: meta.tail })
        return { meta, pages, insert, read, update, deleteRid, scan, vacuum, bulkLoad, stats }
}

export type Heap<T = unknown> = ReturnType<typeof createHeap<T>>
export type { Rid }

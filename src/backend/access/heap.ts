// import { NONE, type Rid } from '../storage/page'

// export type HeapPage = { id: number; count: number; live: number; alive: Uint8Array }
// export type HeapMeta = { next: number; pages: number; tuples: number; live: number; pageCapacity: number; head: number; tail: number }
// export type HeapOptions = { pageCapacity?: number }

// const hasRoom = (p: HeapPage, cap: number) => p.count < cap || p.live < cap
// const isLive = (p: HeapPage | undefined, slot: number) => p !== undefined && slot >= 0 && slot < p.count && p.alive[slot] === 1

// const firstFree = (p: HeapPage, cap: number) => {
//         if (p.count < cap) return p.count
//         for (let i = 0; i < cap; i++) if (p.alive[i] === 0) return i
//         return NONE
// }

// export const createHeap = <T = unknown>({ pageCapacity = 256 }: HeapOptions = {}) => {
//         const meta: HeapMeta = { next: 1, pages: 0, tuples: 0, live: 0, pageCapacity, head: NONE, tail: NONE }
//         const pages = new Map<number, HeapPage>()
//         const _data = new Map<number, T[]>()
//         const _order: number[] = []
//         const _getPage = (id: number) => pages.get(id) as HeapPage
//         const _getData = (id: number) => _data.get(id) as T[]
//         const _createPage = () => {
//                 const p: HeapPage = { id: meta.next++, count: 0, live: 0, alive: new Uint8Array(pageCapacity) }
//                 pages.set(p.id, p)
//                 _data.set(p.id, new Array(pageCapacity))
//                 _order.push(p.id)
//                 meta.pages += 1
//                 if (meta.head === NONE) meta.head = p.id
//                 meta.tail = p.id
//                 return p
//         }
//         const _writable = () => {
//                 if (meta.tail === NONE) return _createPage()
//                 const tail = _getPage(meta.tail)
//                 if (hasRoom(tail, pageCapacity)) return tail
//                 for (const id of _order) {
//                         const p = _getPage(id)
//                         if (hasRoom(p, pageCapacity)) return p
//                 }
//                 return _createPage()
//         }
//         const _liveTuple = (rid: Rid) => {
//                 const p = pages.get(rid[0])
//                 if (!isLive(p, rid[1])) return undefined
//                 return { page: p, data: _getData(rid[0]) }
//         }
//         const insert = (value: T): Rid => {
//                 const p = _writable()
//                 const slot = firstFree(p, pageCapacity)
//                 _getData(p.id)[slot] = value
//                 p.alive[slot] = 1
//                 if (slot === p.count) p.count += 1
//                 p.live += 1
//                 meta.tuples += 1
//                 meta.live += 1
//                 return [p.id, slot]
//         }
//         return {
//                 meta,
//                 pages,
//                 insert,
//                 read(rid: Rid) {
//                         return _liveTuple(rid)?.data[rid[1]]
//                 },
//                 update(rid: Rid, value: T) {
//                         const tuple = _liveTuple(rid)
//                         if (tuple === undefined) return false
//                         tuple.data[rid[1]] = value
//                         return true
//                 },
//                 deleteRid(rid: Rid) {
//                         const tuple = _liveTuple(rid)
//                         if (!tuple?.page) return false
//                         tuple.page.alive[rid[1]] = 0
//                         tuple.page.live -= 1
//                         meta.live -= 1
//                         return true
//                 },
//                 scan(emit: (rid: Rid, value: T) => boolean) {
//                         for (const id of _order)
//                                 for (let i = 0, p = _getPage(id), buf = _getData(id); i < p.count; i++) {
//                                         if (p.alive[i] === 0) continue
//                                         if (!emit([id, i], buf[i])) return
//                                 }
//                 },
//                 vacuum() {
//                         let removed = 0
//                         for (const id of _order) {
//                                 const p = _getPage(id)
//                                 const buf = _getData(id)
//                                 let write = 0
//                                 for (let read = 0; read < p.count; read++) {
//                                         if (p.alive[read] === 0) continue
//                                         if (write !== read) buf[write] = buf[read]
//                                         write += 1
//                                 }
//                                 buf.fill(undefined as T, write, p.count)
//                                 p.alive.fill(1, 0, write)
//                                 p.alive.fill(0, write, pageCapacity)
//                                 removed += p.count - write
//                                 p.count = write
//                         }
//                         meta.tuples = meta.live
//                         return removed
//                 },
//                 bulkLoad(values: Iterable<T>) {
//                         return Array.from(values, insert)
//                 },
//                 stats() {
//                         return { pages: meta.pages, tuples: meta.tuples, live: meta.live, pageCapacity, head: meta.head, tail: meta.tail }
//                 },
//         }
// }

// export type Heap<T = unknown> = ReturnType<typeof createHeap<T>>
// export type { Rid }

import { NONE } from '../storage/page'
import type { Rid } from '../storage/page'
export type HeapPage = { id: number; count: number; live: number; alive: Uint8Array }
export type HeapMeta = { next: number; pages: number; tuples: number; live: number; pageCapacity: number; head: number; tail: number }
export type HeapOptions = { pageCapacity?: number }
export const createHeap = <T = unknown>({ pageCapacity = 256 }: HeapOptions = {}) => {
        const meta: HeapMeta = { next: 1, pages: 0, tuples: 0, live: 0, pageCapacity, head: NONE, tail: NONE }
        const pages = new Map<number, HeapPage>()
        const data = new Map<number, T[]>()
        const order: number[] = []
        const _page = (): HeapPage => {
                const p: HeapPage = { id: meta.next++, count: 0, live: 0, alive: new Uint8Array(pageCapacity) }
                pages.set(p.id, p)
                data.set(p.id, new Array(pageCapacity))
                order.push(p.id)
                meta.pages += 1
                if (meta.head === NONE) meta.head = p.id
                meta.tail = p.id
                return p
        }
        const _tail = () => (meta.tail === NONE ? _page() : (pages.get(meta.tail) as HeapPage))
        const _findFree = (): HeapPage => {
                const tail = _tail()
                if (tail.count < pageCapacity) return tail
                for (const id of order) {
                        const p = pages.get(id) as HeapPage
                        if (p.live < pageCapacity) return p
                }
                return _page()
        }
        const _slot = (p: HeapPage) => {
                if (p.count < pageCapacity) return p.count
                for (let i = 0; i < pageCapacity; i++) if (p.alive[i] === 0) return i
                return -1
        }
        return {
                meta,
                pages,
                insert(value: T): Rid {
                        const p = _findFree()
                        const slot = _slot(p)
                        const buf = data.get(p.id) as T[]
                        buf[slot] = value
                        p.alive[slot] = 1
                        if (slot >= p.count) p.count = slot + 1
                        p.live += 1
                        meta.tuples += 1
                        meta.live += 1
                        return [p.id, slot]
                },
                read(rid: Rid): T | undefined {
                        const p = pages.get(rid[0])
                        if (p === undefined || p.alive[rid[1]] === 0) return undefined
                        return (data.get(rid[0]) as T[])[rid[1]]
                },
                update(rid: Rid, value: T): boolean {
                        const p = pages.get(rid[0])
                        if (p === undefined || p.alive[rid[1]] === 0) return false
                        ;(data.get(rid[0]) as T[])[rid[1]] = value
                        return true
                },
                deleteRid(rid: Rid): boolean {
                        const p = pages.get(rid[0])
                        if (p === undefined || p.alive[rid[1]] === 0) return false
                        p.alive[rid[1]] = 0
                        p.live -= 1
                        meta.live -= 1
                        return true
                },
                scan(emit: (rid: Rid, value: T) => boolean): void {
                        for (const id of order) {
                                const p = pages.get(id) as HeapPage
                                const buf = data.get(id) as T[]
                                for (let i = 0; i < p.count; i++) {
                                        if (p.alive[i] === 0) continue
                                        if (!emit([id, i], buf[i])) return
                                }
                        }
                },
                vacuum(): number {
                        let removed = 0
                        for (const id of order) {
                                const p = pages.get(id) as HeapPage
                                const buf = data.get(id) as T[]
                                let w = 0
                                for (let r = 0; r < p.count; r++) {
                                        if (p.alive[r] === 0) continue
                                        if (w !== r) buf[w] = buf[r]
                                        w += 1
                                }
                                for (let i = w; i < p.count; i++) buf[i] = undefined as T
                                p.alive.fill(1, 0, w)
                                p.alive.fill(0, w, pageCapacity)
                                removed += p.count - w
                                p.count = w
                        }
                        meta.tuples = meta.live
                        return removed
                },
                bulkLoad(values: Iterable<T>): Rid[] {
                        const rids: Rid[] = []
                        for (const v of values) rids.push(this.insert(v))
                        return rids
                },
                stats() {
                        return { pages: meta.pages, tuples: meta.tuples, live: meta.live, pageCapacity, head: meta.head, tail: meta.tail }
                },
        }
}
export type Heap<T = unknown> = ReturnType<typeof createHeap<T>>
export type { Rid }

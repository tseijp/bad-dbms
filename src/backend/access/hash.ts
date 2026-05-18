import type { Page } from '../storage/page'

const F_BUCKET_PRIMARY = 1 << 0
const F_OVERFLOW = 1 << 1
const F_BITMAP = 1 << 2
const F_META = 1 << 3
const F_BUCKET_BEING_SPLIT = 1 << 4
const F_BUCKET_BEING_POPULATED = 1 << 5
const F_SPLIT_CLEANUP = 1 << 6
const T_MOVED_BY_SPLIT = 1 << 0
const T_DEAD = 1 << 1
const P_NONE = 0
const BITS_PER_BITMAP = 4096

export type Rid = [number, number]
export type HashCode = number
export type HashFn<K> = (key: K) => HashCode
export type EqFn<K> = (a: K, b: K) => boolean

type Entry<K> = { hash: HashCode; key: K; rid: Rid; flags: number }
type BucketHeader = { bucketNo: number; splitPrevCount: number; flags: number; nextOvfl: number; prevOvfl: number }
type BucketPage<K> = { id: number; kind: number; header: BucketHeader; entries: Entry<K>[] }
type BitmapPage = { id: number; kind: number; bits: Uint32Array }
type MetaPage = { id: number; kind: number; bucketCount: number; highMask: number; lowMask: number; spares: number[]; firstFreeBit: number; ovflPoint: number; tupleCount: number; targetLoadFactor: number; bitmapPages: number[] }
type AnyPage<K> = BucketPage<K> | BitmapPage | MetaPage

const seltzerHash = (s: string): HashCode => {
        let h = 0
        for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0
        return h >>> 0
}

const defaultHash: HashFn<unknown> = (k) => {
        if (typeof k === 'number') return Math.imul(k as number, 2654435761) >>> 0
        if (typeof k === 'string') return seltzerHash(k as string)
        return seltzerHash(String(k))
}

const defaultEq: EqFn<unknown> = (a, b) => a === b

const splitGroupPhases = (group: number): number => (group < 10 ? 1 : 4)
const bucketsInGroup = (group: number): number => (group === 0 ? 2 : 1 << group)
const phaseSize = (group: number): number => bucketsInGroup(group) / splitGroupPhases(group)

const bucketMaskFor = (count: number): { high: number; low: number } => {
        if (count <= 1) return { high: 0, low: 0 }
        const high = (1 << Math.ceil(Math.log2(count))) - 1
        const low = high >>> 1
        return { high, low }
}

const targetBucket = (hash: HashCode, highMask: number, lowMask: number, bucketCount: number): number => {
        const b = hash & highMask
        if (b < bucketCount) return b
        return hash & lowMask
}

export const createHashIndex = <K = unknown>(opts: { pageCapacity?: number; loadFactor?: number; initialBuckets?: number; hash?: HashFn<K>; equal?: EqFn<K> } = {}) => {
        const pageCapacity = opts.pageCapacity ?? 64
        const loadFactor = opts.loadFactor ?? 4
        const hashFn = opts.hash ?? (defaultHash as HashFn<K>)
        const eqFn = opts.equal ?? (defaultEq as EqFn<K>)
        const pages = new Map<number, AnyPage<K>>()
        let nextPageId = 1
        const allocId = () => nextPageId++

        const allocBucket = (bucketNo: number, primary: boolean, splitPrevCount: number): BucketPage<K> => {
                const id = allocId()
                const header: BucketHeader = { bucketNo, splitPrevCount, flags: 0, nextOvfl: P_NONE, prevOvfl: P_NONE }
                const page: BucketPage<K> = { id, kind: primary ? F_BUCKET_PRIMARY : F_OVERFLOW, header, entries: [] }
                pages.set(id, page)
                return page
        }

        const allocBitmap = (): BitmapPage => {
                const id = allocId()
                const page: BitmapPage = { id, kind: F_BITMAP, bits: new Uint32Array(BITS_PER_BITMAP >>> 5) }
                pages.set(id, page)
                return page
        }

        const meta: MetaPage = {
                id: allocId(),
                kind: F_META,
                bucketCount: 0,
                highMask: 0,
                lowMask: 0,
                spares: [0],
                firstFreeBit: 0,
                ovflPoint: 0,
                tupleCount: 0,
                targetLoadFactor: loadFactor,
                bitmapPages: [],
        }
        pages.set(meta.id, meta)
        const bucketIdByNo = new Map<number, number>()

        const installBucket = (no: number, primary: BucketPage<K>) => bucketIdByNo.set(no, primary.id)
        const getPrimaryByNo = (no: number): BucketPage<K> => pages.get(bucketIdByNo.get(no) as number) as BucketPage<K>

        const initIndex = (initialBuckets: number) => {
                const n = Math.max(2, 1 << Math.ceil(Math.log2(initialBuckets)))
                for (let i = 0; i < n; i++) installBucket(i, allocBucket(i, true, n))
                meta.bucketCount = n
                const { high, low } = bucketMaskFor(n)
                meta.highMask = high
                meta.lowMask = low
                const bm = allocBitmap()
                meta.bitmapPages.push(bm.id)
                bm.bits[0] |= 1
        }

        initIndex(opts.initialBuckets ?? 2)

        const bitmapMarkUsed = (bit: number) => {
                const bm = pages.get(meta.bitmapPages[bit >>> 12] as number) as BitmapPage
                bm.bits[(bit & 0xfff) >>> 5] |= 1 << (bit & 31)
        }
        const bitmapClear = (bit: number) => {
                const bm = pages.get(meta.bitmapPages[bit >>> 12] as number) as BitmapPage
                bm.bits[(bit & 0xfff) >>> 5] &= ~(1 << (bit & 31))
        }
        const findFreeBit = (): number => {
                for (let b = meta.firstFreeBit; b < meta.bitmapPages.length * BITS_PER_BITMAP; b++) {
                        const bm = pages.get(meta.bitmapPages[b >>> 12] as number) as BitmapPage
                        const w = bm.bits[(b & 0xfff) >>> 5]
                        if (((w >>> (b & 31)) & 1) === 0) return b
                }
                const bm = allocBitmap()
                meta.bitmapPages.push(bm.id)
                bm.bits[0] |= 1
                return meta.bitmapPages.length * BITS_PER_BITMAP - BITS_PER_BITMAP + 1
        }

        const acquireOverflow = (prevId: number): BucketPage<K> => {
                const bit = findFreeBit()
                bitmapMarkUsed(bit)
                if (bit === meta.firstFreeBit) meta.firstFreeBit = bit + 1
                const ovfl = allocBucket(-1, false, 0)
                ovfl.header.prevOvfl = prevId
                const prev = pages.get(prevId) as BucketPage<K>
                prev.header.nextOvfl = ovfl.id
                meta.spares[meta.ovflPoint] = (meta.spares[meta.ovflPoint] ?? 0) + 1
                return ovfl
        }

        const releaseOverflow = (page: BucketPage<K>) => {
                const prev = page.header.prevOvfl !== P_NONE ? (pages.get(page.header.prevOvfl) as BucketPage<K>) : undefined
                const next = page.header.nextOvfl !== P_NONE ? (pages.get(page.header.nextOvfl) as BucketPage<K>) : undefined
                if (prev) prev.header.nextOvfl = page.header.nextOvfl
                if (next) next.header.prevOvfl = page.header.prevOvfl
                pages.delete(page.id)
        }

        const bucketChain = (primary: BucketPage<K>): BucketPage<K>[] => {
                const chain: BucketPage<K>[] = [primary]
                let cur = primary
                while (cur.header.nextOvfl !== P_NONE) {
                        cur = pages.get(cur.header.nextOvfl) as BucketPage<K>
                        chain.push(cur)
                }
                return chain
        }

        const findInsertPos = (entries: Entry<K>[], hash: HashCode): number => {
                let lo = 0,
                        hi = entries.length
                while (lo < hi) {
                        const mid = (lo + hi) >>> 1
                        if (entries[mid].hash < hash) lo = mid + 1
                        else hi = mid
                }
                return lo
        }

        const insertIntoBucket = (primary: BucketPage<K>, entry: Entry<K>) => {
                const chain = bucketChain(primary)
                for (const page of chain) {
                        const deadIdx = page.entries.findIndex((e) => (e.flags & T_DEAD) !== 0)
                        if (page.entries.length < pageCapacity || deadIdx >= 0) {
                                if (deadIdx >= 0 && page.entries.length >= pageCapacity) page.entries.splice(deadIdx, 1)
                                const pos = findInsertPos(page.entries, entry.hash)
                                page.entries.splice(pos, 0, entry)
                                return
                        }
                }
                const last = chain[chain.length - 1]
                const ovfl = acquireOverflow(last.id)
                ovfl.entries.push(entry)
        }

        const shouldSplit = () => meta.tupleCount > meta.bucketCount * meta.targetLoadFactor * (pageCapacity / 4)

        const decideSplitTarget = (): number => {
                const next = meta.bucketCount
                return next & meta.lowMask
        }

        const doSplit = () => {
                const oldNo = decideSplitTarget()
                const newNo = meta.bucketCount
                const oldPrimary = getPrimaryByNo(oldNo)
                if ((oldPrimary.header.flags & (F_BUCKET_BEING_SPLIT | F_SPLIT_CLEANUP)) !== 0) return
                const newPrimary = allocBucket(newNo, true, meta.bucketCount + 1)
                installBucket(newNo, newPrimary)
                oldPrimary.header.flags |= F_BUCKET_BEING_SPLIT
                newPrimary.header.flags |= F_BUCKET_BEING_POPULATED
                meta.bucketCount += 1
                const { high, low } = bucketMaskFor(meta.bucketCount)
                meta.highMask = high
                meta.lowMask = low
                relocate(oldPrimary, newPrimary)
                oldPrimary.header.flags &= ~F_BUCKET_BEING_SPLIT
                oldPrimary.header.flags |= F_SPLIT_CLEANUP
                newPrimary.header.flags &= ~F_BUCKET_BEING_POPULATED
        }

        const relocate = (oldPrimary: BucketPage<K>, newPrimary: BucketPage<K>) => {
                for (const page of bucketChain(oldPrimary)) {
                        const keep: Entry<K>[] = []
                        for (const e of page.entries) {
                                const target = targetBucket(e.hash, meta.highMask, meta.lowMask, meta.bucketCount)
                                if (target === newPrimary.header.bucketNo) {
                                        insertIntoBucket(newPrimary, { ...e, flags: e.flags | T_MOVED_BY_SPLIT })
                                        continue
                                }
                                keep.push(e)
                        }
                        page.entries = keep
                }
        }

        const finishSplitCleanup = (primary: BucketPage<K>) => {
                if ((primary.header.flags & F_SPLIT_CLEANUP) === 0) return
                for (const page of bucketChain(primary)) page.entries = page.entries.filter((e) => (e.flags & T_MOVED_BY_SPLIT) === 0 || targetBucket(e.hash, meta.highMask, meta.lowMask, meta.bucketCount) === primary.header.bucketNo)
                primary.header.flags &= ~F_SPLIT_CLEANUP
        }

        const insert = (key: K, rid: Rid): void => {
                const h = hashFn(key)
                const no = targetBucket(h, meta.highMask, meta.lowMask, meta.bucketCount)
                const primary = getPrimaryByNo(no)
                if ((primary.header.flags & F_SPLIT_CLEANUP) !== 0) finishSplitCleanup(primary)
                insertIntoBucket(primary, { hash: h, key, rid, flags: 0 })
                meta.tupleCount += 1
                if (shouldSplit()) doSplit()
        }

        const lookup = (key: K, emit: (rid: Rid) => boolean): void => {
                const h = hashFn(key)
                const no = targetBucket(h, meta.highMask, meta.lowMask, meta.bucketCount)
                const primary = getPrimaryByNo(no)
                const buckets: BucketPage<K>[] = [primary]
                if ((primary.header.flags & F_BUCKET_BEING_POPULATED) !== 0) {
                        const oldNo = primary.header.bucketNo & meta.lowMask
                        if (oldNo !== primary.header.bucketNo) buckets.push(getPrimaryByNo(oldNo))
                }
                for (const start of buckets) {
                        for (const page of bucketChain(start)) {
                                const sameHash: Entry<K>[] = []
                                let lo = 0,
                                        hi = page.entries.length
                                while (lo < hi) {
                                        const mid = (lo + hi) >>> 1
                                        if (page.entries[mid].hash < h) lo = mid + 1
                                        else hi = mid
                                }
                                for (let i = lo; i < page.entries.length && page.entries[i].hash === h; i++) sameHash.push(page.entries[i])
                                for (const e of sameHash) {
                                        if ((e.flags & T_DEAD) !== 0) continue
                                        if (start !== primary && (e.flags & T_MOVED_BY_SPLIT) !== 0) continue
                                        if (!eqFn(e.key, key)) continue
                                        if (!emit(e.rid)) return
                                }
                        }
                }
        }

        const deleteKey = (key: K, rid?: Rid): boolean => {
                const h = hashFn(key)
                const no = targetBucket(h, meta.highMask, meta.lowMask, meta.bucketCount)
                const primary = getPrimaryByNo(no)
                for (const page of bucketChain(primary)) {
                        const idx = page.entries.findIndex((e) => e.hash === h && eqFn(e.key, key) && (rid === undefined || (e.rid[0] === rid[0] && e.rid[1] === rid[1])))
                        if (idx < 0) continue
                        page.entries[idx].flags |= T_DEAD
                        meta.tupleCount -= 1
                        return true
                }
                return false
        }

        const vacuum = (): number => {
                let removed = 0
                for (let no = 0; no < meta.bucketCount; no++) {
                        const primary = getPrimaryByNo(no)
                        for (const page of bucketChain(primary)) {
                                const before = page.entries.length
                                page.entries = page.entries.filter((e) => (e.flags & T_DEAD) === 0)
                                removed += before - page.entries.length
                        }
                        squeeze(primary)
                }
                return removed
        }

        const squeeze = (primary: BucketPage<K>) => {
                const chain = bucketChain(primary)
                for (let i = chain.length - 1; i > 0; i--) {
                        const src = chain[i]
                        if (src.entries.length === 0) {
                                releaseOverflow(src)
                                continue
                        }
                        for (let j = 0; j < i; j++) {
                                const dst = chain[j]
                                while (src.entries.length > 0 && dst.entries.length < pageCapacity) {
                                        const e = src.entries.shift() as Entry<K>
                                        const pos = findInsertPos(dst.entries, e.hash)
                                        dst.entries.splice(pos, 0, e)
                                }
                                if (src.entries.length === 0) break
                        }
                        if (src.entries.length === 0) releaseOverflow(src)
                }
        }

        const bulkLoad = (entries: Iterable<[K, Rid]>): void => {
                for (const [k, r] of entries) insert(k, r)
        }

        const stats = () => ({ buckets: meta.bucketCount, tuples: meta.tupleCount, pages: pages.size, highMask: meta.highMask, lowMask: meta.lowMask, ovflBits: meta.spares[meta.ovflPoint] ?? 0 })

        return { insert, lookup, deleteKey, vacuum, bulkLoad, stats, _pages: pages, _meta: meta }
}

export type HashIndex<K = unknown> = ReturnType<typeof createHashIndex<K>>
export type { Page }

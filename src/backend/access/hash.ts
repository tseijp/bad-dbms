import type { Page } from '../storage/page'

export type Rid = [number, number]
export type HashCode = number
export type HashFn<K> = (key: K) => HashCode
export type EqFn<K> = (a: K, b: K) => boolean

type Entry<K> = { hash: HashCode; key: K; rid: Rid; dead: boolean }
type BucketPage<K> = { id: number; bucket: number; next: number; entries: Entry<K>[] }
type Meta = { buckets: number; highMask: number; lowMask: number; tuples: number; pageCapacity: number; loadFactor: number }

const NONE = 0

const stringHash = (value: string): HashCode => {
        let hash = 0
        for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 33) + value.charCodeAt(i)) | 0
        return hash >>> 0
}

const defaultHash: HashFn<unknown> = (key) => {
        if (typeof key === 'number') return Math.imul(key, 2654435761) >>> 0
        if (typeof key === 'string') return stringHash(key)
        return stringHash(String(key))
}

const defaultEq: EqFn<unknown> = (a, b) => a === b

const maskFor = (buckets: number) => {
        const highMask = (1 << Math.ceil(Math.log2(buckets))) - 1
        return { highMask, lowMask: highMask >>> 1 }
}

const bucketFor = (hash: HashCode, meta: Meta) => {
        const bucket = hash & meta.highMask
        if (bucket < meta.buckets) return bucket
        return hash & meta.lowMask
}

const lowerBound = <K>(entries: Entry<K>[], hash: HashCode) => {
        let lo = 0
        let hi = entries.length
        while (lo < hi) {
                const mid = (lo + hi) >>> 1
                if (entries[mid].hash < hash) lo = mid + 1
                if (entries[mid].hash >= hash) hi = mid
        }
        return lo
}

const sameRid = (a: Rid, b: Rid) => a[0] === b[0] && a[1] === b[1]

export const createHashIndex = <K = unknown>(opts: { pageCapacity?: number; loadFactor?: number; initialBuckets?: number; hash?: HashFn<K>; equal?: EqFn<K> } = {}) => {
        const hashFn = opts.hash ?? (defaultHash as HashFn<K>)
        const eqFn = opts.equal ?? (defaultEq as EqFn<K>)
        const pageCapacity = opts.pageCapacity ?? 64
        const loadFactor = opts.loadFactor ?? 1
        const initialSize = Math.max(2, opts.initialBuckets ?? 2)
        const initialBuckets = 1 << Math.ceil(Math.log2(initialSize))
        const pages = new Map<number, BucketPage<K>>()
        const roots = new Map<number, number>()
        let nextPage = 1
        const meta: Meta = { buckets: initialBuckets, ...maskFor(initialBuckets), tuples: 0, pageCapacity, loadFactor }
        const page = (bucket: number): BucketPage<K> => {
                const p = { id: nextPage++, bucket, next: NONE, entries: [] }
                pages.set(p.id, p)
                return p
        }
        const root = (bucket: number) => pages.get(roots.get(bucket) as number) as BucketPage<K>
        const chain = (start: BucketPage<K>) => {
                const out = [start]
                let cur = start
                while (cur.next !== NONE) {
                        cur = pages.get(cur.next) as BucketPage<K>
                        out.push(cur)
                }
                return out
        }
        const append = (bucket: BucketPage<K>, entry: Entry<K>) => {
                const pages = chain(bucket)
                for (const p of pages) {
                        const dead = p.entries.findIndex((e) => e.dead)
                        if (dead >= 0) p.entries.splice(dead, 1)
                        if (p.entries.length >= pageCapacity) continue
                        p.entries.splice(lowerBound(p.entries, entry.hash), 0, entry)
                        return
                }
                const tail = pages[pages.length - 1]
                const next = page(bucket.bucket)
                tail.next = next.id
                next.entries.push(entry)
        }
        const put = (key: K, rid: Rid, hash = hashFn(key)) => {
                append(root(bucketFor(hash, meta)), { hash, key, rid, dead: false })
                meta.tuples += 1
        }
        const move = (from: BucketPage<K>) => {
                const bucketPages = chain(from)
                const entries = bucketPages.flatMap((p) => p.entries.filter((e) => !e.dead))
                for (const p of bucketPages.slice(1)) pages.delete(p.id)
                from.next = NONE
                from.entries = []
                for (const e of entries) append(root(bucketFor(e.hash, meta)), e)
        }
        const split = () => {
                const oldBucket = meta.buckets & meta.lowMask
                const newBucket = meta.buckets
                roots.set(newBucket, page(newBucket).id)
                meta.buckets += 1
                Object.assign(meta, maskFor(meta.buckets))
                move(root(oldBucket))
        }
        const insert = (key: K, rid: Rid): void => {
                put(key, rid)
                if (meta.tuples <= meta.buckets * pageCapacity * loadFactor) return
                split()
        }
        const lookup = (key: K, emit: (rid: Rid) => boolean): void => {
                const hash = hashFn(key)
                for (const p of chain(root(bucketFor(hash, meta)))) {
                        for (let i = lowerBound(p.entries, hash); i < p.entries.length && p.entries[i].hash === hash; i++) {
                                const e = p.entries[i]
                                if (e.dead || !eqFn(e.key, key)) continue
                                if (!emit(e.rid)) return
                        }
                }
        }
        const deleteKey = (key: K, rid?: Rid): boolean => {
                const hash = hashFn(key)
                for (const p of chain(root(bucketFor(hash, meta)))) {
                        for (let i = lowerBound(p.entries, hash); i < p.entries.length && p.entries[i].hash === hash; i++) {
                                const e = p.entries[i]
                                if (e.dead || !eqFn(e.key, key)) continue
                                if (rid !== undefined && !sameRid(e.rid, rid)) continue
                                e.dead = true
                                meta.tuples -= 1
                                return true
                        }
                }
                return false
        }
        const compact = (bucket: BucketPage<K>) => {
                const entries = chain(bucket).flatMap((p) => p.entries)
                const live = entries.filter((e) => !e.dead)
                for (const p of chain(bucket).slice(1)) pages.delete(p.id)
                bucket.next = NONE
                bucket.entries = []
                for (const e of live) append(bucket, e)
                return entries.length - live.length
        }
        const vacuum = (): number => {
                let removed = 0
                for (let bucket = 0; bucket < meta.buckets; bucket++) removed += compact(root(bucket))
                return removed
        }
        const bulkLoad = (entries: Iterable<[K, Rid]>): void => {
                for (const [key, rid] of entries) insert(key, rid)
        }
        const stats = () => ({ buckets: meta.buckets, tuples: meta.tuples, pages: pages.size, highMask: meta.highMask, lowMask: meta.lowMask })
        for (let bucket = 0; bucket < initialBuckets; bucket++) roots.set(bucket, page(bucket).id)
        return { insert, lookup, deleteKey, vacuum, bulkLoad, stats, _pages: pages, _meta: meta }
}

export type HashIndex<K = unknown> = ReturnType<typeof createHashIndex<K>>
export type { Page }

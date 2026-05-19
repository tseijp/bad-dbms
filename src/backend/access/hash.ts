export type Rid = [number, number]
export type HashCode = number
export type HashFn<K> = (key: K) => HashCode
export type EqFn<K> = (a: K, b: K) => boolean
type Entry<K> = { hash: HashCode; key: K; rid: Rid; dead: boolean }
type BucketPage<K> = { id: number; bucket: number; next: number; entries: Entry<K>[] }
type Meta = { buckets: number; highMask: number; lowMask: number; tuples: number; pageCapacity: number; loadFactor: number }
const _NONE = 0
const _stringHash = (value: string): HashCode => {
        let hash = 0
        for (let i = 0; i < value.length; i++) hash = (Math.imul(hash, 33) + value.charCodeAt(i)) | 0
        return hash >>> 0
}
const _defaultHash: HashFn<unknown> = (key) => {
        if (typeof key === 'number') return Math.imul(key, 2654435761) >>> 0
        if (typeof key === 'string') return _stringHash(key)
        return _stringHash(String(key))
}
const _defaultEq: EqFn<unknown> = (a, b) => a === b
const _maskFor = (buckets: number) => {
        const highMask = (1 << Math.ceil(Math.log2(buckets))) - 1
        return { highMask, lowMask: highMask >>> 1 }
}
const _bucketFor = (hash: HashCode, meta: Meta) => {
        const bucket = hash & meta.highMask
        if (bucket < meta.buckets) return bucket
        return hash & meta.lowMask
}
const _lowerBound = <K>(entries: Entry<K>[], hash: HashCode) => {
        let lo = 0
        let hi = entries.length
        while (lo < hi) {
                const mid = (lo + hi) >>> 1
                if (entries[mid].hash < hash) lo = mid + 1
                if (entries[mid].hash >= hash) hi = mid
        }
        return lo
}
const _sameRid = (a: Rid, b: Rid) => a[0] === b[0] && a[1] === b[1]
export const createHashIndex = <K = unknown>({ pageCapacity = 64, loadFactor = 1, initialBuckets = 2, hash = _defaultHash as HashFn<K>, equal = _defaultEq as EqFn<K> }: { pageCapacity?: number; loadFactor?: number; initialBuckets?: number; hash?: HashFn<K>; equal?: EqFn<K> } = {}) => {
        const _initialBuckets = 1 << Math.ceil(Math.log2(Math.max(2, initialBuckets)))
        const pages = new Map<number, BucketPage<K>>()
        const _roots = new Map<number, number>()
        let _nextPage = 1
        const meta: Meta = { buckets: _initialBuckets, ..._maskFor(_initialBuckets), tuples: 0, pageCapacity, loadFactor }
        const _page = (bucket: number): BucketPage<K> => {
                const p = { id: _nextPage++, bucket, next: _NONE, entries: [] }
                pages.set(p.id, p)
                return p
        }
        const _root = (bucket: number) => pages.get(_roots.get(bucket) as number) as BucketPage<K>
        const _chain = (start: BucketPage<K>) => {
                const out = [start]
                let cur = start
                while (cur.next !== _NONE) {
                        cur = pages.get(cur.next) as BucketPage<K>
                        out.push(cur)
                }
                return out
        }
        const _append = (bucket: BucketPage<K>, entry: Entry<K>) => {
                const list = _chain(bucket)
                for (const p of list) {
                        const dead = p.entries.findIndex((e) => e.dead)
                        if (dead >= 0) p.entries.splice(dead, 1)
                        if (p.entries.length >= pageCapacity) continue
                        p.entries.splice(_lowerBound(p.entries, entry.hash), 0, entry)
                        return
                }
                const tail = list[list.length - 1]
                const next = _page(bucket.bucket)
                tail.next = next.id
                next.entries.push(entry)
        }
        const _put = (key: K, rid: Rid, h = hash(key)) => {
                _append(_root(_bucketFor(h, meta)), { hash: h, key, rid, dead: false })
                meta.tuples += 1
        }
        const _move = (from: BucketPage<K>) => {
                const list = _chain(from)
                const entries = list.flatMap((p) => p.entries.filter((e) => !e.dead))
                for (const p of list.slice(1)) pages.delete(p.id)
                from.next = _NONE
                from.entries = []
                for (const e of entries) _append(_root(_bucketFor(e.hash, meta)), e)
        }
        const _split = () => {
                const oldBucket = meta.buckets & meta.lowMask
                const newBucket = meta.buckets
                _roots.set(newBucket, _page(newBucket).id)
                meta.buckets += 1
                Object.assign(meta, _maskFor(meta.buckets))
                _move(_root(oldBucket))
        }
        const _compact = (bucket: BucketPage<K>) => {
                const entries = _chain(bucket).flatMap((p) => p.entries)
                const live = entries.filter((e) => !e.dead)
                for (const p of _chain(bucket).slice(1)) pages.delete(p.id)
                bucket.next = _NONE
                bucket.entries = []
                for (const e of live) _append(bucket, e)
                return entries.length - live.length
        }
        for (let bucket = 0; bucket < _initialBuckets; bucket++) _roots.set(bucket, _page(bucket).id)
        return {
                pages,
                meta,
                insert(key: K, rid: Rid): void {
                        _put(key, rid)
                        if (meta.tuples <= meta.buckets * pageCapacity * loadFactor) return
                        _split()
                },
                lookup(key: K, emit: (rid: Rid) => boolean): void {
                        const h = hash(key)
                        for (const p of _chain(_root(_bucketFor(h, meta)))) {
                                for (let i = _lowerBound(p.entries, h); i < p.entries.length && p.entries[i].hash === h; i++) {
                                        const e = p.entries[i]
                                        if (e.dead || !equal(e.key, key)) continue
                                        if (!emit(e.rid)) return
                                }
                        }
                },
                deleteKey(key: K, rid?: Rid): boolean {
                        const h = hash(key)
                        for (const p of _chain(_root(_bucketFor(h, meta)))) {
                                for (let i = _lowerBound(p.entries, h); i < p.entries.length && p.entries[i].hash === h; i++) {
                                        const e = p.entries[i]
                                        if (e.dead || !equal(e.key, key)) continue
                                        if (rid !== undefined && !_sameRid(e.rid, rid)) continue
                                        e.dead = true
                                        meta.tuples -= 1
                                        return true
                                }
                        }
                        return false
                },
                vacuum(): number {
                        let removed = 0
                        for (let bucket = 0; bucket < meta.buckets; bucket++) removed += _compact(_root(bucket))
                        return removed
                },
                bulkLoad(entries: Iterable<[K, Rid]>): void {
                        for (const [key, rid] of entries) this.insert(key, rid)
                },
                stats() {
                        return { buckets: meta.buckets, tuples: meta.tuples, pages: pages.size, highMask: meta.highMask, lowMask: meta.lowMask }
                },
        }
}
export type HashIndex<K = unknown> = ReturnType<typeof createHashIndex<K>>

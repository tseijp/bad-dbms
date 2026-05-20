import { createPage } from '../storage/page'
export type Rid = [number, number]
export type HashFn = (key: number) => number
export type EqFn = (a: number, b: number) => boolean
export interface HashIndexOptions {
        buffer: any
        smgr: any
        fsm: any
        relId: number
        forkId: number
        hash?: HashFn
        equal?: EqFn
        initialBuckets?: number
        bucketCapacity?: number
}
const META_BLOCK = 0
const DEFAULT_BUCKETS = 2
const DEFAULT_CAP = 64
const ENTRY_BYTES = 12
const defaultHash: HashFn = (key) => Math.imul(key | 0, 2654435761) >>> 0
const defaultEq: EqFn = (a, b) => a === b
export const createHashIndex = ({ buffer, smgr, fsm, relId, forkId, hash = defaultHash, equal = defaultEq, initialBuckets = DEFAULT_BUCKETS, bucketCapacity = DEFAULT_CAP }: HashIndexOptions) => {
        const _pin = (b: number) => buffer.pin(relId, forkId, b)
        const _unpin = (f: any, d?: boolean) => buffer.unpin(f, d)
        const _ridOf = (e: any): Rid => [e.ridPageId, e.ridOffset]
        const _writeLeaf = (p: any, slot: number, key: number, rid: Rid) => p.writeLeafEntry(slot, key, { pageId: rid[0], offset: rid[1] })
        const _notifyFree = (block: number, used: number) => fsm.update(relId, forkId, block, (bucketCapacity - used) * ENTRY_BYTES)
        const _readMeta = () => {
                const f = _pin(META_BLOCK)
                const p = createPage(f.bytes)
                const nBuckets = p.readValue(0, 'i32')
                const splitPointer = p.readValue(1, 'i32')
                const level = p.readValue(2, 'i32')
                const tuples = p.readValue(3, 'i32')
                _unpin(f, false)
                return { nBuckets, splitPointer, level, tuples }
        }
        const _writeMeta = (m: any) => {
                const f = _pin(META_BLOCK)
                const p = createPage(f.bytes)
                p.writeValue(0, 'i32', m.nBuckets)
                p.writeValue(1, 'i32', m.splitPointer)
                p.writeValue(2, 'i32', m.level)
                p.writeValue(3, 'i32', m.tuples)
                _unpin(f, true)
        }
        const _ensureInit = () => {
                if (smgr.nBlocks(relId, forkId) > 0) return
                const meta = smgr.extend(relId, forkId)
                const fm = _pin(meta)
                const mp = createPage(fm.bytes)
                mp.setHeader({ kind: 'meta' })
                const lvl = Math.max(0, Math.ceil(Math.log2(Math.max(1, initialBuckets))))
                const n = 1 << lvl
                mp.writeValue(0, 'i32', n)
                mp.writeValue(1, 'i32', 0)
                mp.writeValue(2, 'i32', lvl)
                mp.writeValue(3, 'i32', 0)
                _unpin(fm, true)
                for (let i = 0; i < n; i++) {
                        const b = smgr.extend(relId, forkId)
                        const f = _pin(b)
                        const p = createPage(f.bytes)
                        p.setHeader({ kind: 'leaf', slotCount: 0, nextPageId: -1 })
                        _unpin(f, true)
                        _notifyFree(b, 0)
                }
        }
        const _bucketOf = (key: number, m: any): number => {
                const h = hash(key) >>> 0
                let b = h % (1 << m.level)
                if (b < m.splitPointer) b = h % (1 << (m.level + 1))
                return b
        }
        const _bucketBlock = (bucketIdx: number) => 1 + bucketIdx
        const _findDeadSlot = (p: any, count: number) => {
                for (let i = 0; i < count; i++) if (!p.isAlive(i)) return i
                return -1
        }
        const _insertToChain = (firstBlock: number, key: number, rid: Rid): void => {
                let cur = firstBlock
                while (true) {
                        const f = _pin(cur)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        const count = h.slotCount || 0
                        const dead = _findDeadSlot(p, count)
                        if (dead >= 0) {
                                _writeLeaf(p, dead, key, rid)
                                p.setAlive(dead, true)
                                _unpin(f, true)
                                _notifyFree(cur, count)
                                return
                        }
                        if (count < bucketCapacity) {
                                _writeLeaf(p, count, key, rid)
                                p.setAlive(count, true)
                                p.setHeader({ slotCount: count + 1 })
                                _unpin(f, true)
                                _notifyFree(cur, count + 1)
                                return
                        }
                        const next = h.nextPageId
                        if (next !== undefined && next >= 0) {
                                _unpin(f, false)
                                cur = next
                                continue
                        }
                        const newId = smgr.extend(relId, forkId)
                        p.setHeader({ nextPageId: newId })
                        _unpin(f, true)
                        const nf = _pin(newId)
                        const np = createPage(nf.bytes)
                        np.setHeader({ kind: 'leaf', slotCount: 1, nextPageId: -1 })
                        _writeLeaf(np, 0, key, rid)
                        np.setAlive(0, true)
                        _unpin(nf, true)
                        _notifyFree(newId, 1)
                        return
                }
        }
        const _collectBucketEntries = (firstBlock: number): Array<{ key: number; rid: Rid }> => {
                const out: Array<{ key: number; rid: Rid }> = []
                let cur = firstBlock
                while (cur >= 0) {
                        const f = _pin(cur)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        const count = h.slotCount || 0
                        for (let i = 0; i < count; i++) {
                                if (!p.isAlive(i)) continue
                                const e = p.readLeafEntry(i)
                                out.push({ key: e.key, rid: _ridOf(e) })
                        }
                        const next = h.nextPageId
                        _unpin(f, false)
                        cur = next ?? -1
                }
                return out
        }
        const _clearBucket = (firstBlock: number) => {
                const f = _pin(firstBlock)
                const p = createPage(f.bytes)
                p.setHeader({ kind: 'leaf', slotCount: 0, nextPageId: -1 })
                _unpin(f, true)
                _notifyFree(firstBlock, 0)
        }
        const _splitOneBucket = (m: any): void => {
                const oldIdx = m.splitPointer
                const newBlock = smgr.extend(relId, forkId)
                const nf = _pin(newBlock)
                const np = createPage(nf.bytes)
                np.setHeader({ kind: 'leaf', slotCount: 0, nextPageId: -1 })
                _unpin(nf, true)
                const oldEntries = _collectBucketEntries(_bucketBlock(oldIdx))
                _clearBucket(_bucketBlock(oldIdx))
                m.nBuckets = m.nBuckets + 1
                m.splitPointer = oldIdx + 1
                if (m.splitPointer >= 1 << m.level) {
                        m.splitPointer = 0
                        m.level = m.level + 1
                }
                _writeMeta(m)
                for (const e of oldEntries) {
                        const b = _bucketOf(e.key, m)
                        _insertToChain(_bucketBlock(b), e.key, e.rid)
                }
        }
        const insert = (key: number, rid: Rid): void => {
                _ensureInit()
                const m = _readMeta()
                const b = _bucketOf(key, m)
                _insertToChain(_bucketBlock(b), key, rid)
                m.tuples += 1
                _writeMeta(m)
                if (m.tuples / m.nBuckets > 1.5) _splitOneBucket(m)
        }
        _ensureInit()
        return {
                insert,
                lookup(key: number, emit: (rid: Rid) => boolean | void): void {
                        if (smgr.nBlocks(relId, forkId) === 0) return
                        const m = _readMeta()
                        const b = _bucketOf(key, m)
                        let cur = _bucketBlock(b)
                        while (cur >= 0) {
                                const f = _pin(cur)
                                const p = createPage(f.bytes)
                                const h = p.getHeader()
                                const count = h.slotCount || 0
                                let stop = false
                                for (let i = 0; i < count; i++) {
                                        if (!p.isAlive(i)) continue
                                        const e = p.readLeafEntry(i)
                                        if (!equal(e.key, key)) continue
                                        const r = emit(_ridOf(e))
                                        if (r === false) {
                                                stop = true
                                                break
                                        }
                                }
                                const next = h.nextPageId
                                _unpin(f, false)
                                if (stop) return
                                cur = next ?? -1
                        }
                },
                deleteKey(key: number, rid?: Rid): void {
                        if (smgr.nBlocks(relId, forkId) === 0) return
                        const m = _readMeta()
                        const b = _bucketOf(key, m)
                        let cur = _bucketBlock(b)
                        let removed = 0
                        while (cur >= 0) {
                                const f = _pin(cur)
                                const p = createPage(f.bytes)
                                const h = p.getHeader()
                                const count = h.slotCount || 0
                                let dirty = false
                                let live = 0
                                for (let i = 0; i < count; i++) {
                                        if (!p.isAlive(i)) continue
                                        const e = p.readLeafEntry(i)
                                        if (equal(e.key, key) && (!rid || (e.ridPageId === rid[0] && e.ridOffset === rid[1]))) {
                                                p.setAlive(i, false)
                                                dirty = true
                                                removed += 1
                                                continue
                                        }
                                        live += 1
                                }
                                const next = h.nextPageId
                                _unpin(f, dirty)
                                if (dirty) _notifyFree(cur, live)
                                cur = next ?? -1
                        }
                        if (removed > 0) {
                                m.tuples -= removed
                                _writeMeta(m)
                        }
                },
                bulkLoad(entries: Iterable<[number, Rid]>): void {
                        for (const [k, r] of entries) insert(k, r)
                },
                vacuum() {
                        return 0
                },
        }
}
export type HashIndex = ReturnType<typeof createHashIndex>

import { createPage } from '../storage/page'
import type { Rid } from '../../shared/types'
import type { Page, PageHeader, InternalEntry, Frame, BufferPool, StorageManager, FreeSpaceMap, NBTreeHandle } from '../types'
export type { Rid } from '../../shared/types'
export type Cmp = (a: number, b: number) => number
export interface NBTreeOptions {
        buffer: BufferPool
        smgr: StorageManager
        fsm: FreeSpaceMap
        relId: number
        forkId: number
        cmp?: Cmp
        keyOf?: (entry: unknown) => number
}
interface LeafKV {
        key: number
        rid: Rid
}
const META_BLOCK = 0
const LEAF_CAP = 64
const INTERNAL_CAP = 64
const ENTRY_BYTES = 12
const defaultCmp: Cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
export const createNBTree = ({ buffer, smgr, fsm, relId, forkId, cmp = defaultCmp }: NBTreeOptions): NBTreeHandle => {
        const _pin = (b: number) => buffer.pin(relId, forkId, b)
        const _unpin = (f: Frame, d?: boolean) => buffer.unpin(f, d)
        const _ridOf = (e: { ridPageId: number; ridOffset: number }): Rid => [e.ridPageId, e.ridOffset]
        const _writeLeaf = (p: Page, slot: number, key: number, rid: Rid) => p.writeLeafEntry(slot, key, { pageId: rid[0], offset: rid[1] })
        const _notifyFree = (block: number, used: number, cap: number) => fsm.update(relId, forkId, block, (cap - used) * ENTRY_BYTES)
        const _readRoot = (): number => {
                const f = _pin(META_BLOCK)
                const p = createPage(f.bytes)
                const r = p.readValue(0, 'i32')
                _unpin(f, false)
                return r
        }
        const _writeRoot = (root: number) => {
                const f = _pin(META_BLOCK)
                const p = createPage(f.bytes)
                p.writeValue(0, 'i32', root)
                _unpin(f, true)
        }
        const _ensureInit = (): number => {
                if (smgr.nBlocks(relId, forkId) > 0) return _readRoot()
                const meta = smgr.extend(relId, forkId)
                const leaf = smgr.extend(relId, forkId)
                const fm = _pin(meta)
                const mp = createPage(fm.bytes)
                mp.setHeader({ kind: 'meta' })
                mp.writeValue(0, 'i32', leaf)
                _unpin(fm, true)
                const fl = _pin(leaf)
                const lp = createPage(fl.bytes)
                lp.setHeader({ kind: 'leaf', slotCount: 0, prevPageId: -1, nextPageId: -1 })
                _unpin(fl, true)
                return leaf
        }
        const _leafBS = (lp: Page, count: number, key: number): number => {
                let lo = 0
                let hi = count
                while (lo < hi) {
                        const mid = (lo + hi) >>> 1
                        const e = lp.readLeafEntry(mid)
                        if (cmp(e.key, key) < 0) lo = mid + 1
                        else hi = mid
                }
                return lo
        }
        const _intBS = (ip: Page, count: number, key: number): number => {
                let lo = 0
                let hi = count
                while (lo < hi) {
                        const mid = (lo + hi) >>> 1
                        const e = ip.readInternalEntry(mid)
                        if (cmp(e.key, key) <= 0) lo = mid + 1
                        else hi = mid
                }
                return Math.max(0, lo - 1)
        }
        const _descendToLeaf = (key: number, path: number[]): number => {
                let cur = _readRoot()
                while (true) {
                        const f = _pin(cur)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        if (h.kind === 'leaf') {
                                _unpin(f, false)
                                return cur
                        }
                        const at = _intBS(p, h.slotCount || 0, key)
                        const child = p.readInternalEntry(at).childPageId
                        _unpin(f, false)
                        path.push(cur)
                        cur = child
                }
        }
        const _propagateUp = (path: number[], sepKey: number, rightId: number): void => {
                if (path.length === 0) {
                        const oldRoot = _readRoot()
                        const nr = smgr.extend(relId, forkId)
                        const fr = _pin(nr)
                        const rp = createPage(fr.bytes)
                        rp.setHeader({ kind: 'internal', slotCount: 2 })
                        rp.writeInternalEntry(0, sepKey, oldRoot)
                        rp.writeInternalEntry(1, sepKey, rightId)
                        _unpin(fr, true)
                        _writeRoot(nr)
                        return
                }
                const parentId = path.pop() as number
                const f = _pin(parentId)
                const p = createPage(f.bytes)
                const h = p.getHeader()
                const count = h.slotCount || 0
                const entries: InternalEntry[] = []
                for (let i = 0; i < count; i++) entries.push(p.readInternalEntry(i))
                let at = 0
                while (at < entries.length && cmp(entries[at].key, sepKey) <= 0) at++
                entries.splice(at, 0, { key: sepKey, childPageId: rightId })
                if (entries.length <= INTERNAL_CAP) {
                        for (let i = 0; i < entries.length; i++) p.writeInternalEntry(i, entries[i].key, entries[i].childPageId)
                        p.setHeader({ slotCount: entries.length })
                        _unpin(f, true)
                        return
                }
                const midI = entries.length >>> 1
                const leftE = entries.slice(0, midI)
                const rightE = entries.slice(midI)
                const newId = smgr.extend(relId, forkId)
                const fr = _pin(newId)
                const np = createPage(fr.bytes)
                for (let i = 0; i < leftE.length; i++) p.writeInternalEntry(i, leftE[i].key, leftE[i].childPageId)
                for (let i = 0; i < rightE.length; i++) np.writeInternalEntry(i, rightE[i].key, rightE[i].childPageId)
                p.setHeader({ slotCount: leftE.length })
                np.setHeader({ kind: 'internal', slotCount: rightE.length })
                _unpin(f, true)
                _unpin(fr, true)
                _propagateUp(path, rightE[0].key, newId)
        }
        const _splitLeaf = (leafId: number, lp: Page, lh: PageHeader, key: number, rid: Rid, path: number[]): void => {
                const newId = smgr.extend(relId, forkId)
                const fr = _pin(newId)
                const np = createPage(fr.bytes)
                const count = lh.slotCount || 0
                const mid = (count + 1) >>> 1
                const entries: LeafKV[] = []
                for (let i = 0; i < count; i++) {
                        const e = lp.readLeafEntry(i)
                        entries.push({ key: e.key, rid: _ridOf(e) })
                }
                const at = _leafBS(lp, count, key)
                entries.splice(at, 0, { key, rid })
                const left = entries.slice(0, mid)
                const right = entries.slice(mid)
                for (let i = 0; i < left.length; i++) _writeLeaf(lp, i, left[i].key, left[i].rid)
                for (let i = 0; i < right.length; i++) _writeLeaf(np, i, right[i].key, right[i].rid)
                const oldNext = lh.nextPageId
                lp.setHeader({ slotCount: left.length, nextPageId: newId })
                np.setHeader({ kind: 'leaf', slotCount: right.length, prevPageId: leafId, nextPageId: oldNext })
                _unpin(fr, true)
                _notifyFree(newId, right.length, LEAF_CAP)
                _propagateUp(path, right[0].key, newId)
        }
        const _walkRange = (start: number, end: number, dir: 1 | -1, emit: (rid: Rid) => boolean | void): void => {
                if (smgr.nBlocks(relId, forkId) === 0) return
                const path: number[] = []
                let cur = _descendToLeaf(dir === 1 ? start : end, path)
                while (cur >= 0) {
                        const f = _pin(cur)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        const count = h.slotCount || 0
                        let stop = false
                        const idxs = dir === 1 ? Array.from({ length: count }, (_, i) => i) : Array.from({ length: count }, (_, i) => count - 1 - i)
                        for (const i of idxs) {
                                const e = p.readLeafEntry(i)
                                if (dir === 1 && cmp(e.key, start) < 0) continue
                                if (dir === 1 && cmp(e.key, end) > 0) {
                                        stop = true
                                        break
                                }
                                if (dir === -1 && cmp(e.key, end) > 0) continue
                                if (dir === -1 && cmp(e.key, start) < 0) {
                                        stop = true
                                        break
                                }
                                const r = emit(_ridOf(e))
                                if (r === false) {
                                        stop = true
                                        break
                                }
                        }
                        const next = dir === 1 ? h.nextPageId : h.prevPageId
                        _unpin(f, false)
                        if (stop) return
                        cur = next ?? -1
                }
        }
        _ensureInit()
        return {
                insert(key: number, rid: Rid): void {
                        _ensureInit()
                        const path: number[] = []
                        const leafId = _descendToLeaf(key, path)
                        const f = _pin(leafId)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        const count = h.slotCount || 0
                        if (count < LEAF_CAP) {
                                const at = _leafBS(p, count, key)
                                for (let i = count; i > at; i--) {
                                        const prev = p.readLeafEntry(i - 1)
                                        _writeLeaf(p, i, prev.key, _ridOf(prev))
                                }
                                _writeLeaf(p, at, key, rid)
                                p.setHeader({ slotCount: count + 1 })
                                _unpin(f, true)
                                _notifyFree(leafId, count + 1, LEAF_CAP)
                                return
                        }
                        _splitLeaf(leafId, p, h, key, rid, path)
                        _unpin(f, true)
                        _notifyFree(leafId, Math.ceil((count + 1) / 2), LEAF_CAP)
                },
                search(key: number): Rid | undefined {
                        if (smgr.nBlocks(relId, forkId) === 0) return undefined
                        const path: number[] = []
                        const leafId = _descendToLeaf(key, path)
                        const f = _pin(leafId)
                        const p = createPage(f.bytes)
                        const h = p.getHeader()
                        const at = _leafBS(p, h.slotCount || 0, key)
                        let out: Rid | undefined
                        if (at < (h.slotCount || 0)) {
                                const e = p.readLeafEntry(at)
                                if (cmp(e.key, key) === 0) out = _ridOf(e)
                        }
                        _unpin(f, false)
                        return out
                },
                forward(start: number, end: number, emit: (rid: Rid) => boolean | void) {
                        return _walkRange(start, end, 1, emit)
                },
                backward(start: number, end: number, emit: (rid: Rid) => boolean | void) {
                        return _walkRange(start, end, -1, emit)
                },
                bulkLoad(sortedEntries: Array<[number, Rid]>): void {
                        _ensureInit()
                        if (sortedEntries.length === 0) return
                        const leafIds: number[] = []
                        const leafFirstKeys: number[] = []
                        let i = 0
                        let prevId = -1
                        while (i < sortedEntries.length) {
                                const id = smgr.extend(relId, forkId)
                                leafIds.push(id)
                                const f = _pin(id)
                                const p = createPage(f.bytes)
                                const slice = sortedEntries.slice(i, i + LEAF_CAP)
                                for (let j = 0; j < slice.length; j++) _writeLeaf(p, j, slice[j][0], slice[j][1])
                                p.setHeader({ kind: 'leaf', slotCount: slice.length, prevPageId: prevId, nextPageId: -1 })
                                leafFirstKeys.push(slice[0][0])
                                _unpin(f, true)
                                _notifyFree(id, slice.length, LEAF_CAP)
                                if (prevId >= 0) {
                                        const pf = _pin(prevId)
                                        const pp = createPage(pf.bytes)
                                        pp.setHeader({ nextPageId: id })
                                        _unpin(pf, true)
                                }
                                prevId = id
                                i += LEAF_CAP
                        }
                        let levelIds = leafIds
                        let levelKeys = leafFirstKeys
                        while (levelIds.length > 1) {
                                const nextIds: number[] = []
                                const nextKeys: number[] = []
                                let k = 0
                                while (k < levelIds.length) {
                                        const id = smgr.extend(relId, forkId)
                                        const f = _pin(id)
                                        const p = createPage(f.bytes)
                                        const slice = levelIds.slice(k, k + INTERNAL_CAP)
                                        const sliceK = levelKeys.slice(k, k + INTERNAL_CAP)
                                        for (let j = 0; j < slice.length; j++) p.writeInternalEntry(j, sliceK[j], slice[j])
                                        p.setHeader({ kind: 'internal', slotCount: slice.length })
                                        _unpin(f, true)
                                        nextIds.push(id)
                                        nextKeys.push(sliceK[0])
                                        k += INTERNAL_CAP
                                }
                                levelIds = nextIds
                                levelKeys = nextKeys
                        }
                        _writeRoot(levelIds[0])
                },
                vacuum() {
                        return 0
                },
        }
}
export type NBTree = NBTreeHandle

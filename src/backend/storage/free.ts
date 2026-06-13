import type { FreeSpaceMap } from '../types'
const GRAN = 16
const forkKey = (relId: number, forkId: number) => `${relId}/${forkId}`
interface FsmStore {
        leaf: Uint8Array
        upper: Uint8Array
        nBlocks: number
}
const makeStore = (): FsmStore => ({ leaf: new Uint8Array(0), upper: new Uint8Array(0), nBlocks: 0 })
const ensureCapacity = (s: FsmStore, n: number) => {
        if (s.leaf.length >= n) return
        const leaf = new Uint8Array(Math.max(n, s.leaf.length * 2 + 8))
        leaf.set(s.leaf)
        s.leaf = leaf
        const upper = new Uint8Array(Math.max(Math.ceil(n / 8), s.upper.length * 2 + 8))
        upper.set(s.upper)
        s.upper = upper
}
const recomputeUpper = (s: FsmStore, idx: number) => {
        const group = idx >> 3
        let m = 0
        const base = group << 3
        const end = Math.min(base + 8, s.nBlocks)
        for (let i = base; i < end; i++) if (s.leaf[i] > m) m = s.leaf[i]
        s.upper[group] = m
}
export const createFreeSpaceMap = (): FreeSpaceMap => {
        const _stores = new Map<string, FsmStore>()
        const _getStore = (relId: number, forkId: number): FsmStore => {
                const k = forkKey(relId, forkId)
                const cached = _stores.get(k)
                if (cached) return cached
                const s = makeStore()
                _stores.set(k, s)
                return s
        }
        return {
                findPage(relId: number, forkId: number, neededBytes: number) {
                        const s = _getStore(relId, forkId)
                        const need = Math.ceil(neededBytes / GRAN)
                        for (let g = 0; g < Math.ceil(s.nBlocks / 8); g++) {
                                if (s.upper[g] < need) continue
                                const base = g << 3
                                const end = Math.min(base + 8, s.nBlocks)
                                for (let i = base; i < end; i++) if (s.leaf[i] >= need) return i
                        }
                        return -1
                },
                update(relId: number, forkId: number, blockNo: number, freeBytes: number) {
                        const s = _getStore(relId, forkId)
                        if (blockNo >= s.nBlocks) s.nBlocks = blockNo + 1
                        ensureCapacity(s, s.nBlocks)
                        s.leaf[blockNo] = Math.min(255, Math.floor(freeBytes / GRAN))
                        recomputeUpper(s, blockNo)
                },
                drop(relId: number, forkId: number) {
                        _stores.delete(forkKey(relId, forkId))
                },
        }
}

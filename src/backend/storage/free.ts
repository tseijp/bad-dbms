const GRAN = 16
const forkKey = (relId: any, forkId: any) => `${relId}/${forkId}`
const makeStore = (): any => ({ leaf: new Uint8Array(0), upper: new Uint8Array(0), nBlocks: 0 })
const ensureCapacity = (s: any, n: number) => {
        if (s.leaf.length >= n) return
        const leaf = new Uint8Array(Math.max(n, s.leaf.length * 2 + 8))
        leaf.set(s.leaf)
        s.leaf = leaf
        const upperLen = Math.ceil(n / 8)
        const upper = new Uint8Array(Math.max(upperLen, s.upper.length * 2 + 8))
        upper.set(s.upper)
        s.upper = upper
}
const recomputeUpper = (s: any, idx: number) => {
        const group = idx >> 3
        let m = 0
        const base = group << 3
        const end = Math.min(base + 8, s.nBlocks)
        for (let i = base; i < end; i++) if (s.leaf[i] > m) m = s.leaf[i]
        s.upper[group] = m
}
export const createFreeSpaceMap = (opts: any) => {
        const _smgr = opts.smgr
        const _stores = new Map<string, any>()
        const _getStore = (relId: any, forkId: any) => {
                const k = forkKey(relId, forkId)
                let s = _stores.get(k)
                if (s) return s
                s = makeStore()
                _stores.set(k, s)
                return s
        }
        return {
                findPage(relId: any, forkId: any, neededBytes: number) {
                        const s = _getStore(relId, forkId)
                        const need = Math.ceil(neededBytes / GRAN)
                        const groups = Math.ceil(s.nBlocks / 8)
                        for (let g = 0; g < groups; g++) {
                                if (s.upper[g] < need) continue
                                const base = g << 3
                                const end = Math.min(base + 8, s.nBlocks)
                                for (let i = base; i < end; i++) if (s.leaf[i] >= need) return i
                        }
                        return -1
                },
                update(relId: any, forkId: any, blockNo: number, freeBytes: number) {
                        const s = _getStore(relId, forkId)
                        if (blockNo >= s.nBlocks) s.nBlocks = blockNo + 1
                        ensureCapacity(s, s.nBlocks)
                        const v = Math.min(255, Math.floor(freeBytes / GRAN))
                        s.leaf[blockNo] = v
                        recomputeUpper(s, blockNo)
                },
                extend(relId: any, forkId: any) {
                        const s = _getStore(relId, forkId)
                        const blockNo = _smgr.extend(relId, forkId)
                        if (blockNo >= s.nBlocks) s.nBlocks = blockNo + 1
                        ensureCapacity(s, s.nBlocks)
                        s.leaf[blockNo] = 255
                        recomputeUpper(s, blockNo)
                        return blockNo
                },
        }
}

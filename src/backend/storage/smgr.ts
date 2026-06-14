import type { FileAdapter, ForkState, SMgrRelation, StorageManager } from '../types'
const FORKS = ['', 'fsm', 'vm', 'init']
const blockOf = (key: string) => Number(key.slice(key.lastIndexOf('/') + 1))
const keyOf = (fork: ForkState, blockNo: number) => `${fork.fid}/${blockNo}`
const relOf = (relId: number, path: string): SMgrRelation => ({
        relId,
        path,
        forks: FORKS.map((name) => ({ fid: name ? `${path}/${name}` : path, nBlocks: 0, known: false })),
})
export interface StorageManagerOptions {
        file: FileAdapter
        pageSize?: number
}
export const createStorageManager = ({ file, pageSize = 4096 }: StorageManagerOptions): StorageManager => {
        const paths = new Map<number, string>()
        const handles = new Map<string, number>()
        const forkOf = (rel: SMgrRelation, forkId: number) => rel.forks[forkId]
        const pathOf = (relId: number) => {
                const path = paths.get(relId)
                if (path) return path
                return String(relId)
        }
        const loadCount = async (fork: ForkState) => {
                if (fork.known) return
                let max = -1
                for (const key of await file.list(`${fork.fid}/`)) max = Math.max(max, blockOf(key))
                fork.nBlocks = max + 1
                fork.known = true
        }
        return {
                intern(path) {
                        const hit = handles.get(path)
                        if (hit) return hit
                        const relId = handles.size + 1
                        handles.set(path, relId)
                        paths.set(relId, path)
                        return relId
                },
                open(relId) {
                        return relOf(relId, pathOf(relId))
                },
                async unlink(rel, forkId) {
                        const fork = forkOf(rel, forkId)
                        for (const key of await file.list(`${fork.fid}/`)) await file.delete(key)
                        fork.nBlocks = 0
                        fork.known = true
                },
                async read(rel, forkId, blockNo) {
                        const bytes = await file.get(keyOf(forkOf(rel, forkId), blockNo))
                        const out = new Uint8Array(pageSize)
                        if (bytes) out.set(bytes.subarray(0, Math.min(bytes.length, pageSize)))
                        return out
                },
                async write(rel, forkId, blockNo, bytes) {
                        const fork = forkOf(rel, forkId)
                        if (fork.known && blockNo >= fork.nBlocks) fork.nBlocks = blockNo + 1
                        await file.put(keyOf(fork, blockNo), bytes)
                },
                async extend(rel, forkId) {
                        const fork = forkOf(rel, forkId)
                        await loadCount(fork)
                        return fork.nBlocks++
                },
                async nBlocks(rel, forkId) {
                        const fork = forkOf(rel, forkId)
                        await loadCount(fork)
                        return fork.nBlocks
                },
        }
}

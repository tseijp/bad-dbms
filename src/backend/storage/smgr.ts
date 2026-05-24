import type { FileAdapter, SMgrRelation, ForkState, StorageManager } from '../types'
const FORKS = ['main', 'fsm', 'vm', 'init']
const MAX_REL_CACHE = 1024
const _fidOf = (relId: number, forkId: number) => `${relId}_${FORKS[forkId] ?? forkId}`
const _keyOf = (fid: string, blockNo: number) => `${fid}/${blockNo}`
const _blockOf = (key: string) => +key.slice(key.lastIndexOf('/') + 1)
const _newRel = (relId: number): SMgrRelation => ({ relId, forks: FORKS.map((_, i) => ({ fid: _fidOf(relId, i), nBlocks: 0, known: false })) })
export interface StorageManagerOptions {
        file: FileAdapter
        pageSize?: number
}
export const createStorageManager = ({ file, pageSize = 4096 }: StorageManagerOptions): StorageManager => {
        const _cache = new Map<number, SMgrRelation>()
        const _fork = (rel: SMgrRelation, forkId: number): ForkState => rel.forks[forkId]
        const _ensureN = async (fork: ForkState) => {
                if (fork.known) return
                const keys = await file.list(`${fork.fid}/`)
                let max = -1
                for (const k of keys) {
                        const b = _blockOf(k)
                        if (b > max) max = b
                }
                fork.nBlocks = max + 1
                fork.known = true
        }
        return {
                open(relId) {
                        const hit = _cache.get(relId)
                        if (hit) {
                                _cache.delete(relId)
                                _cache.set(relId, hit)
                                return hit
                        }
                        if (_cache.size >= MAX_REL_CACHE) _cache.delete(_cache.keys().next().value!)
                        const rel = _newRel(relId)
                        _cache.set(relId, rel)
                        return rel
                },
                async create(rel, forkId) {
                        const fork = _fork(rel, forkId)
                        fork.nBlocks = 0
                        fork.known = true
                },
                async exists(rel, forkId) {
                        const keys = await file.list(`${_fork(rel, forkId).fid}/`)
                        return keys.length > 0
                },
                async unlink(rel, forkId) {
                        const fork = _fork(rel, forkId)
                        const keys = await file.list(`${fork.fid}/`)
                        await Promise.all(keys.map((k) => file.delete(k)))
                        fork.nBlocks = 0
                        fork.known = true
                },
                async read(rel, forkId, blockNo) {
                        const bytes = await file.get(_keyOf(_fork(rel, forkId).fid, blockNo))
                        if (bytes && bytes.length === pageSize) return bytes
                        const out = new Uint8Array(pageSize)
                        if (bytes) out.set(bytes.subarray(0, Math.min(bytes.length, pageSize)))
                        return out
                },
                async write(rel, forkId, blockNo, bytes) {
                        const fork = _fork(rel, forkId)
                        if (fork.known && blockNo >= fork.nBlocks) fork.nBlocks = blockNo + 1
                        await file.put(_keyOf(fork.fid, blockNo), bytes).catch((e) => {
                                fork.known = false
                                throw e
                        })
                },
                async extend(rel, forkId) {
                        const fork = _fork(rel, forkId)
                        await _ensureN(fork)
                        return fork.nBlocks++
                },
                async nBlocks(rel, forkId) {
                        const fork = _fork(rel, forkId)
                        await _ensureN(fork)
                        return fork.nBlocks
                },
                async truncate(rel, forkId, blockNo) {
                        const fork = _fork(rel, forkId)
                        await _ensureN(fork)
                        const dels: Promise<void>[] = []
                        for (let b = blockNo; b < fork.nBlocks; b++) dels.push(file.delete(_keyOf(fork.fid, b)))
                        await Promise.all(dels)
                        fork.nBlocks = blockNo
                },
        }
}

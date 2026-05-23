import type { FileHandle, SmgrHandle, StorageManager } from '../types'
const fileIdOf = (relId: number, forkId: number) => `${relId}.${forkId}`
const handleKey = (relId: number, forkId: number) => `${relId}/${forkId}`
export interface StorageManagerOptions {
        file: FileHandle
        pageSize?: number
}
export const createStorageManager = ({ file, pageSize = 4096 }: StorageManagerOptions): StorageManager => {
        const _handles = new Map<string, SmgrHandle>()
        const _getHandle = (relId: number, forkId: number): SmgrHandle => {
                const k = handleKey(relId, forkId)
                const cached = _handles.get(k)
                if (cached) return cached
                const h: SmgrHandle = { fid: fileIdOf(relId, forkId), nBlocks: 0 }
                _handles.set(k, h)
                return h
        }
        return {
                read(relId: number, forkId: number, blockNo: number): Uint8Array {
                        const h = _getHandle(relId, forkId)
                        return file.read(h.fid, blockNo * pageSize, pageSize)
                },
                extend(relId: number, forkId: number) {
                        const h = _getHandle(relId, forkId)
                        const blockNo = h.nBlocks
                        file.write(h.fid, blockNo * pageSize, new Uint8Array(pageSize))
                        h.nBlocks = blockNo + 1
                        return blockNo
                },
                nBlocks(relId: number, forkId: number) {
                        return _getHandle(relId, forkId).nBlocks
                },
        }
}

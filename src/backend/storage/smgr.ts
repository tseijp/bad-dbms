import type { FileHandle, SmgrHandle, StorageManager } from '../types'
const fileIdOf = (relId: number, forkId: number) => `${relId}.${forkId}`
const handleKey = (relId: number, forkId: number) => `${relId}/${forkId}`
export interface StorageManagerOptions {
        file: FileHandle
        pageSize?: number
}
export const createStorageManager = (opts: StorageManagerOptions): StorageManager => {
        const _file = opts.file
        const _pageSize = opts.pageSize ?? 4096
        const _handles = new Map<string, SmgrHandle>()
        const getHandle = (relId: number, forkId: number): SmgrHandle => {
                const k = handleKey(relId, forkId)
                const cached = _handles.get(k)
                if (cached) return cached
                const fid = fileIdOf(relId, forkId)
                const sz = _file.exists(fid) ? _file.size(fid) : 0
                const h: SmgrHandle = { fid, nBlocks: Math.floor(sz / _pageSize) }
                _handles.set(k, h)
                return h
        }
        return {
                read(relId: number, forkId: number, blockNo: number): Uint8Array {
                        const h = getHandle(relId, forkId)
                        return _file.read(h.fid, blockNo * _pageSize, _pageSize)
                },
                write(relId: number, forkId: number, blockNo: number, bytes: Uint8Array) {
                        const h = getHandle(relId, forkId)
                        _file.write(h.fid, blockNo * _pageSize, bytes)
                        if (blockNo >= h.nBlocks) h.nBlocks = blockNo + 1
                },
                extend(relId: number, forkId: number) {
                        const h = getHandle(relId, forkId)
                        const blockNo = h.nBlocks
                        const zero = new Uint8Array(_pageSize)
                        _file.write(h.fid, blockNo * _pageSize, zero)
                        h.nBlocks = blockNo + 1
                        return blockNo
                },
                truncate(relId: number, forkId: number, newNBlocks: number) {
                        const h = getHandle(relId, forkId)
                        if (newNBlocks >= h.nBlocks) return
                        h.nBlocks = newNBlocks
                },
                nBlocks(relId: number, forkId: number) {
                        return getHandle(relId, forkId).nBlocks
                },
                sync(relId: number, forkId: number) {
                        const h = getHandle(relId, forkId)
                        if (_file.sync) _file.sync(h.fid)
                },
                getHandle,
                async prepare(relId: number, forkId: number): Promise<SmgrHandle> {
                        const fid = fileIdOf(relId, forkId)
                        const opener = _file as FileHandle & { open?: (id: string) => Promise<void> }
                        if (opener.open) await opener.open(fid)
                        _handles.delete(handleKey(relId, forkId))
                        return getHandle(relId, forkId)
                },
        }
}

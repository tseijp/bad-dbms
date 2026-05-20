const fileIdOf = (relId: any, forkId: any) => `${relId}.${forkId}`
const handleKey = (relId: any, forkId: any) => `${relId}/${forkId}`
export const createStorageManager = (opts: any) => {
        const _file = opts.file
        const _pageSize = opts.pageSize ?? 4096
        const _handles = new Map<string, any>()
        const getHandle = (relId: any, forkId: any) => {
                const k = handleKey(relId, forkId)
                let h = _handles.get(k)
                if (h) return h
                const fid = fileIdOf(relId, forkId)
                const sz = _file.exists(fid) ? _file.size(fid) : 0
                h = { fid, nBlocks: Math.floor(sz / _pageSize) }
                _handles.set(k, h)
                return h
        }
        return {
                read(relId: any, forkId: any, blockNo: number): Uint8Array {
                        const h = getHandle(relId, forkId)
                        return _file.read(h.fid, blockNo * _pageSize, _pageSize)
                },
                write(relId: any, forkId: any, blockNo: number, bytes: Uint8Array) {
                        const h = getHandle(relId, forkId)
                        _file.write(h.fid, blockNo * _pageSize, bytes)
                        if (blockNo >= h.nBlocks) h.nBlocks = blockNo + 1
                },
                extend(relId: any, forkId: any) {
                        const h = getHandle(relId, forkId)
                        const blockNo = h.nBlocks
                        const zero = new Uint8Array(_pageSize)
                        _file.write(h.fid, blockNo * _pageSize, zero)
                        h.nBlocks = blockNo + 1
                        return blockNo
                },
                truncate(relId: any, forkId: any, newNBlocks: number) {
                        const h = getHandle(relId, forkId)
                        if (newNBlocks >= h.nBlocks) return
                        h.nBlocks = newNBlocks
                },
                nBlocks(relId: any, forkId: any) {
                        return getHandle(relId, forkId).nBlocks
                },
                sync(relId: any, forkId: any) {
                        const h = getHandle(relId, forkId)
                        if (_file.sync) _file.sync(h.fid)
                },
                getHandle,
        }
}

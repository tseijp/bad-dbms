const fileIdOf = (relId: any, forkId: any) => `${relId}.${forkId}`

const handleKey = (relId: any, forkId: any) => `${relId}/${forkId}`

export const createStorageManager = (opts: any) => {
        const file = opts.file
        const pageSize = opts.pageSize ?? 4096
        const handles = new Map<string, any>()
        const getHandle = (relId: any, forkId: any) => {
                const k = handleKey(relId, forkId)
                let h = handles.get(k)
                if (h) return h
                const fid = fileIdOf(relId, forkId)
                const sz = file.exists(fid) ? file.size(fid) : 0
                h = { fid, nBlocks: Math.floor(sz / pageSize) }
                handles.set(k, h)
                return h
        }
        const read = (relId: any, forkId: any, blockNo: number): Uint8Array => {
                const h = getHandle(relId, forkId)
                return file.read(h.fid, blockNo * pageSize, pageSize)
        }
        const write = (relId: any, forkId: any, blockNo: number, bytes: Uint8Array) => {
                const h = getHandle(relId, forkId)
                file.write(h.fid, blockNo * pageSize, bytes)
                if (blockNo >= h.nBlocks) h.nBlocks = blockNo + 1
        }
        const extend = (relId: any, forkId: any) => {
                const h = getHandle(relId, forkId)
                const blockNo = h.nBlocks
                const zero = new Uint8Array(pageSize)
                file.write(h.fid, blockNo * pageSize, zero)
                h.nBlocks = blockNo + 1
                return blockNo
        }
        const truncate = (relId: any, forkId: any, newNBlocks: number) => {
                const h = getHandle(relId, forkId)
                if (newNBlocks >= h.nBlocks) return
                h.nBlocks = newNBlocks
        }
        const nBlocks = (relId: any, forkId: any) => getHandle(relId, forkId).nBlocks
        const sync = (relId: any, forkId: any) => {
                const h = getHandle(relId, forkId)
                if (file.sync) file.sync(h.fid)
        }
        return { read, write, extend, truncate, nBlocks, sync, getHandle }
}

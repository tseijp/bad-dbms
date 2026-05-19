import { vi } from 'vitest'
import { createFileAdapter, createFile } from '../../../src/backend/storage/file'
import { createStorageManager } from '../../../src/backend/storage/smgr'
import { createBufferPool } from '../../../src/backend/storage/buffer'
import { createFreeSpaceMap } from '../../../src/backend/storage/free'
import { createLockManager } from '../../../src/backend/storage/lmng'

export const PAGE = 4096

export const makeFile = () => {
        const adapter = createFileAdapter()
        const file = createFile(adapter)
        return { adapter, file }
}

export const makeSmgr = (pageSize = PAGE) => {
        const { adapter, file } = makeFile()
        const smgr = createStorageManager({ file, pageSize })
        return { adapter, file, smgr }
}

export const makeFakeSmgr = (pageSize = PAGE) => {
        const blocks = new Map<string, Uint8Array>()
        const counts = new Map<string, number>()
        const k = (r: any, f: any, b: any) => `${r}/${f}/${b}`
        const fk = (r: any, f: any) => `${r}/${f}`
        const read = vi.fn((relId: any, forkId: any, blockNo: any) => {
                const data = blocks.get(k(relId, forkId, blockNo))
                if (data) return new Uint8Array(data)
                return new Uint8Array(pageSize)
        })
        const write = vi.fn((relId: any, forkId: any, blockNo: any, bytes: Uint8Array) => {
                blocks.set(k(relId, forkId, blockNo), new Uint8Array(bytes))
                const n = counts.get(fk(relId, forkId)) ?? 0
                if (blockNo + 1 > n) counts.set(fk(relId, forkId), blockNo + 1)
        })
        const extend = vi.fn((relId: any, forkId: any) => {
                const n = counts.get(fk(relId, forkId)) ?? 0
                counts.set(fk(relId, forkId), n + 1)
                blocks.set(k(relId, forkId, n), new Uint8Array(pageSize))
                return n
        })
        const nBlocks = vi.fn((relId: any, forkId: any) => counts.get(fk(relId, forkId)) ?? 0)
        const truncate = vi.fn()
        const sync = vi.fn()
        const getHandle = vi.fn()
        return { read, write, extend, nBlocks, truncate, sync, getHandle }
}

export const makeBuffer = (opts: any = {}) => {
        const smgr = opts.smgr ?? makeFakeSmgr(opts.pageSize ?? PAGE)
        const buffer = createBufferPool({
                smgr,
                frameCount: opts.frameCount ?? 4,
                ringCount: opts.ringCount ?? 2,
                pageSize: opts.pageSize ?? PAGE,
        })
        return { smgr, buffer }
}

export const makeFsm = (opts: any = {}) => {
        const smgr = opts.smgr ?? makeFakeSmgr(opts.pageSize ?? PAGE)
        const fsm = createFreeSpaceMap({ smgr })
        return { smgr, fsm }
}

export const makeLmng = () => createLockManager()

export const fillBytes = (size: number, start = 1) => {
        const out = new Uint8Array(size)
        for (let i = 0; i < size; i++) out[i] = (start + i) & 0xff
        return out
}

export const settle = async () => {
        await Promise.resolve()
        await Promise.resolve()
}

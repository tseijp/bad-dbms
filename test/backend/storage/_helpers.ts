import { vi } from 'vitest'
import { createFileAdapter, createFile } from '../../../src/backend/storage/file'
import { createStorageManager } from '../../../src/backend/storage/smgr'
import { createBufferPool } from '../../../src/backend/storage/buffer'
import { createFreeSpaceMap } from '../../../src/backend/storage/free'
import { createLockManager } from '../../../src/backend/storage/lmgr'
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
        const _blocks = new Map<string, Uint8Array>()
        const _counts = new Map<string, number>()
        const _k = (r: any, f: any, b: any) => `${r}/${f}/${b}`
        const _fk = (r: any, f: any) => `${r}/${f}`
        return {
                read: vi.fn((relId: any, forkId: any, blockNo: any) => {
                        const data = _blocks.get(_k(relId, forkId, blockNo))
                        if (data) return new Uint8Array(data)
                        return new Uint8Array(pageSize)
                }),
                write: vi.fn((relId: any, forkId: any, blockNo: any, bytes: Uint8Array) => {
                        _blocks.set(_k(relId, forkId, blockNo), new Uint8Array(bytes))
                        const n = _counts.get(_fk(relId, forkId)) ?? 0
                        if (blockNo + 1 > n) _counts.set(_fk(relId, forkId), blockNo + 1)
                }),
                extend: vi.fn((relId: any, forkId: any) => {
                        const n = _counts.get(_fk(relId, forkId)) ?? 0
                        _counts.set(_fk(relId, forkId), n + 1)
                        _blocks.set(_k(relId, forkId, n), new Uint8Array(pageSize))
                        return n
                }),
                nBlocks: vi.fn((relId: any, forkId: any) => _counts.get(_fk(relId, forkId)) ?? 0),
                truncate: vi.fn(),
                sync: vi.fn(),
                getHandle: vi.fn(),
        }
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
export const makeLmgr = () => createLockManager()
export const fillBytes = (size: number, start = 1) => {
        const out = new Uint8Array(size)
        for (let i = 0; i < size; i++) out[i] = (start + i) & 0xff
        return out
}
export const settle = async () => {
        await Promise.resolve()
        await Promise.resolve()
}

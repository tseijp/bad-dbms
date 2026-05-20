import { vi } from 'vitest'
import { createFileAdapter, createFile } from '../../src/backend/storage/file'
import { createStorageManager } from '../../src/backend/storage/smgr'
import { createBufferPool } from '../../src/backend/storage/buffer'
import { createFreeSpaceMap } from '../../src/backend/storage/free'
import { createLockManager } from '../../src/backend/storage/lmng'
import { createCatalog } from '../../src/backend/catalog'
import { createExecutor } from '../../src/backend/executor'
import { createDatabase } from '../../src/backend/index'
import { table } from '../../src/interface/table'
import { integer, float, uint } from '../../src/interface/column'
export interface StackOptions {
        frameCount?: number
        ringCount?: number
        pageSize?: number
}
export const makeStorage = (opts: StackOptions = {}) => {
        const adapter = createFileAdapter()
        const file = createFile(adapter)
        const pageSize = opts.pageSize ?? 4096
        const smgr = createStorageManager({ file, pageSize })
        const buffer = createBufferPool({ smgr, frameCount: opts.frameCount ?? 32, ringCount: opts.ringCount ?? 8, pageSize })
        const fsm = createFreeSpaceMap({ smgr })
        const lock = createLockManager()
        return { adapter, file, smgr, buffer, fsm, lock }
}
export const makeCatalog = (opts: StackOptions = {}) => {
        const storage = makeStorage(opts)
        const catalog = createCatalog({ buffer: storage.buffer, smgr: storage.smgr, fsm: storage.fsm, lock: storage.lock })
        return { ...storage, catalog }
}
export const makeExecutor = (opts: StackOptions = {}) => {
        const stack = makeCatalog(opts)
        const executor = createExecutor({ catalog: stack.catalog })
        return { ...stack, executor }
}
export const usersDef = { id: { type: 'i32', isPrimary: true }, name: { type: 'u32' }, score: { type: 'f32' } }
export const orderDef = { userId: { type: 'i32' }, amount: { type: 'i32' } }
export const kvDef = { k: { type: 'i32' }, v: { type: 'i32' } }
export const usersTable = () =>
        table('users', {
                id: integer('id').primaryKey(),
                name: uint('name'),
                score: float('score'),
        })
export const ordersTable = () =>
        table('orders', {
                userId: integer('user_id'),
                amount: integer('amount'),
        })
export const insertRows = (catalog: any, name: string, rows: any[]): any[] => {
        const rids: any[] = []
        for (const r of rows) rids.push(catalog.insertRow(name, r))
        return rids
}
export const drainIter = (iter: any): any[] => {
        const out: any[] = []
        while (true) {
                const r = iter.next()
                if (r === null || r === undefined) break
                out.push(r)
        }
        if (iter.close) iter.close()
        return out
}
export const arrayChild = (rows: any[]) => {
        let _i = 0
        return {
                next: () => (_i < rows.length ? rows[_i++] : null),
                close: () => {},
        }
}
export const spyAdapter = () => {
        const _inner = createFileAdapter()
        return {
                read: vi.fn(_inner.read),
                write: vi.fn(_inner.write),
                sync: vi.fn(_inner.sync),
                close: vi.fn(_inner.close),
                list: vi.fn(_inner.list),
                exists: vi.fn(_inner.exists),
                size: vi.fn(_inner.size),
        }
}
export const makeDb = (config: any = {}) => createDatabase(config)

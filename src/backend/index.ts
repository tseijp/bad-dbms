import { createFileAdapter, createFile } from './storage/file'
import { createStorageManager } from './storage/smgr'
import { createBufferPool } from './storage/buffer'
import { createFreeSpaceMap } from './storage/free'
import { createLockManager } from './storage/lmgr'
import { createTransam } from './access/transam'
import { createCatalog } from './catalog'
import { createExecutor } from './executor'
import type { Row, InitAllAst, ExecuteAst } from '../shared/types'
import type { FileAdapter, RowIterator } from './types'
const drain = (iter: RowIterator): Row[] => {
        const out: Row[] = []
        if (!iter || typeof iter.next !== 'function') return out
        while (true) {
                const r = iter.next()
                if (r === null || r === undefined) break
                out.push(r)
        }
        if (iter.close) iter.close()
        return out
}
const handleInitAll = (catalog: ReturnType<typeof createCatalog>, ast: InitAllAst): Row[] => {
        const tables = ast.tables || {}
        for (const k of Object.keys(tables)) catalog.registerTable(tables[k] as Parameters<typeof catalog.registerTable>[0])
        return []
}
export interface BackendConfig {
        fileAdapter?: FileAdapter
        pageSize?: number
        frameCount?: number
        ringCount?: number
}
export const createBackend = (config: BackendConfig = {}) => {
        const _adapter = config.fileAdapter ?? createFileAdapter()
        const _file = createFile(_adapter)
        const _pageSize = config.pageSize ?? 4096
        const smgr = createStorageManager({ file: _file, pageSize: _pageSize })
        const buffer = createBufferPool({ smgr, frameCount: config.frameCount ?? 64, ringCount: config.ringCount ?? 8, pageSize: _pageSize })
        const fsm = createFreeSpaceMap({ smgr })
        const lock = createLockManager()
        const transam = createTransam()
        const catalog = createCatalog({ buffer, smgr, fsm })
        const _executor = createExecutor({ catalog })
        return {
                catalog,
                async execute(ast: ExecuteAst): Promise<Row[]> {
                        if (!ast || !ast.op) return []
                        if (ast.op === 'InitAll') return handleInitAll(catalog, ast)
                        return drain(_executor.execute(ast))
                },
                async transaction<T>(fn: (tx: ReturnType<typeof transam.begin>) => T | Promise<T>): Promise<T> {
                        const tx = transam.begin()
                        type TxResult = { ok: true; value: T } | { ok: false; error: unknown }
                        const settled: TxResult = await Promise.resolve(fn(tx)).then(
                                (r: T): TxResult => ({ ok: true, value: r }),
                                (err: unknown): TxResult => ({ ok: false, error: err }),
                        )
                        if (!settled.ok) {
                                transam.abort()
                                throw settled.error
                        }
                        transam.commit()
                        return settled.value
                },
                stats() {
                        const rels = catalog.list()
                        const out = rels.map((rel) => {
                                const cols = rel.columns.map((c) => {
                                        const storageRel = rel.relId * 10000 + c.forkId
                                        const blocks = smgr.nBlocks(storageRel, 0)
                                        return { name: c.name, blocks }
                                })
                                return { name: rel.name, relId: rel.relId, columns: cols, indexCount: rel.indexes.length }
                        })
                        return { relations: out, buffer: buffer.stats() }
                },
                flush() {
                        return buffer.flushAll()
                },
                close() {
                        return buffer.flushAll()
                },
                smgr,
                buffer,
                fsm,
                lock,
                transam,
        }
}
export type Backend = ReturnType<typeof createBackend>

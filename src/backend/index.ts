import { createFileAdapter, createFile } from './storage/file'
import { createStorageManager } from './storage/smgr'
import { createBufferPool } from './storage/buffer'
import { createFreeSpaceMap } from './storage/free'
import { createLockManager } from './storage/lmng'
import { createTransam } from './access/transam'
import { createCatalog } from './catalog'
import { createExecutor } from './executor'
const drain = (iter: any): any[] => {
        const out: any[] = []
        if (!iter || typeof iter.next !== 'function') return out
        while (true) {
                const r = iter.next()
                if (r === null || r === undefined) break
                out.push(r)
        }
        if (iter.close) iter.close()
        return out
}
const handleInitAll = (catalog: any, ast: any): any[] => {
        const tables = ast.tables || {}
        for (const k of Object.keys(tables)) catalog.registerTable(tables[k])
        return []
}
export const createDatabase = (config: any = {}) => {
        const _adapter = config.fileAdapter ?? createFileAdapter()
        const _file = createFile(_adapter)
        const _pageSize = config.pageSize ?? 4096
        const smgr = createStorageManager({ file: _file, pageSize: _pageSize })
        const buffer = createBufferPool({ smgr, frameCount: config.frameCount ?? 64, ringCount: config.ringCount ?? 8, pageSize: _pageSize })
        const fsm = createFreeSpaceMap({ smgr })
        const lock = createLockManager()
        const transam = createTransam()
        const catalog = createCatalog({ buffer, smgr, fsm, lock })
        const _executor = createExecutor({ catalog, transam })
        return {
                catalog,
                async execute(ast: any): Promise<any[]> {
                        if (!ast || !ast.op) return []
                        if (ast.op === 'InitAll') return handleInitAll(catalog, ast)
                        return drain(_executor.execute(ast))
                },
                async transaction(fn: any) {
                        const tx = transam.begin()
                        const result = (await Promise.resolve(fn(tx)).then(
                                (r: any) => ({ ok: true, value: r }),
                                (err: any) => ({ ok: false, error: err }),
                        )) as any
                        if (!result.ok) {
                                transam.abort()
                                throw result.error
                        }
                        transam.commit()
                        return result.value
                },
                stats() {
                        const rels = catalog.list()
                        const out: any[] = []
                        for (const rel of rels) {
                                const cols = rel.columns.map((c: any) => {
                                        const storageRel = rel.relId * 10000 + c.forkId
                                        const blocks = smgr.nBlocks(storageRel, 0)
                                        return { name: c.name, blocks }
                                })
                                out.push({ name: rel.name, relId: rel.relId, columns: cols, indexCount: rel.indexes.length })
                        }
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
export type Database = ReturnType<typeof createDatabase>

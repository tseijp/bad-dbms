import { createFileAdapter, createFile } from './storage/file'
import { createStorageManager } from './storage/smgr'
import { createBufferPool } from './storage/buffer'
import { createFreeSpaceMap } from './storage/free'
import { createLockManager } from './storage/lmng'
import { createTransam } from './access/transam'
import { createCatalog } from './catalog'
import { createExecutor } from './executor'

const drain = (iter: any) => {
        const out: any[] = []
        while (true) {
                const r = iter.next()
                if (r === null) break
                out.push(r)
        }
        iter.close()
        return out
}

export const createDatabase = (config: any = {}) => {
        const adapter = config.fileAdapter ?? createFileAdapter()
        const file = createFile(adapter)
        const pageSize = config.pageSize ?? 4096
        const smgr = createStorageManager({ file, pageSize })
        const buffer = createBufferPool({ smgr, frameCount: config.frameCount ?? 64, ringCount: config.ringCount ?? 8, pageSize })
        const fsm = createFreeSpaceMap({ smgr })
        const lock = createLockManager()
        const transam = createTransam()
        const catalog = createCatalog({ buffer, smgr, fsm, lock })
        const executor = createExecutor({ catalog, transam })
        const execute = (ast: any) => drain(executor.execute(ast))
        const transaction = async (fn: any) => {
                const tx = transam.begin()
                const result = await Promise.resolve(fn(tx)).then(
                        (r) => ({ ok: true, value: r }),
                        (err) => ({ ok: false, error: err })
                )
                if (!result.ok) {
                        transam.abort()
                        throw result.error
                }
                transam.commit()
                return result.value
        }
        const flush = () => buffer.flushAll()
        const stats = () => {
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
        }
        return { catalog, execute, transaction, stats, flush }
}

export type Database = ReturnType<typeof createDatabase>

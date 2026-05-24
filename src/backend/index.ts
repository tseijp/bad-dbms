import { createFileAdapter, createFile } from './storage/file'
import { createStorageManager } from './storage/smgr'
import { createBufferPool } from './storage/buffer'
import { createFreeSpaceMap } from './storage/free'
import { createCatalog } from './catalog'
import { createExecutor } from './executor'
import type { Row, ExecuteAst } from '../shared/types'
import type { FileAdapter, RowIterator } from './types'
const drain = (iter: RowIterator): Row[] => {
        const out: Row[] = []
        if (!iter || typeof iter.next !== 'function') return out
        while (true) {
                const r = iter.next()
                if (r === null || r === undefined) break
                out.push(r)
        }
        iter.close()
        return out
}
export interface BackendConfig {
        fileAdapter?: FileAdapter
        pageSize?: number
        frameCount?: number
}
export const createBackend = ({ fileAdapter = createFileAdapter(), pageSize = 4096, frameCount = 64 }: BackendConfig = {}) => {
        const smgr = createStorageManager({ file: createFile(fileAdapter), pageSize })
        const buffer = createBufferPool({ smgr, frameCount, pageSize })
        const fsm = createFreeSpaceMap()
        const catalog = createCatalog({ buffer, smgr, fsm })
        const _executor = createExecutor({ catalog })
        return {
                buffer,
                smgr,
                fsm,
                catalog,
                async execute(ast: ExecuteAst): Promise<Row[]> {
                        if (!ast || !ast.op) return []
                        return drain(_executor.execute(ast))
                },
        }
}
export type Backend = ReturnType<typeof createBackend>

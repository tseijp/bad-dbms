import { createStorageManager } from './storage/smgr'
import { createBufferPool } from './storage/buffer'
import { createFreeSpaceMap } from './storage/free'
import { createCatalog } from './catalog'
import { createExecutor } from './executor'
import type { Row, ExecuteAst } from '../shared/types'
import type { FileAdapter } from './types'
export interface BackendConfig {
        file: FileAdapter
        pageSize?: number
        frameCount?: number
}
export const createBackend = ({ file, pageSize = 4096, frameCount = 64 }: BackendConfig) => {
        const smgr = createStorageManager({ file, pageSize })
        const buffer = createBufferPool({ smgr, frameCount, pageSize })
        const fsm = createFreeSpaceMap()
        const catalog = createCatalog({ buffer, smgr, fsm })
        return {
                buffer,
                smgr,
                fsm,
                catalog,
                async execute(ast: ExecuteAst): Promise<Row[]> {
                        if (!ast || !ast.op) return []
                        const iter = await createExecutor({ catalog }).execute(ast)
                        const out: Row[] = []
                        if (!iter || typeof iter.next !== 'function') return out
                        while (true) {
                                const r = await iter.next()
                                if (r === null || r === undefined) break
                                out.push(r)
                        }
                        iter.close()
                        return out
                },
        }
}
export type Backend = ReturnType<typeof createBackend>

import type { FileAdapter } from '../../shared/types'
declare const Bun: any
// @ts-ignore
const _fs = () => import('node:fs/promises')
// @ts-ignore
const _path = () => import('node:path')
const walk = async (root: string, current: string): Promise<string[]> => {
        const { readdir } = await _fs()
        const { join, relative, sep } = await _path()
        const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
        const out: string[] = []
        for (const entry of entries) {
                const full = join(current, entry.name)
                if (entry.isDirectory()) {
                        const sub = await walk(root, full)
                        for (const s of sub) out.push(s)
                        continue
                }
                const rel = relative(root, full).split(sep).join('/')
                out.push(rel)
        }
        return out
}
export const createBunAdapter = (dir = 'tmp'): FileAdapter => ({
        get: async (key) => {
                const { join } = await _path()
                const file = Bun.file(join(dir, key))
                const exists = await file.exists().catch(() => false)
                if (!exists) return undefined
                const buf = await file.arrayBuffer().catch(() => undefined)
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                const { mkdir } = await _fs()
                const { dirname, join } = await _path()
                const full = join(dir, key)
                await mkdir(dirname(full), { recursive: true }).catch(() => undefined)
                await Bun.write(full, bytes)
        },
        delete: async (key) => {
                const { unlink } = await _fs()
                const { join } = await _path()
                await unlink(join(dir, key)).catch(() => undefined)
        },
        list: async (prefix) => {
                const all = await walk(dir, dir)
                return all.filter((k) => k.startsWith(prefix))
        },
})

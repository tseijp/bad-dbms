import type { FileAdapter } from '../../shared/types'
// @ts-ignore
const _fs = () => import('node:fs/promises')
// @ts-ignore
const _path = () => import('node:path')
const _walk = async (root: string, current: string): Promise<string[]> => {
        const { readdir } = await _fs()
        const { join, relative, sep } = await _path()
        const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
        const out: string[] = []
        for (const entry of entries) {
                const full = join(current, entry.name)
                if (entry.isDirectory()) {
                        const sub = await _walk(root, full)
                        for (const s of sub) out.push(s)
                        continue
                }
                const rel = relative(root, full).split(sep).join('/')
                out.push(rel)
        }
        return out
}
export const createNodejsAdapter = (dir = '.bad-dbms'): FileAdapter => ({
        async get(key) {
                const { readFile } = await _fs()
                const { join } = await _path()
                const bytes = await readFile(join(dir, key)).catch(() => undefined)
                if (!bytes) return undefined
                return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        },
        async put(key, bytes) {
                const { mkdir, writeFile } = await _fs()
                const { dirname, join } = await _path()
                const full = join(dir, key)
                await mkdir(dirname(full), { recursive: true }).catch(() => undefined)
                await writeFile(full, bytes)
        },
        async delete(key) {
                const { unlink } = await _fs()
                const { join } = await _path()
                await unlink(join(dir, key)).catch(() => undefined)
        },
        async list(prefix) {
                const all = await _walk(dir, dir)
                return all.filter((k) => k.startsWith(prefix))
        },
})

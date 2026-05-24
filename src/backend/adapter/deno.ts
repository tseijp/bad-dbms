import type { FileAdapter } from '../../shared/types'
declare const Deno: any
// @ts-ignore
const _path = () => import('node:path')
const walk = async (root: string, current: string): Promise<string[]> => {
        const { join, relative, sep } = await _path()
        const out: string[] = []
        const iter = Deno.readDir(current)
        const entries: any[] = []
        await (async () => {
                for await (const entry of iter) entries.push(entry)
        })().catch(() => undefined)
        for (const entry of entries) {
                const full = join(current, entry.name)
                if (entry.isDirectory) {
                        const sub = await walk(root, full)
                        for (const s of sub) out.push(s)
                        continue
                }
                const rel = relative(root, full).split(sep).join('/')
                out.push(rel)
        }
        return out
}
export const createDenoAdapter = (dir = 'tmp'): FileAdapter => ({
        get: async (key) => {
                const { join } = await _path()
                const bytes = await Deno.readFile(join(dir, key)).catch(() => undefined)
                if (!bytes) return undefined
                return bytes as Uint8Array
        },
        put: async (key, bytes) => {
                const { dirname, join } = await _path()
                const full = join(dir, key)
                await Deno.mkdir(dirname(full), { recursive: true }).catch(() => undefined)
                await Deno.writeFile(full, bytes)
        },
        delete: async (key) => {
                const { join } = await _path()
                await Deno.remove(join(dir, key)).catch(() => undefined)
        },
        list: async (prefix) => {
                const all = await walk(dir, dir)
                return all.filter((k) => k.startsWith(prefix))
        },
})

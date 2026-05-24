import { readFile, writeFile, unlink, readdir, mkdir } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { FileAdapter } from '../../shared/types'

const walk = async (root: string, current: string): Promise<string[]> => {
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

export const createNodejsAdapter = (dir: string): FileAdapter => ({
        get: async (key) => {
                const full = join(dir, key)
                const bytes = await readFile(full).catch(() => undefined)
                if (!bytes) return undefined
                return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        },
        put: async (key, bytes) => {
                const full = join(dir, key)
                await mkdir(dirname(full), { recursive: true }).catch(() => undefined)
                await writeFile(full, bytes)
        },
        delete: async (key) => {
                const full = join(dir, key)
                await unlink(full).catch(() => undefined)
        },
        list: async (prefix) => {
                const all = await walk(dir, dir)
                return all.filter((k) => k.startsWith(prefix))
        },
})

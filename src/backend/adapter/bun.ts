import { unlink, readdir, mkdir } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { FileAdapter } from '../../shared/types'

declare const Bun: any

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

export const createBunAdapter = (dir: string): FileAdapter => ({
        get: async (key) => {
                const full = join(dir, key)
                const file = Bun.file(full)
                const exists = await file.exists().catch(() => false)
                if (!exists) return undefined
                const buf = await file.arrayBuffer().catch(() => undefined)
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                const full = join(dir, key)
                await mkdir(dirname(full), { recursive: true }).catch(() => undefined)
                await Bun.write(full, bytes)
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

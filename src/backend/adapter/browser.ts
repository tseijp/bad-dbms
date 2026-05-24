import type { FileAdapter } from '../../shared/types'
declare const navigator: any
export const createBrowserAdapter = (rootName = 'tmp'): FileAdapter => {
        const _root = navigator.storage.getDirectory().then((sr: any) => sr.getDirectoryHandle(rootName ?? 'bad-dbms', { create: true }))
        const split = (key: string) => {
                const parts = key.split('/').filter((p) => p.length > 0)
                const name = parts.pop() ?? ''
                return { dirs: parts, name }
        }
        const walkDir = async (parts: string[], create: boolean) => {
                let dir = await _root
                for (const part of parts) dir = await dir.getDirectoryHandle(part, { create }).catch(() => undefined)
                return dir
        }
        const listAll = async (dir: any, prefix: string): Promise<string[]> => {
                const out: string[] = []
                for await (const [name, handle] of dir.entries()) {
                        const path = prefix ? `${prefix}/${name}` : name
                        if (handle.kind === 'directory') {
                                const sub = await listAll(handle, path)
                                for (const s of sub) out.push(s)
                                continue
                        }
                        out.push(path)
                }
                return out
        }
        return {
                get: async (key) => {
                        const { dirs, name } = split(key)
                        const dir = await walkDir(dirs, false)
                        if (!dir) return undefined
                        const handle = await dir.getFileHandle(name).catch(() => undefined)
                        if (!handle) return undefined
                        const file = await handle.getFile().catch(() => undefined)
                        if (!file) return undefined
                        const buf = await file.arrayBuffer()
                        return new Uint8Array(buf)
                },
                put: async (key, bytes) => {
                        const { dirs, name } = split(key)
                        const dir = await walkDir(dirs, true)
                        if (!dir) return
                        const handle = await dir.getFileHandle(name, { create: true })
                        const writable = await handle.createWritable()
                        await writable.write(bytes)
                        await writable.close()
                },
                delete: async (key) => {
                        const { dirs, name } = split(key)
                        const dir = await walkDir(dirs, false)
                        if (!dir) return
                        await dir.removeEntry(name).catch(() => undefined)
                },
                list: async (prefix) => {
                        const all = await listAll(await _root, '')
                        return all.filter((k) => k.startsWith(prefix))
                },
        }
}

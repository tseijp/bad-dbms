import type { FileAdapter } from '../types'
export const createMemoryAdapter = (): FileAdapter => {
        const _store = new Map<string, Uint8Array>()
        return {
                async get(key) {
                        const v = _store.get(key)
                        return v && new Uint8Array(v)
                },
                async put(key, bytes) {
                        _store.set(key, new Uint8Array(bytes))
                },
                async delete(key) {
                        _store.delete(key)
                },
                async list(prefix) {
                        const out: string[] = []
                        for (const k of _store.keys()) if (k.startsWith(prefix)) out.push(k)
                        return out
                },
        }
}

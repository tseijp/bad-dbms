import type { FileAdapter } from '../types'
export const createMemoryAdapter = (): FileAdapter => {
        const _store = new Map<string, Uint8Array>()
        return {
                async get(key) {
                        return _store.get(key)
                },
                async put(key, bytes) {
                        _store.set(key, bytes)
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

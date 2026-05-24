import type { FileAdapter } from '../../shared/types'

export const createNetlifyAdapter = (store: any): FileAdapter => ({
        get: async (key) => {
                const buf = await store.get(key, { type: 'arrayBuffer' })
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                await store.set(key, bytes)
        },
        delete: async (key) => {
                await store.delete(key)
        },
        list: async (prefix) => {
                const out: string[] = []
                let cursor: string | undefined = undefined
                while (true) {
                        const res: any = await store.list({ prefix, cursor })
                        const blobs = res?.blobs ?? []
                        for (const b of blobs) out.push(b.key)
                        if (!res?.cursor) return out
                        cursor = res.cursor
                }
        },
})

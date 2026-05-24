import type { FileAdapter } from '../../shared/types'

export const createNetlifyAdapter = (store: any): FileAdapter => ({
        async get(key) {
                const buf = await store.get(key, { type: 'arrayBuffer' })
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        async put(key, bytes) {
                await store.set(key, bytes)
        },
        async delete(key) {
                await store.delete(key)
        },
        async list(prefix) {
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

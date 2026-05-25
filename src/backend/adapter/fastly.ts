import type { FileAdapter } from '../../shared/types'
export const createFastlyAdapter = (store: any): FileAdapter => ({
        async get(key) {
                const entry = await store.get(key)
                if (!entry) return undefined
                const buf = await entry.arrayBuffer()
                return new Uint8Array(buf)
        },
        async put(key, bytes) {
                await store.put(key, bytes)
        },
        async delete(key) {
                await store.delete(key)
        },
        async list(prefix) {
                const out: string[] = []
                let cursor: string | undefined = undefined
                while (true) {
                        const res: any = await store.list({ prefix, cursor })
                        const items = res?.list ?? []
                        for (const k of items) out.push(k)
                        if (!res?.next) return out
                        cursor = res.next
                }
        },
})

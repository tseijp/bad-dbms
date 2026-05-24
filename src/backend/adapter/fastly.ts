import type { FileAdapter } from '../../shared/types'

export const createFastlyAdapter = (store: any): FileAdapter => ({
        get: async (key) => {
                const entry = await store.get(key)
                if (!entry) return undefined
                const buf = await entry.arrayBuffer()
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                await store.put(key, bytes)
        },
        delete: async (key) => {
                await store.delete(key)
        },
        list: async (prefix) => {
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

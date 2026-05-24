import type { FileAdapter } from '../../shared/types'

export const createCloudflareWorkerAdapter = (kv: any): FileAdapter => ({
        get: async (key) => {
                const buf = await kv.get(key, 'arrayBuffer').catch(() => undefined)
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        put: async (key, bytes) => {
                await kv.put(key, bytes)
        },
        delete: async (key) => {
                await kv.delete(key).catch(() => undefined)
        },
        list: async (prefix) => {
                const out: string[] = []
                let cursor: string | undefined = undefined
                while (true) {
                        const res: any = await kv.list({ prefix, cursor })
                        for (const k of res.keys) out.push(k.name)
                        if (res.list_complete) break
                        cursor = res.cursor
                        if (!cursor) break
                }
                return out
        },
})

import type { FileAdapter } from '../../shared/types'

export const createCloudflareWorkerAdapter = (kv: any): FileAdapter => ({
        async get(key) {
                const buf = await kv.get(key, 'arrayBuffer').catch(() => undefined)
                if (!buf) return undefined
                return new Uint8Array(buf)
        },
        async put(key, bytes) {
                await kv.put(key, bytes)
        },
        async delete(key) {
                await kv.delete(key).catch(() => undefined)
        },
        async list(prefix) {
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

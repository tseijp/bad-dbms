import type { FileAdapter } from '../../shared/types'

declare const Buffer: any

const _encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

const _decode = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64'))

export const createVercelAdapter = (kv: any): FileAdapter => ({
        async get(key) {
                const value = await kv.get(key).catch(() => null)
                if (value === null || value === undefined) return undefined
                return _decode(value)
        },
        async put(key, bytes) {
                await kv.set(key, _encode(bytes))
        },
        async delete(key) {
                await kv.del(key).catch(() => undefined)
        },
        async list(prefix) {
                const out: string[] = []
                let cursor = 0
                while (true) {
                        const res: any = await kv.scan(cursor, { match: `${prefix}*`, count: 1000 })
                        const nextCursor = Array.isArray(res) ? res[0] : res.cursor
                        const keys = Array.isArray(res) ? res[1] : res.keys
                        for (const k of keys) out.push(k)
                        cursor = Number(nextCursor)
                        if (cursor === 0) break
                }
                return out
        },
})

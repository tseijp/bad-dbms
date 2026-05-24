import type { FileAdapter } from '../../shared/types'

declare const Buffer: any

const encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

const decode = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64'))

export const createVercelAdapter = (kv: any): FileAdapter => ({
        get: async (key) => {
                const value = await kv.get(key).catch(() => null)
                if (value === null || value === undefined) return undefined
                return decode(value as string)
        },
        put: async (key, bytes) => {
                await kv.set(key, encode(bytes))
        },
        delete: async (key) => {
                await kv.del(key).catch(() => undefined)
        },
        list: async (prefix) => {
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

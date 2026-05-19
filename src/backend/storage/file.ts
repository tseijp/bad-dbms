export const createFileAdapter = () => {
        const store = new Map<string, Uint8Array>()
        const read = (id: string, offset: number, length: number) => {
                const buf = store.get(id)
                const out = new Uint8Array(length)
                if (!buf) return out
                if (offset >= buf.length) return out
                const end = Math.min(buf.length, offset + length)
                out.set(buf.subarray(offset, end))
                return out
        }
        const write = (id: string, offset: number, bytes: Uint8Array) => {
                const need = offset + bytes.length
                const existing = store.get(id)
                if (!existing) {
                        const fresh = new Uint8Array(need)
                        fresh.set(bytes, offset)
                        store.set(id, fresh)
                        return
                }
                if (existing.length >= need) return void existing.set(bytes, offset)
                const grown = new Uint8Array(need)
                grown.set(existing)
                grown.set(bytes, offset)
                store.set(id, grown)
        }
        const sync = (_id: string) => {}
        const close = (_id: string) => {}
        const list = () => Array.from(store.keys())
        const exists = (id: string) => store.has(id)
        const size = (id: string) => store.get(id)?.length ?? 0
        return { read, write, sync, close, list, exists, size }
}

export const createFile = (adapter: any) => {
        const read = (id: string, offset: number, length: number): Uint8Array => {
                return adapter.read(id, offset, length)
        }
        const write = (id: string, offset: number, bytes: Uint8Array) => {
                adapter.write(id, offset, bytes)
        }
        const sync = (id: string) => adapter.sync(id)
        const close = (id: string) => adapter.close(id)
        const exists = (id: string) => {
                if (adapter.exists) return adapter.exists(id)
                return (adapter.list?.() ?? []).includes(id)
        }
        const size = (id: string) => {
                if (adapter.size) return adapter.size(id)
                return 0
        }
        return { read, write, sync, close, exists, size }
}

export const createFileAdapter = () => {
        const _store = new Map<string, Uint8Array>()
        return {
                read(id: string, offset: number, length: number) {
                        const buf = _store.get(id)
                        const out = new Uint8Array(length)
                        if (!buf) return out
                        if (offset >= buf.length) return out
                        const end = Math.min(buf.length, offset + length)
                        out.set(buf.subarray(offset, end))
                        return out
                },
                write(id: string, offset: number, bytes: Uint8Array) {
                        const need = offset + bytes.length
                        const existing = _store.get(id)
                        if (!existing) {
                                const fresh = new Uint8Array(need)
                                fresh.set(bytes, offset)
                                _store.set(id, fresh)
                                return
                        }
                        if (existing.length >= need) return void existing.set(bytes, offset)
                        const grown = new Uint8Array(need)
                        grown.set(existing)
                        grown.set(bytes, offset)
                        _store.set(id, grown)
                },
                sync(_id: string) {},
                close(_id: string) {},
                list() {
                        return Array.from(_store.keys())
                },
                exists(id: string) {
                        return _store.has(id)
                },
                size(id: string) {
                        return _store.get(id)?.length ?? 0
                },
        }
}
export const createFile = (adapter: any) => {
        const _adapter = adapter
        return {
                read(id: string, offset: number, length: number): Uint8Array {
                        return _adapter.read(id, offset, length)
                },
                write(id: string, offset: number, bytes: Uint8Array) {
                        _adapter.write(id, offset, bytes)
                },
                sync(id: string) {
                        return _adapter.sync(id)
                },
                close(id: string) {
                        return _adapter.close(id)
                },
                exists(id: string) {
                        if (_adapter.exists) return _adapter.exists(id)
                        return (_adapter.list?.() ?? []).includes(id)
                },
                size(id: string) {
                        if (_adapter.size) return _adapter.size(id)
                        return 0
                },
        }
}

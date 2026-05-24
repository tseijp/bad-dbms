import type { FileAdapter, FileHandle } from '../types'
export const createFileAdapter = (): FileAdapter => {
        const _store = new Map<string, Uint8Array>()
        return {
                read(id: string, offset: number, length: number) {
                        const buf = _store.get(id)
                        const out = new Uint8Array(length)
                        if (!buf || offset >= buf.length) return out
                        out.set(buf.subarray(offset, Math.min(buf.length, offset + length)))
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
                exists(id: string) {
                        return _store.has(id)
                },
        }
}
export const createFile = (adapter: FileAdapter): FileHandle => ({
        read: (id, offset, length) => adapter.read(id, offset, length),
        write: (id, offset, bytes) => adapter.write(id, offset, bytes),
        exists: (id) => !!adapter.exists?.(id),
})

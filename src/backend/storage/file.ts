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
const sanitizeId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_')
export const createOPFSAdapter = (opts: any = {}) => {
        const _dirName = opts.dir ?? 'bad-dbms'
        const _max = opts.maxHandles ?? 16
        const _lru = new Map<string, any>()
        let _root: any = null
        const rootDir = async () => {
                if (_root) return _root
                const base = await navigator.storage.getDirectory()
                _root = await base.getDirectoryHandle(_dirName, { create: true })
                return _root
        }
        const touch = (id: string, h: any) => {
                _lru.delete(id)
                _lru.set(id, h)
                if (_lru.size <= _max) return
                const oldest = _lru.keys().next().value as string
                _lru.get(oldest)?.access?.close()
                _lru.delete(oldest)
        }
        const acquire = async (id: string, create: boolean) => {
                const cached = _lru.get(id)
                if (cached) return touch(id, cached), cached
                const dir = await rootDir()
                const fh = await dir.getFileHandle(sanitizeId(id), { create })
                const access = await fh.createSyncAccessHandle()
                const h = { fh, access }
                touch(id, h)
                return h
        }
        return {
                async open(id: string) {
                        await acquire(id, true)
                },
                read(id: string, offset: number, length: number) {
                        const out = new Uint8Array(length)
                        const h = _lru.get(id)
                        if (!h) return out
                        h.access.read(out, { at: offset })
                        return out
                },
                write(id: string, offset: number, bytes: Uint8Array) {
                        const h = _lru.get(id)
                        if (!h) return
                        h.access.write(bytes, { at: offset })
                },
                sync(id: string) {
                        _lru.get(id)?.access.flush()
                },
                close(id: string) {
                        const h = _lru.get(id)
                        if (!h) return
                        h.access.close()
                        _lru.delete(id)
                },
                size(id: string) {
                        return _lru.get(id)?.access.getSize() ?? 0
                },
                exists(id: string) {
                        return _lru.has(id)
                },
                list() {
                        return Array.from(_lru.keys())
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

import type { ColumnType, PageKind, PageHeader, PageHeaderPatch, Page } from '../types'
export const PAGE_SIZE = 4096
export const HEADER_SIZE = 64
export type { PageKind } from '../types'
export type ValueType = ColumnType
const KIND_CODE: Record<PageKind, number> = { data: 1, leaf: 2, internal: 3, meta: 4 }
const CODE_KIND: Record<number, PageKind> = { 1: 'data', 2: 'leaf', 3: 'internal', 4: 'meta' }
const tombstoneBytesFor = (capacity: number) => Math.ceil(capacity / 8)
export const pageCapacity = (valueSize: number) => {
        return Math.floor(((PAGE_SIZE - HEADER_SIZE) * 8) / (valueSize * 8 + 1))
}
export const createPage = (bytes?: Uint8Array): Page => {
        const _buf = bytes ?? new Uint8Array(PAGE_SIZE)
        const _view = new DataView(_buf.buffer, _buf.byteOffset, _buf.byteLength)
        const getHeader = (): PageHeader => ({
                kind: CODE_KIND[_view.getUint8(0)] ?? 'data',
                prevPageId: _view.getInt32(4, true),
                nextPageId: _view.getInt32(8, true),
                slotCount: _view.getUint16(16, true),
        })
        const capacity = (valueSize: number) => pageCapacity(valueSize)
        const _valOff = HEADER_SIZE + tombstoneBytesFor(capacity(4))
        const isAlive = (slot: number) => {
                const off = HEADER_SIZE + (slot >> 3)
                const bit = slot & 7
                return ((_buf[off] >> bit) & 1) === 1
        }
        return {
                bytes: _buf,
                getHeader,
                setHeader(h: PageHeaderPatch) {
                        if (h.kind !== undefined) _view.setUint8(0, KIND_CODE[h.kind] ?? 1)
                        if (h.prevPageId !== undefined) _view.setInt32(4, h.prevPageId, true)
                        if (h.nextPageId !== undefined) _view.setInt32(8, h.nextPageId, true)
                        if (h.slotCount !== undefined) _view.setUint16(16, h.slotCount, true)
                },
                readValue(slot: number, type: ValueType): number {
                        const off = _valOff + slot * 4
                        if (type === 'i32') return _view.getInt32(off, true)
                        if (type === 'f32') return _view.getFloat32(off, true)
                        return _view.getUint32(off, true)
                },
                writeValue(slot: number, type: ValueType, val: number) {
                        const off = _valOff + slot * 4
                        if (type === 'i32') return _view.setInt32(off, val, true)
                        if (type === 'f32') return _view.setFloat32(off, val, true)
                        return _view.setUint32(off, val >>> 0, true)
                },
                isAlive,
                setAlive(slot: number, alive: boolean) {
                        const off = HEADER_SIZE + (slot >> 3)
                        const bit = slot & 7
                        if (alive) _buf[off] = _buf[off] | (1 << bit)
                        else _buf[off] = _buf[off] & ~(1 << bit)
                },
                capacity,
                liveCount() {
                        const h = getHeader()
                        let n = 0
                        for (let i = 0; i < h.slotCount; i++) if (isAlive(i)) n++
                        return n
                },
                readLeafEntry(slot: number) {
                        const off = _valOff + slot * 12
                        return {
                                key: _view.getInt32(off, true),
                                ridPageId: _view.getInt32(off + 4, true),
                                ridOffset: _view.getInt32(off + 8, true),
                        }
                },
                writeLeafEntry(slot: number, key: number, rid: { pageId: number; offset: number }) {
                        const off = _valOff + slot * 12
                        _view.setInt32(off, key, true)
                        _view.setInt32(off + 4, rid.pageId, true)
                        _view.setInt32(off + 8, rid.offset, true)
                },
                readInternalEntry(slot: number) {
                        const off = _valOff + slot * 8
                        return { key: _view.getInt32(off, true), childPageId: _view.getInt32(off + 4, true) }
                },
                writeInternalEntry(slot: number, key: number, childPageId: number) {
                        const off = _valOff + slot * 8
                        _view.setInt32(off, key, true)
                        _view.setInt32(off + 4, childPageId, true)
                },
        }
}

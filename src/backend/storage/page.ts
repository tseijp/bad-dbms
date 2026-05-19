export const PAGE_SIZE = 4096
export const HEADER_SIZE = 64

export type PageKind = 'data' | 'leaf' | 'internal' | 'meta'
export type ValueType = 'i32' | 'f32' | 'u32'

const KIND_CODE: any = { data: 1, leaf: 2, internal: 3, meta: 4 }
const CODE_KIND: any = { 1: 'data', 2: 'leaf', 3: 'internal', 4: 'meta' }

const tombstoneBytesFor = (capacity: number) => Math.ceil(capacity / 8)

export const pageCapacity = (valueSize: number) => {
        return Math.floor(((PAGE_SIZE - HEADER_SIZE) * 8) / (valueSize * 8 + 1))
}

export const createPage = (bytes?: Uint8Array) => {
        const buf = bytes ?? new Uint8Array(PAGE_SIZE)
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
        const getHeader = () => ({
                kind: (CODE_KIND[view.getUint8(0)] ?? 'data') as PageKind,
                level: view.getUint8(1),
                flags: view.getUint16(2, true),
                prevPageId: view.getInt32(4, true),
                nextPageId: view.getInt32(8, true),
                highKey: view.getInt32(12, true),
                slotCount: view.getUint16(16, true),
                tombstoneOffset: view.getUint16(18, true),
                valueOffset: view.getUint16(20, true),
                valueSize: view.getUint16(22, true),
        })
        const setHeader = (h: any) => {
                if (h.kind !== undefined) view.setUint8(0, KIND_CODE[h.kind] ?? 1)
                if (h.level !== undefined) view.setUint8(1, h.level)
                if (h.flags !== undefined) view.setUint16(2, h.flags, true)
                if (h.prevPageId !== undefined) view.setInt32(4, h.prevPageId, true)
                if (h.nextPageId !== undefined) view.setInt32(8, h.nextPageId, true)
                if (h.highKey !== undefined) view.setInt32(12, h.highKey, true)
                if (h.slotCount !== undefined) view.setUint16(16, h.slotCount, true)
                if (h.tombstoneOffset !== undefined) view.setUint16(18, h.tombstoneOffset, true)
                if (h.valueOffset !== undefined) view.setUint16(20, h.valueOffset, true)
                if (h.valueSize !== undefined) view.setUint16(22, h.valueSize, true)
        }
        const capacity = (valueSize: number) => pageCapacity(valueSize)
        const tombOff = () => {
                const h = getHeader()
                if (h.tombstoneOffset) return h.tombstoneOffset
                return HEADER_SIZE
        }
        const valOff = () => {
                const h = getHeader()
                if (h.valueOffset) return h.valueOffset
                const cap = capacity(h.valueSize || 4)
                return HEADER_SIZE + tombstoneBytesFor(cap)
        }
        const isAlive = (slot: number) => {
                const off = tombOff() + (slot >> 3)
                const bit = slot & 7
                return ((buf[off] >> bit) & 1) === 1
        }
        const setAlive = (slot: number, alive: boolean) => {
                const off = tombOff() + (slot >> 3)
                const bit = slot & 7
                if (alive) buf[off] = buf[off] | (1 << bit)
                else buf[off] = buf[off] & ~(1 << bit)
        }
        const slotByteOffset = (slot: number) => {
                const h = getHeader()
                return valOff() + slot * (h.valueSize || 4)
        }
        const readValue = (slot: number, type: ValueType) => {
                const off = slotByteOffset(slot)
                if (type === 'i32') return view.getInt32(off, true)
                if (type === 'f32') return view.getFloat32(off, true)
                return view.getUint32(off, true)
        }
        const writeValue = (slot: number, type: ValueType, val: number) => {
                const off = slotByteOffset(slot)
                if (type === 'i32') return view.setInt32(off, val, true)
                if (type === 'f32') return view.setFloat32(off, val, true)
                return view.setUint32(off, val >>> 0, true)
        }
        const liveCount = () => {
                const h = getHeader()
                let n = 0
                for (let i = 0; i < h.slotCount; i++) if (isAlive(i)) n++
                return n
        }
        const readLeafEntry = (slot: number) => {
                const off = valOff() + slot * 12
                return {
                        key: view.getInt32(off, true),
                        ridPageId: view.getInt32(off + 4, true),
                        ridOffset: view.getInt32(off + 8, true),
                }
        }
        const writeLeafEntry = (slot: number, key: number, rid: { pageId: number; offset: number }) => {
                const off = valOff() + slot * 12
                view.setInt32(off, key, true)
                view.setInt32(off + 4, rid.pageId, true)
                view.setInt32(off + 8, rid.offset, true)
        }
        const readInternalEntry = (slot: number) => {
                const off = valOff() + slot * 8
                return { key: view.getInt32(off, true), childPageId: view.getInt32(off + 4, true) }
        }
        const writeInternalEntry = (slot: number, key: number, childPageId: number) => {
                const off = valOff() + slot * 8
                view.setInt32(off, key, true)
                view.setInt32(off + 4, childPageId, true)
        }
        return {
                bytes: buf,
                getHeader,
                setHeader,
                readValue,
                writeValue,
                isAlive,
                setAlive,
                capacity,
                liveCount,
                readLeafEntry,
                writeLeafEntry,
                readInternalEntry,
                writeInternalEntry,
        }
}

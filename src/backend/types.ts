import type { ColumnType, Rid } from '../shared/types'
export type { ColumnType, Rid, FileAdapter } from '../shared/types'
export type ValueType = ColumnType
export type PageKind = 'data' | 'leaf' | 'internal' | 'meta'
export interface PageHeader {
        kind: PageKind
        prevPageId: number
        nextPageId: number
        slotCount: number
}
export type PageHeaderPatch = Partial<PageHeader>
export interface LeafEntry {
        key: number
        ridPageId: number
        ridOffset: number
}
export interface InternalEntry {
        key: number
        childPageId: number
}
export interface Page {
        bytes: Uint8Array
        getHeader(): PageHeader
        setHeader(h: PageHeaderPatch): void
        readValue(slot: number, type: ValueType): number
        writeValue(slot: number, type: ValueType, val: number): void
        isAlive(slot: number): boolean
        setAlive(slot: number, alive: boolean): void
        capacity(valueSize: number): number
        liveCount(): number
        readLeafEntry(slot: number): LeafEntry
        writeLeafEntry(slot: number, key: number, rid: { pageId: number; offset: number }): void
        readInternalEntry(slot: number): InternalEntry
        writeInternalEntry(slot: number, key: number, childPageId: number): void
}
export interface Frame {
        relId: number
        forkId: number
        blockNo: number
        bytes: Uint8Array
        pinCount: number
        usage: number
        valid: boolean
}
export interface FileHandle {
        read(id: string, offset: number, length: number): Uint8Array
        write(id: string, offset: number, bytes: Uint8Array): void
        exists(id: string): boolean
}
export interface SmgrHandle {
        fid: string
        nBlocks: number
}
export interface BufferPool {
        pin(relId: number, forkId: number, blockNo: number): Frame
        unpin(frame: Frame): void
}
export interface StorageManager {
        read(relId: number, forkId: number, blockNo: number): Uint8Array
        extend(relId: number, forkId: number): number
        nBlocks(relId: number, forkId: number): number
}
export interface FreeSpaceMap {
        findPage(relId: number, forkId: number, neededBytes: number): number
        update(relId: number, forkId: number, blockNo: number, freeBytes: number): void
}
export interface ColumnMeta {
        name: string
        type: ColumnType
        byteSize: number
        forkId: number
        isPrimary: boolean
        isUnique: boolean
        notNull: boolean
        isText: boolean
        defaultValue?: unknown
        defaultFn?: () => unknown
        references?: { table: string; column: string; onDelete?: string }
}
export interface IndexDescriptor {
        name: string
        columnIdx: number
        forkId: number
        handle: AccessIndex
}
export interface ColumnCodec {
        strings: string[]
        intern: Map<string, number>
        nulls: Set<string>
}
export interface RelationDescriptor {
        relId: number
        name: string
        columns: ColumnMeta[]
        indexes: IndexDescriptor[]
        heaps: HeapHandle[]
        idxHandles: AccessIndex[]
        codecs: ColumnCodec[]
}
export interface HeapHandle {
        insert(value: number): Rid
        read(rid: Rid): number | undefined
        update(rid: Rid, value: number): Rid
        delete(rid: Rid): void
        scan(emit: (rid: Rid, value: number) => boolean | void): void
        bulkLoad(values: number[]): Rid[]
}
export interface NBTreeHandle {
        insert(key: number, rid: Rid): void
        search(key: number): Rid | undefined
        forward(start: number, end: number, emit: (rid: Rid) => boolean | void): void
        backward(start: number, end: number, emit: (rid: Rid) => boolean | void): void
        bulkLoad(sortedEntries: Array<[number, Rid]>): void
        vacuum(): number
}
export type AccessIndex = NBTreeHandle
export interface RowIterator {
        next(): Record<string, unknown> | null
        close(): void
}

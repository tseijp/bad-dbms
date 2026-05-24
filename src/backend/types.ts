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
        dirty: boolean
}
export interface BufferPool {
        pin(relId: number, forkId: number, blockNo: number): Promise<Frame>
        unpin(frame: Frame, dirty?: boolean): Promise<void>
}
export interface ForkState {
        fid: string
        nBlocks: number
        known: boolean
}
export interface SMgrRelation {
        relId: number
        forks: ForkState[]
}
export interface StorageManager {
        open(relId: number): SMgrRelation
        create(rel: SMgrRelation, forkId: number): Promise<void>
        exists(rel: SMgrRelation, forkId: number): Promise<boolean>
        unlink(rel: SMgrRelation, forkId: number): Promise<void>
        read(rel: SMgrRelation, forkId: number, blockNo: number): Promise<Uint8Array>
        write(rel: SMgrRelation, forkId: number, blockNo: number, bytes: Uint8Array): Promise<void>
        extend(rel: SMgrRelation, forkId: number): Promise<number>
        nBlocks(rel: SMgrRelation, forkId: number): Promise<number>
        truncate(rel: SMgrRelation, forkId: number, blockNo: number): Promise<void>
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
        insert(value: number): Promise<Rid>
        read(rid: Rid): Promise<number | undefined>
        update(rid: Rid, value: number): Promise<Rid>
        delete(rid: Rid): Promise<void>
        scan(emit: (rid: Rid, value: number) => boolean | void | Promise<boolean | void>): Promise<void>
        bulkLoad(values: number[]): Promise<Rid[]>
}
export interface NBTreeHandle {
        insert(key: number, rid: Rid): Promise<void>
        search(key: number): Promise<Rid | undefined>
        forward(start: number, end: number, emit: (rid: Rid) => boolean | void | Promise<boolean | void>): Promise<void>
        backward(start: number, end: number, emit: (rid: Rid) => boolean | void | Promise<boolean | void>): Promise<void>
        bulkLoad(sortedEntries: Array<[number, Rid]>): Promise<void>
        vacuum(): Promise<number>
}
export type AccessIndex = NBTreeHandle
export interface RowIterator {
        next(): Promise<Record<string, unknown> | null>
        close(): void
}

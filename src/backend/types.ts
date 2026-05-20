import type { ColumnType, Rid } from '../shared/types'
export type { ColumnType, Rid, FileAdapter } from '../shared/types'
export type { Xid, SubXid, ClogStatus, Snapshot, TxState, TransamOptions } from './access/transam'

export type ValueType = ColumnType

export type PageKind = 'data' | 'leaf' | 'internal' | 'meta'

export interface PageHeader {
        kind: PageKind
        level: number
        flags: number
        prevPageId: number
        nextPageId: number
        highKey: number
        slotCount: number
        tombstoneOffset: number
        valueOffset: number
        valueSize: number
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

export type Hint = 'normal' | 'bulk_read' | 'bulk_write' | 'vacuum'

export interface Frame {
        relId: number
        forkId: number
        blockNo: number
        bytes: Uint8Array
        pinCount: number
        usage: number
        dirty: boolean
        valid: boolean
}

export interface FileHandle {
        read(id: string, offset: number, length: number): Uint8Array
        write(id: string, offset: number, bytes: Uint8Array): void
        sync(id: string): void
        close(id: string): void
        exists(id: string): boolean
        size(id: string): number
}

export interface SmgrHandle {
        fid: string
        nBlocks: number
}

export interface BufferPool {
        pin(relId: number, forkId: number, blockNo: number, hint?: Hint): Frame
        unpin(frame: Frame, dirty?: boolean): void
        flush(frame: Frame): void
        flushAll(): void
        stats(): { frameCount: number; ringCount: number; cached: number }
}

export interface StorageManager {
        read(relId: number, forkId: number, blockNo: number): Uint8Array
        write(relId: number, forkId: number, blockNo: number, bytes: Uint8Array): void
        extend(relId: number, forkId: number): number
        truncate(relId: number, forkId: number, newNBlocks: number): void
        nBlocks(relId: number, forkId: number): number
        sync(relId: number, forkId: number): void
        getHandle(relId: number, forkId: number): SmgrHandle
        prepare(relId: number, forkId: number): Promise<SmgrHandle>
}

export interface FreeSpaceMap {
        findPage(relId: number, forkId: number, neededBytes: number): number
        update(relId: number, forkId: number, blockNo: number, freeBytes: number): void
        extend(relId: number, forkId: number): number
}

export type LockMode = 'shared' | 'exclusive'
export type LatchMode = 'read' | 'write'

export interface IndexKind {
        nbtree: 'nbtree'
        hash: 'hash'
}

export interface ColumnMeta {
        name: string
        type: ColumnType
        byteSize: number
        forkId: number
        isPrimary: boolean
        isUnique: boolean
        hasOrder: boolean
}

export interface IndexDescriptor {
        name: string
        columnIdx: number
        kind: 'nbtree' | 'hash'
        forkId: number
        handle: AccessIndex
}

export interface RelationDescriptor {
        relId: number
        name: string
        columns: ColumnMeta[]
        indexes: IndexDescriptor[]
        heaps: HeapHandle[]
        idxHandles: AccessIndex[]
}

export interface TupleColumn {
        name: string
        type: ColumnType
        byteSize: number
        forkId: number
        heap: HeapHandle
        indexes: IndexDescriptor[]
}

export interface TupleDescriptor {
        columns: TupleColumn[]
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

export interface HashIndexHandle {
        insert(key: number, rid: Rid): void
        lookup(key: number, emit: (rid: Rid) => boolean | void): void
        deleteKey(key: number, rid?: Rid): void
        bulkLoad(entries: Iterable<[number, Rid]>): void
        vacuum(): number
}

export type AccessIndex = NBTreeHandle | HashIndexHandle

export interface RowIterator {
        next(): Record<string, unknown> | null
        close(): void
}

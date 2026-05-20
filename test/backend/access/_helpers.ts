import { createFileAdapter, createFile } from '../../../src/backend/storage/file'
import { createStorageManager } from '../../../src/backend/storage/smgr'
import { createFreeSpaceMap } from '../../../src/backend/storage/free'
import { createBufferPool } from '../../../src/backend/storage/buffer'
import { createPage } from '../../../src/backend/storage/page'
import { createHeap } from '../../../src/backend/access/heap'
import { createNBTree } from '../../../src/backend/access/nbtree'
import { createHashIndex } from '../../../src/backend/access/hash'
export interface StackOptions {
        frameCount?: number
        ringCount?: number
        pageSize?: number
}
export const createStack = (opts: StackOptions = {}) => {
        const adapter = createFileAdapter()
        const file = createFile(adapter)
        const smgr = createStorageManager({ file, pageSize: opts.pageSize ?? 4096 })
        const fsm = createFreeSpaceMap({ smgr })
        const buffer = createBufferPool({ smgr, frameCount: opts.frameCount ?? 32, ringCount: opts.ringCount ?? 8, pageSize: opts.pageSize ?? 4096 })
        return { adapter, file, smgr, fsm, buffer }
}
export const makeHeap = (relId = 1, valueType: 'i32' | 'f32' | 'u32' = 'i32') => {
        const stack = createStack()
        const heap = createHeap({ buffer: stack.buffer, smgr: stack.smgr, fsm: stack.fsm, relId, valueSize: 4, valueType })
        return { ...stack, heap, relId }
}
export const makeNBTree = (relId = 2, forkId = 1000) => {
        const stack = createStack()
        const tree = createNBTree({ buffer: stack.buffer, smgr: stack.smgr, fsm: stack.fsm, relId, forkId })
        return { ...stack, tree, relId, forkId }
}
export const makeHash = (relId = 3, forkId = 2000, initialBuckets = 2, bucketCapacity = 64) => {
        const stack = createStack()
        const hash = createHashIndex({ buffer: stack.buffer, smgr: stack.smgr, fsm: stack.fsm, relId, forkId, initialBuckets, bucketCapacity })
        return { ...stack, hash, relId, forkId }
}
export const LEAF_CAP = 64
export const META_BLOCK = 0
export const HEAP_FORK = 0
export const collectScan = (heap: any): Array<{ rid: [number, number]; value: any }> => {
        const out: Array<{ rid: [number, number]; value: any }> = []
        heap.scan((rid: [number, number], value: any) => {
                out.push({ rid, value })
        })
        return out
}
export const collectForward = (tree: any, start: number, end: number): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        tree.forward(start, end, (rid: [number, number]) => {
                out.push(rid)
        })
        return out
}
export const collectBackward = (tree: any, start: number, end: number): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        tree.backward(start, end, (rid: [number, number]) => {
                out.push(rid)
        })
        return out
}
export const collectLookup = (hash: any, key: number): Array<[number, number]> => {
        const out: Array<[number, number]> = []
        hash.lookup(key, (rid: [number, number]) => {
                out.push(rid)
        })
        return out
}
export const readRootPageId = (stack: any, relId: number, forkId: number): number => {
        const frame = stack.buffer.pin(relId, forkId, META_BLOCK)
        const page = createPage(frame.bytes)
        const root = page.readValue(0, 'i32')
        stack.buffer.unpin(frame, false)
        return root
}
export const readHashMeta = (stack: any, relId: number, forkId: number) => {
        const frame = stack.buffer.pin(relId, forkId, META_BLOCK)
        const page = createPage(frame.bytes)
        const out = {
                nBuckets: page.readValue(0, 'i32'),
                splitPointer: page.readValue(1, 'i32'),
                level: page.readValue(2, 'i32'),
                tuples: page.readValue(3, 'i32'),
        }
        stack.buffer.unpin(frame, false)
        return out
}
export const readPageHeader = (stack: any, relId: number, forkId: number, blockNo: number) => {
        const frame = stack.buffer.pin(relId, forkId, blockNo)
        const page = createPage(frame.bytes)
        const h = page.getHeader()
        stack.buffer.unpin(frame, false)
        return h
}

import { describe, it, expect } from 'vitest'
import { makeNBTree, collectForward, collectBackward, readRootPageId, readPageHeader, LEAF_CAP } from './_helpers'
describe('nbtree', () => {
        it('reserves meta block (0) and an empty leaf root (1) on creation', () => {
                const { tree, smgr, relId, forkId, ...stack } = makeNBTree()
                expect(smgr.nBlocks(relId, forkId)).toBe(2)
                expect(readRootPageId({ buffer: stack.buffer } as any, relId, forkId)).toBe(1)
        })
        it('search(key) returns the rid inserted with that key', () => {
                const { tree } = makeNBTree()
                tree.insert(10, [100, 5])
                expect(tree.search(10)).toEqual([100, 5])
        })
        it('search(key) returns undefined for a key never inserted', () => {
                const { tree } = makeNBTree()
                tree.insert(1, [0, 0])
                expect(tree.search(999)).toBeUndefined()
        })
        it('keeps root pageId at 1 while inserts stay below LEAF_CAP', () => {
                const { tree, buffer, relId, forkId } = makeNBTree()
                for (let i = 0; i < LEAF_CAP - 1; i++) tree.insert(i, [i, 0])
                expect(readRootPageId({ buffer } as any, relId, forkId)).toBe(1)
        })
        it('creates a right-side new leaf with sibling pointers when LEAF_CAP is exceeded', () => {
                const stack = makeNBTree()
                const { tree, buffer, relId, forkId } = stack
                for (let i = 0; i < LEAF_CAP + 1; i++) tree.insert(i, [i, 0])
                const leftHeader = readPageHeader({ buffer } as any, relId, forkId, 1)
                expect(leftHeader.nextPageId).toBeGreaterThanOrEqual(2)
                const rightHeader = readPageHeader({ buffer } as any, relId, forkId, leftHeader.nextPageId)
                expect(rightHeader.prevPageId).toBe(1)
        })
        it('propagates a new pivot key up to the parent internal node on leaf split', () => {
                const stack = makeNBTree()
                const { tree, buffer, relId, forkId } = stack
                for (let i = 0; i < LEAF_CAP + 1; i++) tree.insert(i, [i, 0])
                const rootBefore = readRootPageId({ buffer } as any, relId, forkId)
                const beforeHeader = readPageHeader({ buffer } as any, relId, forkId, rootBefore)
                for (let i = LEAF_CAP + 1; i < LEAF_CAP * 2 + 5; i++) tree.insert(i, [i, 0])
                const rootAfter = readRootPageId({ buffer } as any, relId, forkId)
                const afterHeader = readPageHeader({ buffer } as any, relId, forkId, rootAfter)
                expect(afterHeader.slotCount).toBeGreaterThan(beforeHeader.slotCount)
        })
        it('grows tree height by 1 when the root internal node itself splits', () => {
                const stack = makeNBTree()
                const { tree, buffer, relId, forkId } = stack
                const total = LEAF_CAP * (LEAF_CAP + 4)
                for (let i = 0; i < total; i++) tree.insert(i, [i, 0])
                const root = readRootPageId({ buffer } as any, relId, forkId)
                expect(root).toBeGreaterThan(1)
                const rootHeader = readPageHeader({ buffer } as any, relId, forkId, root)
                expect(rootHeader.kind).toBe('internal')
        })
        it('forward(start, end, emit) emits the range in ascending key order across leaves', () => {
                const stack = makeNBTree()
                const { tree } = stack
                for (let i = 0; i < LEAF_CAP * 2; i++) tree.insert(i, [i, 0])
                const seen = collectForward(tree, 10, 100)
                const keys = seen.map((r) => r[0])
                const sorted = [...keys].sort((a, b) => a - b)
                expect(keys).toEqual(sorted)
        })
        it('stops forward scan when the emit callback returns false', () => {
                const stack = makeNBTree()
                const { tree } = stack
                for (let i = 0; i < LEAF_CAP * 2; i++) tree.insert(i, [i, 0])
                const seen: Array<[number, number]> = []
                tree.forward(0, 1000, (rid: [number, number]) => {
                        seen.push(rid)
                        if (seen.length === 3) return false
                })
                expect(seen.length).toBe(3)
        })
        it('backward(start, end, emit) emits the range in descending key order', () => {
                const stack = makeNBTree()
                const { tree } = stack
                for (let i = 0; i < LEAF_CAP * 2; i++) tree.insert(i, [i, 0])
                const seen = collectBackward(tree, 10, 50)
                const keys = seen.map((r) => r[0])
                const sortedDesc = [...keys].sort((a, b) => b - a)
                expect(keys).toEqual(sortedDesc)
        })
        it('bulkLoad packs leaves densely up to LEAF_CAP without split', () => {
                const stack = makeNBTree()
                const { tree, buffer, relId, forkId } = stack
                const entries: Array<[number, [number, number]]> = []
                for (let i = 0; i < LEAF_CAP * 3; i++) entries.push([i, [i, 0]])
                tree.bulkLoad(entries)
                const firstLeafHeader = readPageHeader({ buffer } as any, relId, forkId, 2)
                expect(firstLeafHeader.slotCount).toBe(LEAF_CAP)
        })
        it('search after bulkLoad returns input rids and forward emits all keys', () => {
                const stack = makeNBTree()
                const { tree } = stack
                const total = LEAF_CAP * 3
                const entries: Array<[number, [number, number]]> = []
                for (let i = 0; i < total; i++) entries.push([i, [i, 0]])
                tree.bulkLoad(entries)
                expect(tree.search(0)).toEqual([0, 0])
                const seen = collectForward(tree, 0, total - 1)
                expect(seen.length).toBe(total)
        })
        // Roadmap: nbtree leaf merge / borrow on under-fill, vacuum / squeeze of
        // tombstoned slots, and parallel-worker lock/latch wiring are intentionally
        // outside the current test list (see access.md trailing comment block).
})

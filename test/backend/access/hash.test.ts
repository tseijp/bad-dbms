import { describe, it, expect } from 'vitest'
import { createStack, collectLookup, readHashMeta, readPageHeader } from './_helpers'
import { createHashIndex } from '../../../src/backend/access/hash'
import type { Rid } from '../../../src/shared/types'
const makeHashWith = (overrides: any = {}) => {
        const stack = createStack()
        const hash = createHashIndex({
                buffer: stack.buffer,
                smgr: stack.smgr,
                fsm: stack.fsm,
                relId: 3,
                forkId: 2000,
                initialBuckets: 2,
                bucketCapacity: 64,
                ...overrides,
        })
        return { ...stack, hash, relId: 3, forkId: 2000 }
}
describe('hash', () => {
        it('writes initial nBuckets / splitPointer / level / tuples to the meta block on creation', () => {
                const stack = makeHashWith()
                const meta = readHashMeta(stack, stack.relId, stack.forkId)
                expect(meta).toEqual({ nBuckets: 2, splitPointer: 0, level: 1, tuples: 0 })
        })
        it('lookup(key) emits the rid inserted under that key', () => {
                const { hash } = makeHashWith()
                hash.insert(7, [10, 1])
                const seen = collectLookup(hash, 7)
                expect(seen).toEqual([[10, 1]])
        })
        it('lookup emits every rid inserted under the same key', () => {
                const { hash } = makeHashWith()
                hash.insert(5, [0, 1])
                hash.insert(5, [0, 2])
                hash.insert(5, [0, 3])
                const seen = collectLookup(hash, 5)
                expect(seen.length).toBe(3)
        })
        it('stops lookup emission when the callback returns false', () => {
                const { hash } = makeHashWith({ hash: () => 0, initialBuckets: 16, bucketCapacity: 2 })
                hash.insert(1, [0, 1])
                hash.insert(2, [0, 2])
                hash.insert(3, [0, 3])
                const seen: Rid[] = []
                hash.lookup(1, (rid) => {
                        seen.push(rid)
                        return false
                })
                expect(seen.length).toBe(1)
        })
        it('emits nothing when the equal factory rejects every comparison', () => {
                const { hash } = makeHashWith({ equal: () => false })
                hash.insert(42, [1, 0])
                const seen = collectLookup(hash, 42)
                expect(seen).toEqual([])
        })
        it('chains an overflow page via nextPageId when the primary bucket fills', () => {
                const stack = makeHashWith({ hash: () => 0, initialBuckets: 16, bucketCapacity: 2 })
                stack.hash.insert(1, [0, 1])
                stack.hash.insert(2, [0, 2])
                stack.hash.insert(3, [0, 3])
                const primaryHeader = readPageHeader(stack, stack.relId, stack.forkId, 1)
                expect(primaryHeader.nextPageId).toBeGreaterThanOrEqual(0)
        })
        it('runs incremental split that advances splitPointer when load factor exceeds 1.5', () => {
                const stack = makeHashWith()
                for (let i = 0; i < 4; i++) stack.hash.insert(i, [i, 0])
                const meta = readHashMeta(stack, stack.relId, stack.forkId)
                expect(meta.splitPointer).toBe(1)
        })
        it('wraps splitPointer to 0 and increments level when it reaches 1 << level', () => {
                const stack = makeHashWith()
                for (let i = 0; i < 5; i++) stack.hash.insert(i, [i, 0])
                const meta = readHashMeta(stack, stack.relId, stack.forkId)
                expect(meta.splitPointer).toBe(0)
                expect(meta.level).toBe(2)
        })
        it('removes a key from lookup emission after deleteKey tombstones it', () => {
                const { hash } = makeHashWith()
                hash.insert(7, [10, 1])
                hash.deleteKey(7)
                const seen = collectLookup(hash, 7)
                expect(seen).toEqual([])
        })
        it('makes every bulkLoad entry visible via lookup', () => {
                const { hash } = makeHashWith()
                const entries: Array<[number, [number, number]]> = [
                        [1, [0, 1]],
                        [2, [0, 2]],
                        [3, [0, 3]],
                ]
                hash.bulkLoad(entries)
                const seen1 = collectLookup(hash, 1)
                const seen2 = collectLookup(hash, 2)
                const seen3 = collectLookup(hash, 3)
                expect(seen1.length + seen2.length + seen3.length).toBe(3)
        })
})

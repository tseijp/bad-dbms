import { describe, it, expect } from 'vitest'
import { pageCapacity } from '../../../src/backend/storage/page'
import { makeHeap, collectScan } from './_helpers'

describe('heap', () => {
        it('insert(value) returns a [pageId, offset] shaped rid', () => {
                const { heap } = makeHeap()
                const rid = heap.insert(42)
                expect(rid.length).toBe(2)
        })

        it('returns offsets that increase monotonically across consecutive inserts on the same page', () => {
                const { heap } = makeHeap()
                const r1 = heap.insert(10)
                const r2 = heap.insert(20)
                expect(r2[0]).toBe(r1[0])
                expect(r2[1]).toBeGreaterThan(r1[1])
        })

        it('read(rid) returns the value most recently written via insert', () => {
                const { heap } = makeHeap()
                const rid = heap.insert(7)
                expect(heap.read(rid)).toBe(7)
        })

        it('update(rid, v) makes the next read(rid) return v with the same rid', () => {
                const { heap } = makeHeap()
                const rid = heap.insert(1)
                const rid2 = heap.update(rid, 99)
                expect(heap.read(rid)).toBe(99)
                expect(rid2).toEqual(rid)
        })

        it('read(rid) after delete(rid) returns undefined', () => {
                const { heap } = makeHeap()
                const rid = heap.insert(3)
                heap.delete(rid)
                expect(heap.read(rid)).toBeUndefined()
        })

        it('scan() excludes deleted slots from emission', () => {
                const { heap } = makeHeap()
                const r1 = heap.insert(11)
                heap.insert(22)
                heap.delete(r1)
                const seen = collectScan(heap)
                const match = seen.find((s) => s.rid[0] === r1[0] && s.rid[1] === r1[1])
                expect(match).toBeUndefined()
        })

        it('scan() emits every alive (rid, value) exactly once', () => {
                const { heap } = makeHeap()
                heap.insert(100)
                heap.insert(200)
                heap.insert(300)
                const values = collectScan(heap)
                        .map((s) => s.value)
                        .sort((a, b) => a - b)
                expect(values).toEqual([100, 200, 300])
        })

        it('scan() stops emitting after the callback returns false', () => {
                const { heap } = makeHeap()
                heap.insert(1)
                heap.insert(2)
                heap.insert(3)
                const seen: any[] = []
                heap.scan((_rid: [number, number], v: any) => {
                        seen.push(v)
                        return false
                })
                expect(seen.length).toBe(1)
        })

        it('switches pageId when inserts exceed a single page capacity', () => {
                const { heap } = makeHeap()
                const cap = pageCapacity(4)
                const rids: Array<[number, number]> = []
                for (let i = 0; i < cap + 1; i++) rids.push(heap.insert(i))
                const firstPage = rids[0][0]
                const overflow = rids.find((r) => r[0] !== firstPage)
                expect(overflow).toBeDefined()
        })

        it('update on a deleted slot is a no-op (no revive, no value change)', () => {
                const { heap } = makeHeap()
                const rid = heap.insert(5)
                heap.delete(rid)
                heap.update(rid, 100)
                expect(heap.read(rid)).toBeUndefined()
        })

        it('bulkLoad(values) returns rids in input order via append-only path', () => {
                const { heap } = makeHeap()
                const rids = (heap as any).bulkLoad([10, 20, 30])
                expect(rids.map((r: [number, number]) => heap.read(r))).toEqual([10, 20, 30])
        })
})

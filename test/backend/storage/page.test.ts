import { describe, it, expect } from 'vitest'
import { createPage, pageCapacity, PAGE_SIZE, HEADER_SIZE } from '../../../src/backend/storage/page'

describe('page', () => {
        it('returns an initial header where every documented field is readable', () => {
                const page = createPage()
                expect(page.getHeader()).toEqual({
                        kind: 'data',
                        level: 0,
                        flags: 0,
                        prevPageId: 0,
                        nextPageId: 0,
                        highKey: 0,
                        slotCount: 0,
                        tombstoneOffset: 0,
                        valueOffset: 0,
                        valueSize: 0,
                })
        })

        it('updates only the fields named in setHeader and leaves the rest unchanged', () => {
                const page = createPage()
                page.setHeader({ kind: 'leaf', valueSize: 12, slotCount: 5 })
                const h = page.getHeader()
                expect(h).toEqual({
                        kind: 'leaf',
                        level: 0,
                        flags: 0,
                        prevPageId: 0,
                        nextPageId: 0,
                        highKey: 0,
                        slotCount: 5,
                        tombstoneOffset: 0,
                        valueOffset: 0,
                        valueSize: 12,
                })
        })

        it('reads back an i32 value written at the same slot', () => {
                const page = createPage()
                page.setHeader({ valueSize: 4 })
                page.writeValue(3, 'i32', -42)
                expect(page.readValue(3, 'i32')).toBe(-42)
        })

        it('reads back a u32 value written at the same slot', () => {
                const page = createPage()
                page.setHeader({ valueSize: 4 })
                page.writeValue(7, 'u32', 0xdeadbeef)
                expect(page.readValue(7, 'u32')).toBe(0xdeadbeef)
        })

        it('reads back an f32 value written at the same slot', () => {
                const page = createPage()
                page.setHeader({ valueSize: 4 })
                page.writeValue(2, 'f32', 1.5)
                expect(page.readValue(2, 'f32')).toBe(1.5)
        })

        it('reports a slot as alive after setAlive(slot, true)', () => {
                const page = createPage()
                page.setAlive(5, true)
                expect(page.isAlive(5)).toBe(true)
        })

        it('reports a slot as dead after setAlive(slot, false)', () => {
                const page = createPage()
                page.setAlive(5, true)
                page.setAlive(5, false)
                expect(page.isAlive(5)).toBe(false)
        })

        it('keeps unrelated slots unchanged when a single slot is toggled', () => {
                const page = createPage()
                page.setAlive(0, true)
                page.setAlive(2, true)
                page.setAlive(4, true)
                page.setAlive(2, false)
                const others = [page.isAlive(0), page.isAlive(4)]
                expect(others).toEqual([true, true])
        })

        it('computes capacity as floor((PAGE_SIZE - HEADER_SIZE) * 8 / (valueSize * 8 + 1))', () => {
                expect(pageCapacity(4)).toBe(Math.floor(((PAGE_SIZE - HEADER_SIZE) * 8) / (4 * 8 + 1)))
        })

        it('returns 977 for capacity at valueSize = 4', () => {
                expect(pageCapacity(4)).toBe(977)
        })

        it('counts live slots as the number set alive', () => {
                const page = createPage()
                page.setHeader({ slotCount: 10, valueSize: 4 })
                page.setAlive(1, true)
                page.setAlive(4, true)
                page.setAlive(7, true)
                expect(page.liveCount()).toBe(3)
        })

        it('decrements liveCount when an alive slot is set dead', () => {
                const page = createPage()
                page.setHeader({ slotCount: 10, valueSize: 4 })
                page.setAlive(1, true)
                page.setAlive(4, true)
                page.setAlive(4, false)
                expect(page.liveCount()).toBe(1)
        })

        it('reads back a leaf entry with the same key and rid that was written', () => {
                const page = createPage()
                page.setHeader({ kind: 'leaf', valueSize: 12 })
                page.writeLeafEntry(2, 123, { pageId: 7, offset: 9 })
                expect(page.readLeafEntry(2)).toEqual({ key: 123, ridPageId: 7, ridOffset: 9 })
        })

        it('reads back an internal entry with the same key and child page id that was written', () => {
                const page = createPage()
                page.setHeader({ kind: 'internal', valueSize: 8 })
                page.writeInternalEntry(1, 50, 21)
                expect(page.readInternalEntry(1)).toEqual({ key: 50, childPageId: 21 })
        })

        it('keeps tombstone bitmap and value area inside the HEADER_SIZE boundary', () => {
                const page = createPage()
                const tombBytes = Math.ceil(pageCapacity(4) / 8)
                page.setHeader({
                        valueSize: 4,
                        tombstoneOffset: HEADER_SIZE,
                        valueOffset: HEADER_SIZE + tombBytes,
                })
                const h = page.getHeader()
                expect(h.tombstoneOffset).toBeGreaterThanOrEqual(HEADER_SIZE)
                expect(h.valueOffset).toBeGreaterThanOrEqual(h.tombstoneOffset + tombBytes)
        })
})

import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { makeScored, fresh, seqOf } from './_fixtures'

describe('limit with offset forms a pagination window', () => {
        // A reader paging a ten-row board pulls fixed-size pages by
        // combining offset (where the page starts) with limit (how
        // wide it is). Every page is a slice of the same sorted board.
        const tenRows = Array.from({ length: 10 }, (_v, i) => ({ id: 10 - i, score: (10 - i) * 10 }))

        it.each([
                ['page one', 0, 3, [1, 2, 3]],
                ['page two', 3, 3, [4, 5, 6]],
                ['page three', 6, 3, [7, 8, 9]],
                ['final partial page', 9, 3, [10]],
                ['a mid-range window', 2, 4, [3, 4, 5, 6]],
                ['a single-row window', 5, 1, [6]],
        ] as const)('%s of the ten-row board comes back as the documented ids', async (_label, off, lim, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(off).limit(lim)
                expect(seqOf(rows, 'id')).toEqual(expected)
        })

        it('walking every page in turn visits all ten rows exactly once', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const p1 = await db.select().from(t).orderBy(asc(t.id)).offset(0).limit(4)
                const p2 = await db.select().from(t).orderBy(asc(t.id)).offset(4).limit(4)
                const p3 = await db.select().from(t).orderBy(asc(t.id)).offset(8).limit(4)
                expect([...seqOf(p1, 'id'), ...seqOf(p2, 'id'), ...seqOf(p3, 'id')]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        })

        it('a page starting past the end of the board is empty', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(20).limit(3)
                expect(rows).toEqual([])
        })

        it('the last page is shorter than the page size when rows run out', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(8).limit(5)
                expect(seqOf(rows, 'id')).toEqual([9, 10])
        })

        it('consecutive pages never share a row', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const p1 = await db.select().from(t).orderBy(asc(t.id)).offset(0).limit(3)
                const p2 = await db.select().from(t).orderBy(asc(t.id)).offset(3).limit(3)
                const overlap = seqOf(p1, 'id').filter((id) => seqOf(p2, 'id').includes(id))
                expect(overlap).toEqual([])
        })

        it('a descending pagination window pulls the documented high-score page', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const rows = await db.select().from(t).orderBy(desc(t.score)).offset(2).limit(3)
                expect(seqOf(rows, 'score')).toEqual([80, 70, 60])
        })

        it('paging with offset zero and a limit behaves like a plain top-N', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(tenRows)
                const paged = await db.select().from(t).orderBy(asc(t.id)).offset(0).limit(3)
                const topN = await db.select().from(t).orderBy(asc(t.id)).limit(3)
                expect(seqOf(paged, 'id')).toEqual(seqOf(topN, 'id'))
        })
})

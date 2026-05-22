import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { makeScored, fresh, seqOf } from './_fixtures'
describe('limit keeps the top of an ordered result', () => {
        // A reader who only wants the top few of a sorted board reaches
        // for limit. The window is taken after the sort, so it is the
        // genuine top-N, not the first-N-inserted.
        const board = [
                { id: 1, score: 50 },
                { id: 2, score: 10 },
                { id: 3, score: 90 },
                { id: 4, score: 30 },
                { id: 5, score: 70 },
        ]
        it.each([
                [1, [10]],
                [2, [10, 30]],
                [3, [10, 30, 50]],
                [4, [10, 30, 50, 70]],
                [5, [10, 30, 50, 70, 90]],
        ] as const)('the lowest %i scores come back when limit is %i after an ascending sort', async (n, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(n)
                expect(seqOf(rows, 'score')).toEqual(expected)
        })
        it.each([
                [1, [90]],
                [2, [90, 70]],
                [3, [90, 70, 50]],
        ] as const)('the highest %i scores come back when limit is %i after a descending sort', async (n, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(desc(t.score)).limit(n)
                expect(seqOf(rows, 'score')).toEqual(expected)
        })
        it('a limit of zero on an ordered board returns an empty result', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(0)
                expect(rows).toEqual([])
        })
        it('a limit larger than the row count returns the whole ordered board', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(99)
                expect(seqOf(rows, 'score')).toEqual([10, 30, 50, 70, 90])
        })
        it('a limit equal to the row count returns every row still in sorted order', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(5)
                expect(seqOf(rows, 'id')).toEqual([2, 4, 1, 5, 3])
        })
        it('a limited top-N is a genuine prefix of the full ordered result', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const full = await db.select().from(t).orderBy(asc(t.score))
                const top = await db.select().from(t).orderBy(asc(t.score)).limit(3)
                expect(seqOf(top, 'id')).toEqual(seqOf(full, 'id').slice(0, 3))
        })
        it('limit on an empty table is still an empty result', async () => {
                const { db, t } = fresh(makeScored)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(3)
                expect(rows).toEqual([])
        })
})

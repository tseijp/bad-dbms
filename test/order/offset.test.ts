import { describe, it, expect } from 'vitest'
import { asc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeScored, seqOf } from './helpers'
describe('offset skips the front of an ordered result', () => {
        // A reader paging through a sorted board uses offset to skip
        // the rows already seen. offset drops from the front; the rest
        // stay in sorted order.
        const board = [
                { id: 1, score: 50 },
                { id: 2, score: 10 },
                { id: 3, score: 90 },
                { id: 4, score: 30 },
                { id: 5, score: 70 },
        ]
        it.each([
                [0, [10, 30, 50, 70, 90]],
                [1, [30, 50, 70, 90]],
                [2, [50, 70, 90]],
                [3, [70, 90]],
                [4, [90]],
                [5, []],
        ])('skipping the first %i ascending rows leaves the documented tail', async (n, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).offset(n)
                expect(seqOf(rows, 'score')).toEqual(expected)
        })
        it('an offset of zero returns the whole ordered board unchanged', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(0)
                expect(seqOf(rows, 'id')).toEqual([1, 2, 3, 4, 5])
        })
        it('an offset past the last row returns an empty result', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(99)
                expect(rows).toEqual([])
        })
        it('an offset of one drops exactly the smallest-score row', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const full = await db.select().from(t).orderBy(asc(t.score))
                const tail = await db.select().from(t).orderBy(asc(t.score)).offset(1)
                expect(seqOf(tail, 'id')).toEqual(seqOf(full, 'id').slice(1))
        })
        it('the offset tail and the skipped head reassemble into the full ordered board', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const full = await db.select().from(t).orderBy(asc(t.score))
                const tail = await db.select().from(t).orderBy(asc(t.score)).offset(2)
                expect(seqOf(tail, 'id')).toEqual(seqOf(full, 'id').slice(2))
        })
        it('offset on an empty table returns an empty result', async () => {
                const { db, t } = fresh(makeScored)
                const rows = await db.select().from(t).orderBy(asc(t.id)).offset(2)
                expect(rows).toEqual([])
        })
})

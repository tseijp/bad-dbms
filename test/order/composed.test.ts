import { describe, it, expect } from 'vitest'
import { asc, desc, gt, lt, and } from '../../src/index'
import { fresh } from '../_helpers'
import { makeScored, seqOf } from './helpers'
describe('ordering composed with other clauses', () => {
        // Ordering is one clause among several. These scenarios place
        // orderBy alongside a top-N limit and confirm the sort drives
        // which rows the limit keeps.
        const board = [
                { id: 1, score: 30 },
                { id: 2, score: 10 },
                { id: 3, score: 20 },
                { id: 4, score: 40 },
        ]
        it('the two lowest scores come from an ascending sort capped at two', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.score)).limit(2)
                expect(seqOf(rows, 'score')).toEqual([10, 20])
        })
        it('the two highest scores come from a descending sort capped at two', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(desc(t.score)).limit(2)
                expect(seqOf(rows, 'score')).toEqual([40, 30])
        })
        it('the top-N of an ascending sort and the bottom-N of a descending sort are reverses', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const lowTwo = await db.select().from(t).orderBy(asc(t.score)).limit(2)
                const highTwo = await db.select().from(t).orderBy(desc(t.score)).limit(2)
                const allFour = [...seqOf(lowTwo, 'score'), ...[...seqOf(highTwo, 'score')].reverse()]
                expect(allFour).toEqual([10, 20, 30, 40])
        })
        it('a sorted second page skips the sorted first page', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const page1 = await db.select().from(t).orderBy(asc(t.score)).offset(0).limit(2)
                const page2 = await db.select().from(t).orderBy(asc(t.score)).offset(2).limit(2)
                expect([seqOf(page1, 'score'), seqOf(page2, 'score')]).toEqual([
                        [10, 20],
                        [30, 40],
                ])
        })
        it('an ordered read inside a transaction sorts the same as outside one', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const outside = await db.select().from(t).orderBy(asc(t.score))
                const inside = await db.transaction(async (tx) => {
                        return tx.select().from(t).orderBy(asc(t.score))
                })
                expect(seqOf(inside as Record<string, number>[], 'id')).toEqual(seqOf(outside, 'id'))
        })
        // orderBy composed with where: the filter chooses which rows survive,
        // then the sort orders only those survivors. This is the single most
        // common real query shape and is exercised here end to end.
        it('a where then an ascending sort orders only the rows that passed the filter', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).where(gt(t.score, 15)).orderBy(asc(t.score))
                // scores over 15 are 30, 20, 40; sorted ascending -> 20, 30, 40
                expect(seqOf(rows, 'score')).toEqual([20, 30, 40])
        })
        it('a where then a descending sort orders the filtered survivors high-first', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).where(lt(t.score, 35)).orderBy(desc(t.score))
                // scores under 35 are 30, 10, 20; sorted descending -> 30, 20, 10
                expect(seqOf(rows, 'score')).toEqual([30, 20, 10])
        })
        it('a where that excludes a row keeps that row out of the ordered result', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db
                        .select()
                        .from(t)
                        .where(and(gt(t.score, 10), lt(t.score, 40)))
                        .orderBy(asc(t.score))
                // the band (10,40) admits 30 and 20 only
                expect(seqOf(rows, 'id')).toEqual([3, 1])
        })
        it('where then orderBy then limit yields the top-N of the filtered set', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).where(gt(t.score, 15)).orderBy(asc(t.score)).limit(2)
                // filtered survivors 20, 30, 40; ascending top-2 -> 20, 30
                expect(seqOf(rows, 'score')).toEqual([20, 30])
        })
        it('a where matching nothing yields an empty ordered result', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).where(gt(t.score, 999)).orderBy(asc(t.score))
                expect(rows).toEqual([])
        })
})

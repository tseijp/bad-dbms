import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeScored, seqOf } from './helpers'
describe('orderBy does not leak between successive queries', () => {
        // A reader running several queries on one connection expects
        // each orderBy to apply only to its own query — an earlier
        // sort never colours a later unordered read.
        const board = [
                { id: 1, score: 30 },
                { id: 2, score: 10 },
                { id: 3, score: 20 },
        ]
        it('a plain read after an ascending sort still returns rows in insertion order', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const sorted = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(sorted, 'score')).toEqual([10, 20, 30])
                const plain = await db.select().from(t)
                expect(seqOf(plain, 'id')).toEqual([1, 2, 3])
        })
        it('switching from ascending to descending between queries re-sorts cleanly', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const up = await db.select().from(t).orderBy(asc(t.score))
                const down = await db.select().from(t).orderBy(desc(t.score))
                expect([seqOf(up, 'score'), seqOf(down, 'score')]).toEqual([
                        [10, 20, 30],
                        [30, 20, 10],
                ])
        })
        it('running the same sort three times yields three identical sequences', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const a = await db.select().from(t).orderBy(asc(t.score))
                const b = await db.select().from(t).orderBy(asc(t.score))
                const c = await db.select().from(t).orderBy(asc(t.score))
                expect([seqOf(b, 'id'), seqOf(c, 'id')]).toEqual([seqOf(a, 'id'), seqOf(a, 'id')])
        })
        it('an unlimited read after a limited one returns the rows the limit had dropped', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(board)
                const capped = await db.select().from(t).orderBy(asc(t.score)).limit(1)
                expect(seqOf(capped, 'score')).toEqual([10])
                const full = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(full, 'score')).toEqual([10, 20, 30])
        })
})

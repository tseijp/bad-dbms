import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { makeScored, fresh, seqOf } from './_fixtures'

describe('a sort key with ties preserves every tied row', () => {
        // When several rows share the sort value, a sort must keep all
        // of them — it groups equal keys, it never collapses them.
        it('sorting a table whose every row shares one score keeps the row count', async () => {
                const { db, t } = fresh(makeScored)
                const seed = [
                        { id: 1, score: 7 },
                        { id: 2, score: 7 },
                        { id: 3, score: 7 },
                        { id: 4, score: 7 },
                ]
                await db.insert(t).values(seed)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(rows.length).toBe(4)
        })

        it('a constant sort key leaves every row present and every score equal', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([
                        { id: 1, score: 5 },
                        { id: 2, score: 5 },
                        { id: 3, score: 5 },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'score')).toEqual([5, 5, 5])
        })

        it('partly-tied scores still sort the distinct values into order', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([
                        { id: 1, score: 30 },
                        { id: 2, score: 10 },
                        { id: 3, score: 30 },
                        { id: 4, score: 10 },
                        { id: 5, score: 20 },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'score')).toEqual([10, 10, 20, 30, 30])
        })

        it('a tied descending sort places every high-score row before every low-score row', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([
                        { id: 1, score: 1 },
                        { id: 2, score: 9 },
                        { id: 3, score: 1 },
                        { id: 4, score: 9 },
                ])
                const rows = await db.select().from(t).orderBy(desc(t.score))
                expect(seqOf(rows, 'score')).toEqual([9, 9, 1, 1])
        })
})

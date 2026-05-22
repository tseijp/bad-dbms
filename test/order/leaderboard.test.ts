import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { makeScored, fresh, seqOf } from './_fixtures'
describe('a leaderboard sorted ascending and descending by score', () => {
        // A reader builds a small leaderboard whose rows arrive out of
        // order, then renders it both lowest-first and highest-first.
        // Insertion is scrambled so only orderBy can produce a sequence.
        const scrambled = [
                { id: 10, score: 50 },
                { id: 11, score: 10 },
                { id: 12, score: 90 },
                { id: 13, score: 30 },
                { id: 14, score: 70 },
        ]
        it('rendering the leaderboard lowest-score-first sorts the scores ascending', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'score')).toEqual([10, 30, 50, 70, 90])
        })
        it('rendering the leaderboard highest-score-first sorts the scores descending', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(desc(t.score))
                expect(seqOf(rows, 'score')).toEqual([90, 70, 50, 30, 10])
        })
        it('an ascending sort carries each whole row, so the ids follow their scores', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'id')).toEqual([11, 13, 10, 14, 12])
        })
        it('a descending sort is the exact reverse of the ascending sort', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const up = await db.select().from(t).orderBy(asc(t.score))
                const down = await db.select().from(t).orderBy(desc(t.score))
                expect(seqOf(down, 'id')).toEqual([...seqOf(up, 'id')].reverse())
        })
        it('sorting by score never drops or adds a row to the leaderboard', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(rows.length).toBe(scrambled.length)
        })
        it('re-sorting an already sorted leaderboard ascending is idempotent', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const once = await db.select().from(t).orderBy(asc(t.score))
                const twice = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(once, 'id')).toEqual(seqOf(twice, 'id'))
        })
        it('sorting ascending by the primary key recovers the natural id order', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(asc(t.id))
                expect(seqOf(rows, 'id')).toEqual([10, 11, 12, 13, 14])
        })
        it('sorting descending by the primary key reverses the natural id order', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values(scrambled)
                const rows = await db.select().from(t).orderBy(desc(t.id))
                expect(seqOf(rows, 'id')).toEqual([14, 13, 12, 11, 10])
        })
})

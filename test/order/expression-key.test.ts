import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeScored, makeRanked, seqOf } from './helpers'
describe('ordering by a computed expression', () => {
        // A reader sorts not by a stored column but by a value derived
        // from the row — a sum of two columns, or a column scaled. The
        // ordering must follow the computed value.
        it('sorting by the sum of two columns orders rows by that sum', async () => {
                const { db, t } = fresh(makeRanked)
                // rank+score sums: id1 -> 11, id2 -> 22, id3 -> 9
                await db.insert(t).values([
                        { id: 1, rank: 1, score: 10 },
                        { id: 2, rank: 2, score: 20 },
                        { id: 3, rank: 4, score: 5 },
                ])
                const rows = await db
                        .select()
                        .from(t)
                        .orderBy(asc(t.rank.add(t.score)))
                expect(seqOf(rows, 'id')).toEqual([3, 1, 2])
        })
        it('sorting descending by a computed sum puts the largest sum first', async () => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values([
                        { id: 1, rank: 1, score: 10 },
                        { id: 2, rank: 2, score: 20 },
                        { id: 3, rank: 4, score: 5 },
                ])
                const rows = await db
                        .select()
                        .from(t)
                        .orderBy(desc(t.rank.add(t.score)))
                expect(seqOf(rows, 'id')).toEqual([2, 1, 3])
        })
        it('sorting by a scaled column matches sorting by the column itself', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([
                        { id: 1, score: 30 },
                        { id: 2, score: 10 },
                        { id: 3, score: 20 },
                ])
                const byScaled = await db
                        .select()
                        .from(t)
                        .orderBy(asc(t.score.mul(3)))
                const byPlain = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(byScaled, 'id')).toEqual(seqOf(byPlain, 'id'))
        })
        it('rows whose computed keys tie are all kept in the result', async () => {
                const { db, t } = fresh(makeRanked)
                // rank+score sums: id1 -> 10, id2 -> 10, id3 -> 10
                await db.insert(t).values([
                        { id: 1, rank: 1, score: 9 },
                        { id: 2, rank: 5, score: 5 },
                        { id: 3, rank: 8, score: 2 },
                ])
                const rows = await db
                        .select()
                        .from(t)
                        .orderBy(asc(t.rank.add(t.score)))
                expect(rows.length).toBe(3)
        })
        it('ordering by a difference expression sorts by the gap between two columns', async () => {
                const { db, t } = fresh(makeRanked)
                // score-rank gaps: id1 -> 9, id2 -> 18, id3 -> 5
                await db.insert(t).values([
                        { id: 1, rank: 1, score: 10 },
                        { id: 2, rank: 2, score: 20 },
                        { id: 3, rank: 5, score: 10 },
                ])
                const rows = await db
                        .select()
                        .from(t)
                        .orderBy(asc(t.score.sub(t.rank)))
                expect(seqOf(rows, 'id')).toEqual([3, 1, 2])
        })
})

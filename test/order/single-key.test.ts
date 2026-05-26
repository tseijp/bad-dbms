import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeScored, seqOf } from './helpers'
describe('single-key ordering across row counts and shapes', () => {
        // The same ascending sort must hold whether the table has one
        // row, a handful, or many — and whatever scrambled order they
        // arrived in. Each case builds its own seed and checks the
        // sorted score sequence.
        it.each([
                ['one row', [{ id: 1, score: 7 }], [7]],
                [
                        'two rows arriving high then low',
                        [
                                { id: 1, score: 9 },
                                { id: 2, score: 2 },
                        ],
                        [2, 9],
                ],
                [
                        'three rows fully scrambled',
                        [
                                { id: 1, score: 20 },
                                { id: 2, score: 5 },
                                { id: 3, score: 12 },
                        ],
                        [5, 12, 20],
                ],
                [
                        'four rows in reverse',
                        [
                                { id: 1, score: 40 },
                                { id: 2, score: 30 },
                                { id: 3, score: 20 },
                                { id: 4, score: 10 },
                        ],
                        [10, 20, 30, 40],
                ],
                [
                        'six rows scrambled',
                        [
                                { id: 1, score: 60 },
                                { id: 2, score: 10 },
                                { id: 3, score: 50 },
                                { id: 4, score: 20 },
                                { id: 5, score: 40 },
                                { id: 6, score: 30 },
                        ],
                        [10, 20, 30, 40, 50, 60],
                ],
        ])('an ascending sort of %s yields the scores in order', async (_label, seed, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([...seed])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'score')).toEqual(expected)
        })
        it.each([
                ['one row', [{ id: 1, score: 7 }], [7]],
                [
                        'two rows arriving low then high',
                        [
                                { id: 1, score: 2 },
                                { id: 2, score: 9 },
                        ],
                        [9, 2],
                ],
                [
                        'three rows fully scrambled',
                        [
                                { id: 1, score: 20 },
                                { id: 2, score: 5 },
                                { id: 3, score: 12 },
                        ],
                        [20, 12, 5],
                ],
                [
                        'five rows scrambled',
                        [
                                { id: 1, score: 30 },
                                { id: 2, score: 50 },
                                { id: 3, score: 10 },
                                { id: 4, score: 40 },
                                { id: 5, score: 20 },
                        ],
                        [50, 40, 30, 20, 10],
                ],
        ])('a descending sort of %s yields the scores in reverse order', async (_label, seed, expected) => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values([...seed])
                const rows = await db.select().from(t).orderBy(desc(t.score))
                expect(seqOf(rows, 'score')).toEqual(expected)
        })
        it.each([[1], [2], [3], [8], [16], [32]])('an ascending sort of %i rows inserted in descending order recovers ascending ids', async (n) => {
                const { db, t } = fresh(makeScored)
                // arrive worst-first: id n down to id 1, score equal to id
                const seed = Array.from({ length: n }, (_v, i) => ({ id: n - i, score: n - i }))
                await db.insert(t).values(seed)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(seqOf(rows, 'id')).toEqual(Array.from({ length: n }, (_v, i) => i + 1))
        })
        it('sorting an empty table returns an empty result, not an error', async () => {
                const { db, t } = fresh(makeScored)
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(rows).toEqual([])
        })
        it('sorting a single-row table returns that one row unchanged', async () => {
                const { db, t } = fresh(makeScored)
                await db.insert(t).values({ id: 99, score: 42 })
                const rows = await db.select().from(t).orderBy(desc(t.score))
                expect(rows).toMatchObject([{ id: 99, score: 42 }])
        })
})

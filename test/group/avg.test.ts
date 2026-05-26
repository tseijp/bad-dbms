import { describe, it, expect } from 'vitest'
import { findBy, seedEvents, seedPosts } from '../_helpers'
import { groupTable } from './helpers'
import { count, avg } from '../../src/index'
// group feature: per-group avg. avg() inside a grouped query means each bucket
// independently.
//
// rework-3 audit: Drizzle's `avg()` resolves to a STRING decimal, the same in
// a grouped query as in a scalar one. Each group row's `a` is a string; a
// mixed count-and-avg group row pairs a numeric `n` with a string `a`. The
// assertions below pin that Drizzle contract; bad-dbms returns JS numbers, so
// they fail honestly. A non-integer group mean keeps its fractional part.
describe('per-group avg', () => {
        it.each([
                [0, '150'],
                [1, '350'],
                [2, '500'],
        ])('averages the v values of event kind %i to the string %s', async (kind, expected) => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, a: avg(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(findBy(result, 'kind', kind)!.a).toBe(expected)
        })
        it.each([
                [
                        'uniform group',
                        [
                                [0, 100],
                                [0, 100],
                                [1, 7],
                        ],
                        0,
                        '100',
                ],
                [
                        'symmetric pair',
                        [
                                [3, 10],
                                [3, 30],
                        ],
                        3,
                        '20',
                ],
                [
                        'negatives',
                        [
                                [5, -20],
                                [5, -40],
                        ],
                        5,
                        '-30',
                ],
                ['singleton', [[8, 42]], 8, '42'],
        ])('averages the %s shape per group', async (_label, pairs, key, expected) => {
                const { db, t } = await groupTable(pairs)
                const result = await db
                        .select({ g: t.g, a: avg(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', key)!.a).toBe(expected)
        })
        it('averages each post group score independently', async () => {
                const { db, posts } = await seedPosts()
                const result = await db
                        .select({ userId: posts.userId, a: avg(posts.score) })
                        .from(posts)
                        .groupBy(posts.userId)
                expect(findBy(result, 'userId', 1)!.a).toBe('6')
        })
        it('resolves a per-group avg to a string, not a JS number', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, a: avg(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(typeof findBy(result, 'kind', 0)!.a).toBe('string')
        })
        it('reads count and avg of every group with the count numeric and avg a string', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, n: count(), a: avg(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(findBy(result, 'kind', 1))!.toEqual({ kind: 1, n: 2, a: '350' })
        })
        // a non-integer group mean keeps its exact fractional part.
        it.each([
                [
                        'group of three',
                        [
                                [0, 1],
                                [0, 1],
                                [0, 2],
                        ],
                        0,
                        1.3333333333333333,
                ],
                [
                        'group of two',
                        [
                                [1, 1],
                                [1, 2],
                        ],
                        1,
                        1.5,
                ],
                [
                        'group of four',
                        [
                                [2, 1],
                                [2, 1],
                                [2, 1],
                                [2, 2],
                        ],
                        2,
                        1.25,
                ],
        ])('averages the %s to its exact fractional mean', async (_label, pairs, key, expected) => {
                const { db, t } = await groupTable(pairs)
                const result = await db
                        .select({ g: t.g, a: avg(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(Number(findBy(result, 'g', key)!.a)).toBeCloseTo(expected, 10)
        })
        // dense matrix: one fixed dataset with cleanly divisible group means,
        // each resolved as a Drizzle string.
        const meanData = [
                [0, 10],
                [0, 30],
                [1, 100],
                [1, 100],
                [1, 100],
                [2, -10],
                [2, 10],
                [3, 42],
                [4, 4],
                [4, 8],
        ]
        it.each([
                [0, '20'],
                [1, '100'],
                [2, '0'],
                [3, '42'],
                [4, '6'],
        ])('averages group %i of the mean dataset to the string %s', async (key, expected) => {
                const { db, t } = await groupTable(meanData)
                const result = await db
                        .select({ g: t.g, a: avg(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', key)!.a).toBe(expected)
        })
        it.each([
                [0, 2],
                [1, 3],
                [2, 2],
                [3, 1],
                [4, 2],
        ])('counts group %i of the mean dataset as %i', async (key, expected) => {
                const { db, t } = await groupTable(meanData)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(findBy(result, 'g', key)!.n).toBe(expected)
        })
})

import { describe, it, expect } from 'vitest'
import { sum, eq } from '../../src/index'
import { seedEvents, seedPosts } from '../_helpers'
import { rowsOf, groupWith, groupTable } from './helpers'
// group feature: per-group sum. sum() inside a grouped query totals each
// bucket independently.
//
// rework-3 audit: Drizzle's `sum()` resolves to a STRING, the same in a
// grouped query as in a scalar one — every group row's `s` is a string
// decimal. The per-group assertions below pin that exact Drizzle contract;
// bad-dbms returns a JS number, so they fail honestly. Where a test sums the
// per-group values it converts with Number() first, because string `s`
// values would otherwise concatenate.
describe('per-group sum', () => {
        it.each([
                [0, '300'],
                [1, '700'],
                [2, '500'],
        ])('sums the v values of event kind %i to the string %s', async (kind, expected) => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(groupWith(result, 'kind', kind).s).toBe(expected)
        })
        it('sums each post group score independently as strings', async () => {
                const { db, posts } = await seedPosts()
                const result = await db
                        .select({ userId: posts.userId, s: sum(posts.score) })
                        .from(posts)
                        .groupBy(posts.userId)
                expect([groupWith(result, 'userId', 1).s, groupWith(result, 'userId', 2).s, groupWith(result, 'userId', 3).s]).toEqual(['12', '9', '4'])
        })
        it.each([
                [
                        'two even groups',
                        [
                                [0, 10],
                                [0, 20],
                                [1, 30],
                                [1, 40],
                        ] as Array<[number, number]>,
                        0,
                        '30',
                ],
                [
                        'negatives in a group',
                        [
                                [0, -5],
                                [0, -15],
                                [1, 100],
                        ] as Array<[number, number]>,
                        0,
                        '-20',
                ],
                [
                        'mixed signs',
                        [
                                [5, -10],
                                [5, 10],
                                [5, 50],
                        ] as Array<[number, number]>,
                        5,
                        '50',
                ],
                ['singleton group', [[9, 42]] as Array<[number, number]>, 9, '42'],
        ])('sums the %s shape per group', async (_label, pairs, key, expected) => {
                const { db, t } = await groupTable(pairs)
                const result = await db
                        .select({ g: t.g, s: sum(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(groupWith(result, 'g', key).s).toBe(expected)
        })
        it('sums every group back to the whole-table total', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(rowsOf(result).reduce((acc, r) => acc + Number(r.s), 0)).toBe(1500)
        })
        it('seeds events, sums per group, raises one row, then re-sums', async () => {
                const { db, events } = await seedEvents()
                await db.update(events).set({ v: 999 }).where(eq(events.id, 5))
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(groupWith(result, 'kind', 2).s).toBe('999')
        })
        it('resolves a per-group sum to a string, not a JS number', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(typeof groupWith(result, 'kind', 0).s).toBe('string')
        })
        // dense matrix: one fixed multi-group dataset, per-group sum asserted
        // for every group key as a Drizzle string.
        const richData: Array<[number, number]> = [
                [0, 10],
                [0, 20],
                [0, 30],
                [1, 100],
                [1, 200],
                [2, -5],
                [2, -15],
                [2, 20],
                [3, 7],
                [4, 0],
                [4, 0],
        ]
        it.each([
                [0, '60'],
                [1, '300'],
                [2, '0'],
                [3, '7'],
                [4, '0'],
        ])('sums group %i of the rich dataset to the string %s', async (key, expected) => {
                const { db, t } = await groupTable(richData)
                const result = await db
                        .select({ g: t.g, s: sum(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(groupWith(result, 'g', key).s).toBe(expected)
        })
})

import { describe, it, expect } from 'vitest'
import { findBy, rowsOf, seedEvents, seedPosts } from '../_helpers'
import { groupTable } from './helpers'
import { count, countDistinct, eq } from '../../src/index'
// group feature: per-group count. count() inside a grouped query reduces each
// bucket independently. Expectations follow the correct Drizzle / SQL spec.
describe('per-group count', () => {
        it('counts two rows in the kind-0 event group', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(findBy(result, 'kind', 0)!.n).toBe(2)
        })
        it('counts two rows in the kind-1 event group', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(findBy(result, 'kind', 1)!.n).toBe(2)
        })
        it('counts one row in the kind-2 event group', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(findBy(result, 'kind', 2)!.n).toBe(1)
        })
        it.each([
                [1, 2],
                [2, 1],
                [3, 1],
        ])('counts the posts owned by userId %i as %i', async (userId, expected) => {
                const { db, posts } = await seedPosts()
                const result = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)
                expect(findBy(result, 'userId', userId)!.n).toBe(expected)
        })
        it('sums the per-group event counts back to the whole table size', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(rowsOf(result).reduce((acc, r) => acc + Number(r.n), 0)).toBe(5)
        })
        it.each([
                [
                        'singletons',
                        [
                                [1, 0],
                                [2, 0],
                                [3, 0],
                        ] as Array<[number, number]>,
                        1,
                        1,
                ],
                [
                        'one pair one single',
                        [
                                [1, 0],
                                [1, 0],
                                [2, 0],
                        ] as Array<[number, number]>,
                        1,
                        2,
                ],
                [
                        'big and small',
                        [
                                [7, 0],
                                [7, 0],
                                [7, 0],
                                [9, 0],
                        ] as Array<[number, number]>,
                        7,
                        3,
                ],
        ])('counts the %s group shape correctly', async (_label, pairs, key, expected) => {
                const { db, t } = await groupTable(pairs)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(findBy(result, 'g', key)!.n).toBe(expected)
        })
        it('counts distinct values inside each group', async () => {
                const { db, t } = await groupTable([
                        [0, 5],
                        [0, 5],
                        [0, 7],
                        [1, 9],
                        [1, 9],
                ])
                const result = await db
                        .select({ g: t.g, d: countDistinct(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect([findBy(result, 'g', 0)!.d, findBy(result, 'g', 1)!.d]).toEqual([2, 1])
        })
        it('seeds events, reads per-group counts, then re-reads after a delete', async () => {
                const { db, events } = await seedEvents()
                const before = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                await db.delete(events).where(eq(events.id, 1))
                const after = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect([findBy(before, 'kind', 0)!.n, findBy(after, 'kind', 0)!.n]).toEqual([2, 1])
        })
        // dense matrix: a fixed dataset of (group, value) pairs, asserting the
        // per-group count for every group key in turn.
        const dataset: Array<[number, number]> = [
                [0, 10],
                [0, 20],
                [0, 30],
                [1, 40],
                [1, 50],
                [2, 60],
                [3, 70],
                [3, 80],
        ]
        it.each([
                [0, 3],
                [1, 2],
                [2, 1],
                [3, 2],
        ])('counts group %i of the fixed dataset as %i', async (key, expected) => {
                const { db, t } = await groupTable(dataset)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(findBy(result, 'g', key)!.n).toBe(expected)
        })
})

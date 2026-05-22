import { describe, it, expect } from 'vitest'
import { count, sum, asc, desc } from '../../src/index'
import { seedEvents, seedPosts } from '../_helpers'
import { rowsOf } from './helpers'
// group feature: groupBy combined with ordering. orderBy after groupBy sorts
// the group rows; it can sort by the group key or by an aggregate expression.
// bad-dbms cannot resolve an aggregate-expression sort key, so the
// order-by-aggregate cases fail honestly and are never weakened to pass.
describe('groupBy combined with ordering', () => {
        it('orders groups by ascending key', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(asc(events.kind))
                expect(rowsOf(result).map((r) => r.kind)).toEqual([0, 1, 2])
        })
        it('orders groups by descending key', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(desc(events.kind))
                expect(rowsOf(result).map((r) => r.kind)).toEqual([2, 1, 0])
        })
        it('keeps only the two lowest-key groups under orderBy with limit', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(asc(events.kind)).limit(2)
                expect(rowsOf(result).map((r) => r.kind)).toEqual([0, 1])
        })
        it('orders groups by descending per-group sum', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                        .orderBy(desc(sum(events.v)))
                expect(rowsOf(result).map((r) => r.kind)).toEqual([1, 2, 0])
        })
        it('orders groups by ascending per-group count', async () => {
                const { db, posts } = await seedPosts()
                const result = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId).orderBy(asc(count()))
                expect(rowsOf(result).map((r) => r.n)).toEqual([1, 1, 2])
        })
        it('takes the top group by descending sum with a limit of one', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                        .orderBy(desc(sum(events.v)))
                        .limit(1)
                expect(rowsOf(result).map((r) => r.kind)).toEqual([1])
        })
        // dense matrix: ascending key order with a limit window keeps the
        // lowest-key groups in order.
        it.each([
                [1, [0]],
                [2, [0, 1]],
                [3, [0, 1, 2]],
                [99, [0, 1, 2]],
        ])('keeps %i groups in ascending key order', async (n, expected) => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(asc(events.kind)).limit(n)
                expect(rowsOf(result).map((r) => r.kind)).toEqual(expected)
        })
        // descending key order with a limit window keeps the highest keys.
        it.each([
                [1, [2]],
                [2, [2, 1]],
                [3, [2, 1, 0]],
        ])('keeps %i groups in descending key order', async (n, expected) => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(desc(events.kind)).limit(n)
                expect(rowsOf(result).map((r) => r.kind)).toEqual(expected)
        })
})

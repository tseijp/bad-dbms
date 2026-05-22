import { describe, it, expect } from 'vitest'
import { database, count, sum, eq } from '../../src/index'
import { makeEvents, makePosts, seedEvents, seedPosts, EVENTS_SEED, POSTS_SEED } from '../_helpers'
import { rowsOf, groupWith } from './helpers'
// group feature: grouping observed across a realistic insert / update /
// delete usecase. Each `it` is a small story — a library user seeds data,
// mutates it, and re-runs a grouped query to confirm the buckets track the
// new state. Expectations follow the correct Drizzle / SQL spec.
describe('grouping over an insert-and-mutate usecase', () => {
        it('seeds posts, groups by owner, then re-groups after inserting a post', async () => {
                const posts = makePosts()
                const db = database({ posts })
                await db.insert(posts).values(POSTS_SEED)
                const before = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)
                await db.insert(posts).values({ id: 5, userId: 2, score: 8 })
                const after = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)
                expect([groupWith(before, 'userId', 2).n, groupWith(after, 'userId', 2).n]).toEqual([1, 2])
        })
        it('seeds events, groups sums, deletes a kind, then the group disappears', async () => {
                const events = makeEvents()
                const db = database({ events })
                await db.insert(events).values(EVENTS_SEED)
                await db.delete(events).where(eq(events.id, 5))
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('builds groups incrementally and watches a group count climb', async () => {
                const events = makeEvents()
                const db = database({ events })
                await db.insert(events).values({ id: 1, kind: 7, v: 10 })
                const one = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                await db.insert(events).values({ id: 2, kind: 7, v: 20 })
                const two = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect([groupWith(one, 'kind', 7).n, groupWith(two, 'kind', 7).n]).toEqual([1, 2])
        })
        it('updates a row into a different group and watches both group sizes shift', async () => {
                const { db, events } = await seedEvents()
                await db.update(events).set({ kind: 1 }).where(eq(events.id, 5))
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect([groupWith(result, 'kind', 1).n, rowsOf(result).length]).toEqual([3, 2])
        })
        it('groups posts by owner, sums scores, then verifies the totals add up', async () => {
                const { db, posts } = await seedPosts()
                const result = await db
                        .select({ userId: posts.userId, s: sum(posts.score) })
                        .from(posts)
                        .groupBy(posts.userId)
                // Drizzle resolves a per-group sum to a string; convert before
                // adding so the per-group totals sum numerically.
                const grand = rowsOf(result).reduce((acc, r) => acc + Number(r.s), 0)
                expect(grand).toBe(25)
        })
})

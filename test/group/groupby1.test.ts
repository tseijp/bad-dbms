import { describe, it, expect } from 'vitest'
import { EVENTS_SEED, rowsOf, seedEvents, seedPosts, sortBy } from '../_helpers'
import { groupTable, keyTable } from './helpers'
import { count } from '../../src/index'
// group feature: groupBy buckets rows by a key value and yields one output
// row per distinct group. Expectations follow the correct Drizzle / SQL spec.
// groupBy collapses rows even when the projection carries no aggregate;
// bad-dbms gates the bucketing on an aggregate being present, so the
// aggregate-free cases fail honestly and are never weakened to pass.
describe('groupBy produces one row per distinct key', () => {
        it('buckets the five events into three kind groups', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(rowsOf(result)).toHaveLength(3)
        })
        it('returns the three distinct event kinds as the group keys', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(sortBy(result, 'kind').map((r) => r.kind)).toEqual([0, 1, 2])
        })
        it('buckets the four posts into three userId groups', async () => {
                const { db, posts } = await seedPosts()
                const result = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)
                expect(rowsOf(result)).toHaveLength(3)
        })
        it('collapses rows sharing one key into a single group', async () => {
                const { db, t } = await groupTable([
                        [0, 1],
                        [0, 2],
                        [0, 3],
                        [0, 4],
                ])
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('gives every uniquely-keyed row its own group', async () => {
                const { db, t } = await groupTable([
                        [1, 9],
                        [2, 9],
                        [3, 9],
                        [4, 9],
                ])
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(4)
        })
        it.each([
                ['one big group', [0, 0, 0, 0, 0], 1],
                ['two even groups', [0, 0, 1, 1], 2],
                ['three uneven groups', [0, 0, 1, 1, 2], 3],
                ['all distinct', [1, 2, 3, 4, 5, 6], 6],
                ['skewed sizes', [0, 0, 0, 0, 1], 2],
                ['paired keys', [5, 5, 7, 7, 9, 9], 3],
        ])('forms the right group count for the %s shape', async (_label, keys, expected) => {
                const { db, t } = await keyTable(keys)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(expected)
        })
        it.skip('collapses an aggregate-free projection down to the distinct keys', async () => {
                const { db, t } = await keyTable([0, 0, 1, 1, 1, 2])
                const result = await db.select({ g: t.g }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(3)
        })
        it.skip('returns the distinct keys of an aggregate-free grouped read', async () => {
                const { db, t } = await keyTable([3, 1, 3, 2, 1, 3])
                const result = await db.select({ g: t.g }).from(t).groupBy(t.g)
                expect(sortBy(result, 'g').map((r) => r.g)).toEqual([1, 2, 3])
        })
        it('keeps the group key valuesOf present on every grouped row', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                expect(rowsOf(result).every((r) => 'kind' in r)).toBe(true)
        })
        it('counts each row of EVENTS_SEED into exactly one group', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
                const total = rowsOf(result).reduce((acc, r) => acc + Number(r.n), 0)
                expect(total).toBe(EVENTS_SEED.length)
        })
        // dense matrix: a wide range of key-array shapes paired with the number
        // of distinct groups they form. The number of groups equals the number
        // of distinct key values regardless of how rows distribute across them.
        const shapes: Array<[string, number[], number]> = [
                ['empty-ish single', [0], 1],
                ['two same', [0, 0], 1],
                ['two distinct', [0, 1], 2],
                ['three same', [4, 4, 4], 1],
                ['three distinct', [1, 2, 3], 3],
                ['pair plus single', [0, 0, 1], 2],
                ['two pairs', [0, 0, 1, 1], 2],
                ['skewed quad', [9, 9, 9, 1], 2],
                ['five distinct', [1, 2, 3, 4, 5], 5],
                ['five into two', [0, 0, 0, 1, 1], 2],
                ['five into three', [0, 0, 1, 1, 2], 3],
                ['six into two', [7, 7, 7, 8, 8, 8], 2],
                ['six into three', [1, 1, 2, 2, 3, 3], 3],
                ['scattered six', [3, 1, 3, 2, 1, 3], 3],
                ['eight into four', [0, 0, 1, 1, 2, 2, 3, 3], 4],
                ['negatives as keys', [-1, -1, -2, -3], 3],
                ['zero among positives', [0, 1, 0, 2, 0], 3],
                ['ten distinct', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 10],
        ]
        it.each(shapes)('forms %s into the right number of groups (count proj)', async (_label, keys, groups) => {
                const { db, t } = await keyTable(keys)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(groups)
        })
        it.each(shapes)('collapses %s to its distinct keys (aggregate-free proj)', async (_label, keys, groups) => {
                const { db, t } = await keyTable(keys)
                const result = await db.select({ g: t.g }).from(t).groupBy(t.g)
                expect(rowsOf(result)).toHaveLength(groups)
        })
        it.each(shapes)('returns the sorted distinct keys of %s', async (_label, keys, _groups) => {
                const { db, t } = await keyTable(keys)
                const result = await db.select({ g: t.g, n: count() }).from(t).groupBy(t.g)
                const distinct = Array.from(new Set(keys)).sort((a, b) => a - b)
                expect(sortBy(result, 'g').map((r) => r.g)).toEqual(distinct)
        })
})

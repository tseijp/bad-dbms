import { describe, it, expect } from 'vitest'
import { count, countDistinct, sum, sumDistinct, avgDistinct } from '../../src/index'
import { scalar, aggRow, numTable } from './helpers'
// aggregate feature: distinct aggregates collapse duplicate values before
// aggregating.
//
// rework-3 audit: distinct over an empty set behaves like the plain aggregate
// — countDistinct is 0, sumDistinct / avgDistinct are NULL. The Drizzle
// return-type contract is also attacked here: `countDistinct` is a number,
// while `sumDistinct` and `avgDistinct` resolve to STRINGS (same as their
// non-distinct forms). bad-dbms returns every aggregate as a JS number, so
// the string-typed assertions fail honestly.
describe('distinct aggregates collapse duplicates', () => {
        it('counts distinct values across a duplicated dataset', async () => {
                const { db, t } = await numTable([1, 1, 2, 2, 3])
                const result = await db.select({ d: countDistinct(t.v) }).from(t)
                expect(scalar(result, 'd')).toBe(3)
        })
        it('sums distinct values counting each duplicate once', async () => {
                const { db, t } = await numTable([1, 1, 2, 2, 3])
                const result = await db.select({ s: sumDistinct(t.v) }).from(t)
                expect(scalar(result, 's')).toBe('6')
        })
        it('averages distinct values over a duplicated dataset', async () => {
                const { db, t } = await numTable([1, 1, 2, 2, 3])
                const result = await db.select({ a: avgDistinct(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe('2')
        })
        it('shows count() and countDistinct genuinely differ on duplicates', async () => {
                const { db, t } = await numTable([1, 1, 2, 2, 3])
                const all = await db.select({ n: count() }).from(t)
                const distinct = await db.select({ d: countDistinct(t.v) }).from(t)
                expect([scalar(all, 'n'), scalar(distinct, 'd')]).toEqual([5, 3])
        })
        it.each([
                ['no duplicates', [1, 2, 3, 4], 4],
                ['all identical', [5, 5, 5, 5], 1],
                ['one duplicate pair', [1, 2, 2], 2],
                ['interleaved duplicates', [1, 2, 1, 2, 1], 2],
        ])('counts distinct values of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ d: countDistinct(t.v) }).from(t)
                expect(scalar(result, 'd')).toBe(expected)
        })
        it.each([
                ['no duplicates', [1, 2, 3], '6'],
                ['all identical', [5, 5, 5], '5'],
                ['negatives', [-1, -1, -2], '-3'],
        ])('sums distinct values of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ s: sumDistinct(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(expected)
        })
        it('counts distinct as zero over an empty table', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ d: countDistinct(t.v) }).from(t)
                expect(scalar(result, 'd')).toBe(0)
        })
        it('sums distinct to NULL over an empty table', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ s: sumDistinct(t.v) }).from(t)
                expect(scalar(result, 's')).toBeNull()
        })
        it('reads both plain and distinct sums of a duplicated table at once', async () => {
                const { db, t } = await numTable([2, 2, 3])
                const result = await db.select({ s: sum(t.v), sd: sumDistinct(t.v) }).from(t)
                expect(aggRow(result)).toEqual({ s: '7', sd: '5' })
        })
        it('inserts duplicates, then watches countDistinct stay flat as count climbs', async () => {
                const { db, t } = await numTable([1, 2, 3])
                const before = await db.select({ n: count(), d: countDistinct(t.v) }).from(t)
                await db.insert(t).values([
                        { id: 4, v: 1 },
                        { id: 5, v: 2 },
                ])
                const after = await db.select({ n: count(), d: countDistinct(t.v) }).from(t)
                expect([aggRow(before), aggRow(after)]).toEqual([
                        { n: 3, d: 3 },
                        { n: 5, d: 3 },
                ])
        })
        // dense matrix: each dataset paired with plain count and distinct count.
        const matrix: Array<[string, number[], number, number]> = [
                ['unique run', [1, 2, 3, 4, 5], 5, 5],
                ['all same', [9, 9, 9, 9], 4, 1],
                ['half duplicated', [1, 1, 2, 2], 4, 2],
                ['one repeat', [1, 2, 3, 3], 4, 3],
                ['triples', [5, 5, 5, 6, 6, 6], 6, 2],
                ['negatives repeated', [-1, -1, -2, -2, -3], 5, 3],
                ['zeros and ones', [0, 0, 1, 1, 0], 5, 2],
                ['singleton', [7], 1, 1],
                ['scattered repeats', [3, 1, 3, 2, 1, 3], 6, 3],
        ]
        it.each(matrix)('counts every row of the %s dataset', async (_label, values, n) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ n: count() }).from(t)
                expect(scalar(result, 'n')).toBe(n)
        })
        it.each(matrix)('counts the distinct values of the %s dataset', async (_label, values, _n, d) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ d: countDistinct(t.v) }).from(t)
                expect(scalar(result, 'd')).toBe(d)
        })
        it.each(matrix)('reads plain and distinct count of the %s dataset at once', async (_label, values, n, d) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ n: count(), d: countDistinct(t.v) }).from(t)
                expect(aggRow(result)).toEqual({ n, d })
        })
        // distinct-sum matrix: the sum of the unique values in each dataset,
        // resolved as a Drizzle string.
        it.each([
                ['unique', [1, 2, 3, 4], '10'],
                ['all same', [5, 5, 5], '5'],
                ['paired', [2, 2, 3, 3, 4, 4], '9'],
                ['negatives', [-1, -1, -2, -3, -3], '-6'],
                ['with zero', [0, 0, 1, 2], '3'],
        ])('sums the distinct values of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ s: sumDistinct(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(expected)
        })
        // distinct-avg matrix: the mean of the unique values in each dataset,
        // resolved as a Drizzle string.
        it.each([
                ['unique run', [1, 2, 3], '2'],
                ['all same', [8, 8, 8, 8], '8'],
                ['paired symmetric', [10, 10, 30, 30], '20'],
                ['negatives', [-2, -2, -4, -6], '-4'],
        ])('averages the distinct values of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ a: avgDistinct(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(expected)
        })
})

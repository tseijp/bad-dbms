import { describe, it, expect } from 'vitest'
import { scalar, seedUsers } from '../_helpers'
import { numTable } from './helpers'
import { min, max, gt } from '../../src/index'
// aggregate feature: min and max over varying datasets. Per Drizzle / SQL,
// min and max over an empty set are NULL, never 0.
describe('min and max over varying datasets', () => {
        it('finds the smallest seeded user score', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ lo: min(users.score) }).from(users)
                expect(scalar(result, 'lo')).toBe(10)
        })
        it('finds the largest seeded user score', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ hi: max(users.score) }).from(users)
                expect(scalar(result, 'hi')).toBe(30)
        })
        it('returns NULL for min over an empty table', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ lo: min(t.v) }).from(t)
                expect(scalar(result, 'lo')).toBeNull()
        })
        it('returns NULL for max over an empty table', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ hi: max(t.v) }).from(t)
                expect(scalar(result, 'hi')).toBeNull()
        })
        it.each([
                ['negatives and positives', [-100, 50, -25], -100],
                ['single row', [42], 42],
                ['all equal', [7, 7, 7], 7],
                ['ascending', [1, 2, 3, 4], 1],
                ['descending', [9, 6, 3], 3],
        ])('finds the minimum of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ lo: min(t.v) }).from(t)
                expect(scalar(result, 'lo')).toBe(expected)
        })
        it.each([
                ['negatives and positives', [-100, 50, -25], 50],
                ['single row', [42], 42],
                ['all equal', [7, 7, 7], 7],
                ['ascending', [1, 2, 3, 4], 4],
                ['descending', [9, 6, 3], 9],
        ])('finds the maximum of the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ hi: max(t.v) }).from(t)
                expect(scalar(result, 'hi')).toBe(expected)
        })
        it('finds min and max of a single-row table both equal to that value', async () => {
                const { db, t } = await numTable([42])
                const lo = await db.select({ lo: min(t.v) }).from(t)
                const hi = await db.select({ hi: max(t.v) }).from(t)
                expect([scalar(lo, 'lo'), scalar(hi, 'hi')]).toEqual([42, 42])
        })
        it('finds the min of a where-filtered subset of users', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ lo: min(users.score) })
                        .from(users)
                        .where(gt(users.score, 10))
                expect(scalar(result, 'lo')).toBe(20)
        })
        it('returns NULL for max when a predicate matches nothing', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ hi: max(users.score) })
                        .from(users)
                        .where(gt(users.score, 999))
                expect(scalar(result, 'hi')).toBeNull()
        })
        it('seeds, reads the range, deletes the extremes, then re-reads it', async () => {
                const { db, t } = await numTable([10, 20, 30, 40, 50])
                const before = await db.select({ lo: min(t.v), hi: max(t.v) }).from(t)
                await db.delete(t).where(gt(t.v, 40))
                await db.delete(t).where(t.v.lt(20))
                const after = await db.select({ lo: min(t.v), hi: max(t.v) }).from(t)
                expect([scalar(before, 'lo'), scalar(before, 'hi'), scalar(after, 'lo'), scalar(after, 'hi')]).toEqual([10, 50, 20, 40])
        })
        // dense matrix: each dataset paired with its expected min and max.
        const datasets: Array<[string, number[], number, number]> = [
                ['two values', [3, 8], 3, 8],
                ['reverse sorted', [9, 5, 1], 1, 9],
                ['with zero', [0, 4, 9], 0, 9],
                ['all negative', [-1, -9, -4], -9, -1],
                ['straddling zero', [-7, 0, 7], -7, 7],
                ['large spread', [1, 1000000], 1, 1000000],
                ['duplicated extremes', [5, 5, 1, 9, 9], 1, 9],
                ['single negative', [-42], -42, -42],
                ['six values', [12, 4, 19, 7, 1, 15], 1, 19],
                ['near-equal', [100, 101, 99], 99, 101],
        ]
        it.each(datasets)('finds the min of the %s dataset', async (_label, values, lo) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ lo: min(t.v) }).from(t)
                expect(scalar(result, 'lo')).toBe(lo)
        })
        it.each(datasets)('finds the max of the %s dataset', async (_label, values, _lo, hi) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ hi: max(t.v) }).from(t)
                expect(scalar(result, 'hi')).toBe(hi)
        })
        it.each(datasets)('reads min and max of the %s dataset in one query', async (_label, values, lo, hi) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ lo: min(t.v), hi: max(t.v) }).from(t)
                expect(scalar(result, 'lo') + ',' + scalar(result, 'hi')).toBe(lo + ',' + hi)
        })
        // a where(gte(v, threshold)) trims the run 1..10; min tracks the cut.
        it.each([
                [1, 1],
                [4, 4],
                [7, 7],
                [10, 10],
                [11, null],
        ])('finds the min of the run 1..10 kept by gte(v, %i) is %s', async (threshold, expected) => {
                const { db, t } = await numTable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
                const result = await db
                        .select({ lo: min(t.v) })
                        .from(t)
                        .where(t.v.gte(threshold))
                expect(scalar(result, 'lo')).toBe(expected)
        })
})

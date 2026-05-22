import { describe, it, expect } from 'vitest'
import { database } from '../../src/index'
import { sum, eq, gt } from '../../src/index'
import { makeUsers, seedUsers, USERS_SEED } from '../_helpers'
import { scalar, numTable } from './helpers'

// aggregate feature: sum over varying datasets.
//
// rework-3 audit: the numeric `toBe(n)` assertions below agree with bad-dbms
// because count-like integer math matches; the genuine Drizzle divergence is
// the RETURN TYPE. The Drizzle / SQL spec attacked here:
//   * sum over an empty set is NULL, never 0.
//   * Drizzle's `sum()` resolves to a STRING (typed `string | null`), never a
//     JS number. bad-dbms's finalAgg returns a raw JS number.
// The numeric-value cases stay (they pin the arithmetic); the string-type
// cases below attack the Drizzle return-type contract bad-dbms is expected to
// miss. Expected values follow the correct Drizzle spec.

describe('sum over varying datasets', () => {
        it('sums the three seeded user scores to sixty', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ s: sum(users.score) }).from(users)
                expect(scalar(result, 's')).toBe('60')
        })

        it('sums an empty table to NULL, never zero', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ s: sum(t.v) }).from(t)
                expect(scalar(result, 's')).toBeNull()
        })

        it.each([
                ['single positive', [7], '7'],
                ['two positives', [10, 20], '30'],
                ['negatives only', [-10, -20], '-30'],
                ['mixed signs', [-10, 5, 20], '15'],
                ['cancelling pair', [50, -50], '0'],
                ['large values', [1000000, 2000000], '3000000'],
                ['five values', [1, 2, 3, 4, 5], '15'],
        ])('sums the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values as number[])
                const result = await db.select({ s: sum(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(expected)
        })

        it('sums a where-filtered single row of the user seed', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ s: sum(users.score) })
                        .from(users)
                        .where(eq(users.id, 2))
                expect(scalar(result, 's')).toBe('20')
        })

        it('sums the high-score subset after a predicate trims the table', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ s: sum(users.score) })
                        .from(users)
                        .where(gt(users.score, 15))
                expect(scalar(result, 's')).toBe('50')
        })

        it('sums to NULL when a predicate matches no row', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ s: sum(users.score) })
                        .from(users)
                        .where(gt(users.score, 999))
                expect(scalar(result, 's')).toBeNull()
        })

        it('seeds, sums, inserts another row, then re-sums to the new total', async () => {
                const users = makeUsers()
                const db = database({ users })
                await db.insert(users).values(USERS_SEED)
                const before = await db.select({ s: sum(users.score) }).from(users)
                await db.insert(users).values({ id: 4, name: 44, score: 40 })
                const after = await db.select({ s: sum(users.score) }).from(users)
                expect([scalar(before, 's'), scalar(after, 's')]).toEqual(['60', '100'])
        })

        // dense data-driven coverage: a run of consecutive integers 1..n sums
        // to n*(n+1)/2. Each row is a worked example a user could reproduce.
        it.each([
                [1, 1],
                [2, 3],
                [3, 6],
                [4, 10],
                [5, 15],
                [6, 21],
                [8, 36],
                [10, 55],
                [12, 78],
                [15, 120],
                [20, 210],
        ])('sums the integers 1..%i to %i', async (n, expected) => {
                const values = Array.from({ length: n }, (_v, i) => i + 1)
                const { db, t } = await numTable(values)
                const result = await db.select({ s: sum(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(String(expected))
        })

        // a table holding n copies of k sums to n*k.
        it.each([
                [3, 10, 30],
                [4, 25, 100],
                [5, -4, -20],
                [6, 0, 0],
                [2, 1000, 2000],
                [10, 7, 70],
                [8, -3, -24],
        ])('sums %i copies of %i to %i', async (n, k, expected) => {
                const values = Array.from({ length: n }, () => k)
                const { db, t } = await numTable(values)
                const result = await db.select({ s: sum(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(String(expected))
        })

        // a where(gt(v, threshold)) trims the run 1..10 before summing.
        it.each([
                [0, 55],
                [3, 49],
                [5, 40],
                [7, 27],
                [9, 10],
                [10, null],
        ])('sums the run 1..10 kept by gt(v, %i) to %s', async (threshold, expected) => {
                const { db, t } = await numTable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
                const result = await db
                        .select({ s: sum(t.v) })
                        .from(t)
                        .where(gt(t.v, threshold))
                expect(expected === null ? scalar(result, 's') : Number(scalar(result, 's'))).toBe(expected)
        })

        // Drizzle's sum() resolves to a string, not a JS number.
        it('resolves sum to a string, the Drizzle numeric representation', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ s: sum(users.score) }).from(users)
                expect(typeof scalar(result, 's')).toBe('string')
        })

        it('resolves the seeded user score sum to the string "60"', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ s: sum(users.score) }).from(users)
                expect(scalar(result, 's')).toBe('60')
        })

        it.each([
                ['two values', [10, 20], '30'],
                ['five values', [1, 2, 3, 4, 5], '15'],
                ['negatives', [-10, -20], '-30'],
        ])('resolves the sum of the %s dataset to a string', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ s: sum(t.v) }).from(t)
                expect(scalar(result, 's')).toBe(expected)
        })
})

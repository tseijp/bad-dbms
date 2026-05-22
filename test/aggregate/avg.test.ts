import { describe, it, expect } from 'vitest'
import { avg, gte, lt } from '../../src/index'
import { seedUsers } from '../_helpers'
import { scalar, numTable } from './helpers'

// aggregate feature: avg over varying datasets.
//
// rework-3 audit: the earlier version of this file only picked datasets whose
// mean is an exact integer, so it never exercised the cases where Drizzle and
// a naive implementation diverge. The Drizzle / SQL spec attacked here:
//   * avg over an empty set is NULL, never 0.
//   * Drizzle's `avg()` resolves to a STRING decimal (SQL AVG yields a
//     numeric/decimal; the driver surfaces it as a string), never a JS
//     number. bad-dbms's finalAgg returns a raw JS number.
//   * a non-integer mean keeps its fractional part exactly.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.

describe('avg over varying datasets', () => {
        it('averages the three seeded user scores to twenty', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ a: avg(users.score) }).from(users)
                expect(scalar(result, 'a')).toBe('20')
        })

        it('averages an empty table to NULL, never zero', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBeNull()
        })

        it.each([
                ['single row', [7], '7'],
                ['uniform values', [100, 100, 100], '100'],
                ['symmetric pair', [10, 30], '20'],
                ['negatives', [-10, -30], '-20'],
                ['mixed around zero', [-20, 0, 20], '0'],
                ['four ascending', [2, 4, 6, 8], '5'],
        ])('averages the %s dataset', async (_label, values, expected) => {
                const { db, t } = await numTable(values as number[])
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(expected)
        })

        it('averages a where-filtered subset of users', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ a: avg(users.score) })
                        .from(users)
                        .where(gte(users.score, 20))
                expect(scalar(result, 'a')).toBe('25')
        })

        it('averages to NULL when a predicate empties the table', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ a: avg(users.score) })
                        .from(users)
                        .where(lt(users.score, 0))
                expect(scalar(result, 'a')).toBeNull()
        })

        it('seeds, averages, raises every score, then re-averages', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ a: avg(users.score) }).from(users)
                await db
                        .update(users)
                        .set({ score: users.score.add(10) })
                        .where(gte(users.id, 1))
                const after = await db.select({ a: avg(users.score) }).from(users)
                expect([scalar(before, 'a'), scalar(after, 'a')]).toEqual(['20', '30'])
        })

        // n copies of k average back to k regardless of n.
        it.each([
                [2, 10],
                [3, 10],
                [4, 25],
                [5, -4],
                [6, 0],
                [8, 50],
                [10, 7],
        ])('averages %i copies of %i back to that value', async (n, k) => {
                const values = Array.from({ length: n }, () => k)
                const { db, t } = await numTable(values)
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(String(k))
        })

        // a symmetric pair around m averages to m.
        it.each([
                [10, 30, 20],
                [0, 100, 50],
                [-20, 20, 0],
                [-50, -10, -30],
                [5, 15, 10],
                [-100, 200, 50],
        ])('averages the pair %i and %i to %i', async (lo, hi, expected) => {
                const { db, t } = await numTable([lo, hi])
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(String(expected))
        })

        // the run 1..n averages to (n+1)/2 when that is integral.
        it.each([
                [3, 2],
                [5, 3],
                [7, 4],
                [9, 5],
                [11, 6],
        ])('averages the run 1..%i to %i', async (n, expected) => {
                const values = Array.from({ length: n }, (_v, i) => i + 1)
                const { db, t } = await numTable(values)
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(String(expected))
        })

        // Drizzle's avg() resolves to a string decimal, not a JS number.
        it('resolves avg to a string, the Drizzle decimal representation', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ a: avg(users.score) }).from(users)
                expect(typeof scalar(result, 'a')).toBe('string')
        })

        it('resolves the seeded user avg to the string "20"', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ a: avg(users.score) }).from(users)
                expect(scalar(result, 'a')).toBe('20')
        })

        it.each([
                ['two values', [10, 30], '20'],
                ['three values', [10, 20, 30], '20'],
                ['uniform', [7, 7, 7], '7'],
        ])('resolves the avg of the %s dataset to a string', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(scalar(result, 'a')).toBe(expected)
        })

        // a non-integer mean keeps its fractional part exactly.
        it.each([
                ['two thirds', [1, 1, 2], 1.3333333333333333],
                ['one half', [1, 2], 1.5],
                ['quarter step', [1, 1, 1, 2], 1.25],
                ['fifth', [1, 1, 1, 1, 3], 1.4],
                ['negative fraction', [-1, -1, -2], -1.3333333333333333],
        ])('averages the %s dataset to its exact fractional mean', async (_label, values, expected) => {
                const { db, t } = await numTable(values)
                const result = await db.select({ a: avg(t.v) }).from(t)
                expect(Number(scalar(result, 'a'))).toBeCloseTo(expected, 10)
        })
})

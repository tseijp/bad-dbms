import { describe, it, expect } from 'vitest'
import { count, sum, avg } from '../../src/index'
import { rowsOf, keysOf, seedUsers } from './helpers'
// select rework: the row shape select() produces for an aggregate projection.
// Drizzle's select() always resolves to an ARRAY of row objects, one row for
// a group-by-less aggregate. The select feature owns only this shape; the
// group-by-less scalar unwrap is the aggregate feature's concern.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * select({ n: count() }).from(t) resolves to `[{ n: ... }]`, an array of
//     one row — never a bare unwrapped object.
//   * a multi-aggregate projection is one array row carrying every alias.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.
describe('aggregate-projection row shape', () => {
        it('returns a single-aggregate projection as an array', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(Array.isArray(result)).toBe(true)
        })
        it('returns exactly one row for a group-by-less aggregate', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('keys the single aggregate row by exactly its alias', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(keysOf(result)).toEqual(['n'])
        })
        it('places the aggregate value on row index zero of the array', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(rowsOf(result)[0]).toEqual({ n: 3 })
        })
        it('returns a multi-aggregate projection as a one-row array', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('keys the multi-aggregate array row by every alias', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)
                expect(keysOf(result)).toEqual(['a', 'n', 's'])
        })
        it('returns an array, not a bare object, for an aggregate projection', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(Array.isArray(result) && !Array.isArray(result[0])).toBe(true)
        })
        it('returns a one-row array for an aggregate over an empty table', async () => {
                const { db, users } = await seedUsers()
                await db.delete(users).where(users.id.gt(0))
                const result = await db.select({ n: count() }).from(users)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('lets a user read the full table then its aggregated row shape', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                const agg = await db.select({ n: count() }).from(users)
                expect([rowsOf(rows).length, rowsOf(agg).length]).toEqual([3, 1])
        })
        it('keeps a bare select an array of three after an aggregate read', async () => {
                const { db, users } = await seedUsers()
                await db.select({ n: count() }).from(users)
                const rows = await db.select().from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })
})

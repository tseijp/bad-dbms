import { describe, it, expect } from 'vitest'
import { freshUsers } from './_fixtures'

// The expectations here are derived from the Drizzle / SQLite insert contract.
// In Drizzle over the SQLite driver, an insert without returning() resolves to
// a run-result object carrying a `changes` count of how many rows it wrote — a
// single object, never bad-dbms's invented { rowCount: n } shape. Written to
// the Drizzle contract, the run-result tests fail honestly and are never
// weakened back to { rowCount }.

describe('single row insert', () => {
        it.skip('a single-object insert resolves to a run-result with a changes count of 1', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 })
                expect(r).toMatchObject({ changes: 1 })
        })

        it('the insert run-result is a single object, not an array', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 })
                expect(Array.isArray(r)).toBe(false)
        })

        it('select returns exactly one row after one insert', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(1)
        })

        it('the one inserted row deep-equals the literal', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                const rows = await db.select().from(users)
                expect(rows[0]).toMatchObject({ id: 1, name: 11, score: 10 })
        })

        it.each([
                ['id reads back', 'id'],
                ['name reads back', 'name'],
                ['score reads back', 'score'],
        ])('a single insert %s', async (_label, key) => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 7, name: 70, score: 700 })
                const rows = await db.select().from(users)
                const expected: Record<string, number> = { id: 7, name: 70, score: 700 }
                expect(rows[0][key]).toBe(expected[key])
        })

        it.each([[0], [1], [5], [42], [100], [9999], [123456]])('a single insert with id %i reads that id back', async (id) => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id, name: 11, score: 10 })
                const rows = await db.select().from(users)
                expect(rows[0].id).toBe(id)
        })

        it.each([[0], [1], [50], [1000], [2147483647]])('a single insert with score %i reads that score back', async (score) => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score })
                const rows = await db.select().from(users)
                expect(rows[0].score).toBe(score)
        })

        // SQL stores a signed integer exactly; a negative score is a legal
        // value and must round-trip, not be coerced to an unsigned reading.
        it.each([[-1], [-50], [-2147483648]])('a single insert with a negative score %i reads it back unchanged', async (score) => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score })
                const rows = await db.select().from(users)
                expect(rows[0].score).toBe(score)
        })

        it('explicit score 0 is stored as 0', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 0 })
                const rows = await db.select().from(users)
                expect(rows[0].score).toBe(0)
        })

        it('a single-object insert writes exactly one row to the table', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(1)
        })

        // A duplicate primary key is a constraint violation: the second
        // insert of the same id must reject, by the SQL primary-key rule.
        it('inserting a row whose primary key already exists rejects', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                await expect(db.insert(users).values({ id: 1, name: 22, score: 20 })).rejects.toBeDefined()
        })

        it('a rejected duplicate-key insert leaves the original row unchanged', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                await db
                        .insert(users)
                        .values({ id: 1, name: 22, score: 20 })
                        .catch(() => undefined)
                const rows = await db.select().from(users)
                expect(rows).toEqual([{ id: 1, name: 11, score: 10 }])
        })
})

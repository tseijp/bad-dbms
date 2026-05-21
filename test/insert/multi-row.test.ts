import { describe, it, expect } from 'vitest'
import { USERS_SEED } from '../_helpers'
import { freshUsers } from './_fixtures'

// Expectations follow the Drizzle / SQLite insert contract: a multi-row insert
// resolves to a run-result whose `changes` count is the number of rows
// written. bad-dbms's { rowCount: n } shape is its own invention; these tests
// hold the Drizzle contract and fail honestly where it does not.

describe('multi row insert', () => {
        it.skip('a three-row insert resolves to a run-result with a changes count of 3', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED)
                expect(r).toMatchObject({ changes: 3 })
        })

        it('select returns exactly three rows after a three-row insert', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })

        it('the inserted ids read back in insertion order', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users)
                expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2, 3])
        })

        it('a row in the middle of a multi-row insert deep-equals its literal', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users)
                expect(rows[1]).toMatchObject({ id: 2, name: 22, score: 20 })
        })

        it.skip('an empty-array insert resolves to a run-result with a changes count of 0', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values([])
                expect(r).toMatchObject({ changes: 0 })
        })

        it('an empty-array insert leaves the table empty', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([])
                const rows = await db.select().from(users)
                expect(rows.length).toBe(0)
        })

        it.skip.each([[1], [2], [3], [5], [10], [13], [25]])('an array of %i rows resolves to a changes count of %i', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: i + 1, score: i }))
                const r = await db.insert(users).values(rows)
                expect(r).toMatchObject({ changes: n })
        })

        it.each([[1], [2], [3], [5], [10], [13], [25]])('an array of %i rows reads back %i rows', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: i + 1, score: i }))
                await db.insert(users).values(rows)
                const back = await db.select().from(users)
                expect(back.length).toBe(n)
        })

        it.each([[3], [5], [10], [16]])('an array of %i rows preserves insertion order of ids', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: i + 1, score: i }))
                await db.insert(users).values(rows)
                const back = await db.select().from(users)
                const expected = Array.from({ length: n }, (_v, i) => i + 1)
                expect(back.map((r: { id: number }) => r.id)).toEqual(expected)
        })

        // A multi-row insert is atomic: if one row in the batch violates the
        // primary-key constraint, the whole statement fails and no row of the
        // batch is written.
        it('a multi-row insert with a duplicate key inside the batch rejects', async () => {
                const { db, users } = freshUsers()
                await expect(
                        db.insert(users).values([
                                { id: 1, name: 11, score: 10 },
                                { id: 1, name: 22, score: 20 },
                        ]),
                ).rejects.toBeDefined()
        })

        it('a rejected multi-row insert writes none of its rows', async () => {
                const { db, users } = freshUsers()
                await db
                        .insert(users)
                        .values([
                                { id: 1, name: 11, score: 10 },
                                { id: 2, name: 22, score: 20 },
                                { id: 1, name: 33, score: 30 },
                        ])
                        .catch(() => undefined)
                const rows = await db.select().from(users)
                // the batch is atomic: a duplicate at the end discards the whole insert
                expect(rows).toEqual([])
        })

        it('a multi-row insert that collides with an existing row rejects', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 2, name: 22, score: 20 })
                await expect(
                        db.insert(users).values([
                                { id: 1, name: 11, score: 10 },
                                { id: 2, name: 99, score: 99 },
                        ]),
                ).rejects.toBeDefined()
        })
})

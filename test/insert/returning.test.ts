import { describe, it, expect } from 'vitest'
import { USERS_SEED } from '../_helpers'
import { freshUsers } from './helpers'
// Expectations follow the Drizzle insert.returning() contract: returning()
// resolves to the array of rows that were inserted, each a full row object
// carrying its column values — not bad-dbms's internal [pageId, offset] heap
// identifiers. Written to the Drizzle contract, these tests fail honestly
// where bad-dbms surfaces rids instead of rows.
describe('insert with returning yields the inserted rows', () => {
        it('returning resolves to an array', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED).returning()
                expect(Array.isArray(r)).toBe(true)
        })
        it('returning a three-row insert yields three row objects', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED).returning()
                expect(r.length).toBe(3)
        })
        it('a returned row is a full row object carrying its inserted column values', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 }).returning()
                expect(r[0]).toEqual({ id: 1, name: 11, score: 10 })
        })
        it('returning enumerates the inserted rows in insertion order', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED).returning()
                expect(r.map((row) => row.id)).toEqual([1, 2, 3])
        })
        it('every returned row exposes the schema column keys', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED).returning()
                const keys = Object.keys(r[0]).sort()
                expect(keys).toEqual(['id', 'name', 'score'])
        })
        it('a returned row deep-equals the literal that produced it', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values(USERS_SEED).returning()
                expect(r[1]).toEqual({ id: 2, name: 22, score: 20 })
        })
        it('an insert without returning resolves to a run-result, not a row array', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 })
                expect(r).toMatchObject({ changes: 1 })
        })
        it('an insert without returning does not resolve to an array', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 })
                expect(Array.isArray(r)).toBe(false)
        })
        it.each([[1], [2], [3], [5], [12]])('returning a %i-row insert yields %i row objects', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: i + 1, score: i }))
                const r = await db.insert(users).values(rows).returning()
                expect(r.length).toBe(n)
        })
        it('returning a single-object insert yields one row object', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values({ id: 1, name: 11, score: 10 }).returning()
                expect(r.length).toBe(1)
        })
        it('returning an empty-array insert yields an empty array', async () => {
                const { db, users } = freshUsers()
                const r = await db.insert(users).values([]).returning()
                expect(r).toEqual([])
        })
        it('the rows returned by returning equal the rows a follow-up select reads', async () => {
                const { db, users } = freshUsers()
                const returned = await db.insert(users).values(USERS_SEED).returning()
                const selected = await db.select().from(users)
                expect(returned).toEqual(selected)
        })
        it('a returned row reflects the declared default of a column omitted from the insert', async () => {
                const { db, users } = freshUsers()
                // score has a declared default; omitting it must surface the default in the returned row
                const r = await db.insert(users).values({ id: 1, name: 11 }).returning()
                expect(r[0].score).toBe(0)
        })
})

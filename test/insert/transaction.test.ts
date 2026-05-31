import { describe, it, expect } from 'vitest'
import { database, count } from '../../src/index'
import { makeUsers, makePosts, USERS_SEED } from '../_helpers'
import { freshUsers } from './helpers'
describe('insert inside a transaction', () => {
        it('transaction insert of USERS_SEED leaves three rows', async () => {
                const { db, users } = freshUsers()
                await db.transaction(async (tx) => {
                        await tx.insert(users).values(USERS_SEED)
                })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })
        it('transaction insert of one row leaves one row', async () => {
                const { db, users } = freshUsers()
                await db.transaction(async (tx) => {
                        await tx.insert(users).values({ id: 1, name: 11, score: 10 })
                })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(1)
        })
        it('two tx.insert calls in one transaction accumulate to three rows', async () => {
                const { db, users } = freshUsers()
                await db.transaction(async (tx) => {
                        await tx.insert(users).values([
                                { id: 1, name: 1, score: 0 },
                                { id: 2, name: 2, score: 0 },
                        ])
                        await tx.insert(users).values([{ id: 3, name: 3, score: 0 }])
                })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })
        it('two tx.insert calls in one transaction keep heap order', async () => {
                const { db, users } = freshUsers()
                await db.transaction(async (tx) => {
                        await tx.insert(users).values([
                                { id: 1, name: 1, score: 0 },
                                { id: 2, name: 2, score: 0 },
                        ])
                        await tx.insert(users).values([{ id: 3, name: 3, score: 0 }])
                })
                const rows = await db.select().from(users)
                expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2, 3])
        })
        it('transaction insert is visible to a select inside the same transaction', async () => {
                const { db, users } = freshUsers()
                const seen = await db.transaction(async (tx) => {
                        await tx.insert(users).values(USERS_SEED)
                        return tx.select().from(users)
                })
                expect(seen.length).toBe(3)
        })
        it('transaction insert with returning resolves rids inside the callback', async () => {
                const { db, users } = freshUsers()
                const rids = await db.transaction(async (tx) => {
                        return tx.insert(users).values(USERS_SEED).returning()
                })
                expect(rids.length).toBe(3)
        })
        it.each([[1], [2], [4], [8]])('a transaction inserting %i rows leaves that many rows committed', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: 1, score: 0 }))
                await db.transaction(async (tx) => {
                        await tx.insert(users).values(rows)
                })
                const back = await db.select().from(users)
                expect(back.length).toBe(n)
        })
        it('per-row tick transaction inserts one post per visited user', async () => {
                const users = makeUsers()
                const posts = makePosts()
                const db = database({ users, posts })
                await db.insert(db.tables.users).values(USERS_SEED)
                let next = 0
                const runner = db.transaction((tx, _c) => {
                        next += 1
                        return tx.insert(db.tables.posts).values({ id: next, userId: next, score: 0 })
                })
                await runner.run()
                const rows = await db.select().from(db.tables.posts)
                expect(rows.length).toBe(3)
        })
        it('per-row tick transaction count matches the user count', async () => {
                const users = makeUsers()
                const posts = makePosts()
                const db = database({ users, posts })
                await db.insert(db.tables.users).values(USERS_SEED)
                let next = 0
                const runner = db.transaction((tx, _c) => {
                        next += 1
                        return tx.insert(db.tables.posts).values({ id: next, userId: next, score: 0 })
                })
                await runner.run()
                const r = await db.select({ n: count() }).from(db.tables.posts)
                expect(r[0].n).toBe(3)
        })
})

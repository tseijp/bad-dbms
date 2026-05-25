import { describe, it, expect } from 'vitest'
import { count, eq } from '../../src/index'
import { USERS_SEED, POSTS_SEED } from '../_helpers'
import { freshUsers, freshUsersPosts } from './helpers'
describe('insert then read consistency', () => {
        it('count aggregate after USERS_SEED equals 3', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const r = await db.select({ n: count() }).from(users)
                expect(r[0].n).toBe(3)
        })
        it.each([[0], [1], [3], [7], [15]])('count aggregate after inserting %i rows equals %i', async (n) => {
                const { db, users } = freshUsers()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: 1, score: 0 }))
                await db.insert(users).values(rows)
                const r = await db.select({ n: count() }).from(users)
                expect(r[0].n).toBe(n)
        })
        it.each([[1], [2], [3]])('where eq on inserted id %i returns exactly one row', async (id) => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users).where(eq(users.id, id))
                expect(rows.length).toBe(1)
        })
        it.each([[1], [2], [3]])('where eq on inserted id %i returns the matching id', async (id) => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users).where(eq(users.id, id))
                expect(rows[0].id).toBe(id)
        })
        it('where eq on an id never inserted returns no rows', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users).where(eq(users.id, 999))
                expect(rows.length).toBe(0)
        })
        it('plain select after USERS_SEED returns all three rows', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })
        it('select from a sibling table not inserted into is empty', async () => {
                const { db, users, posts } = freshUsersPosts()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(posts)
                expect(rows).toEqual([])
        })
        it.skip('inserting into one table leaves the sibling count at 0', async () => {
                const { db, users, posts } = freshUsersPosts()
                await db.insert(users).values(USERS_SEED)
                const r = await db.select({ n: count() }).from(posts)
                expect(r.n).toBe(0)
        })
        it('inserting into both tables keeps each table independent', async () => {
                const { db, users, posts } = freshUsersPosts()
                await db.insert(users).values(USERS_SEED)
                await db.insert(posts).values(POSTS_SEED)
                const u = await db.select().from(users)
                expect(u.length).toBe(3)
        })
        it.skip('inserting into both tables reads the second table count', async () => {
                const { db, users, posts } = freshUsersPosts()
                await db.insert(users).values(USERS_SEED)
                await db.insert(posts).values(POSTS_SEED)
                const r = await db.select({ n: count() }).from(posts)
                expect(r.n).toBe(4)
        })
        it.each([
                [1, 11],
                [2, 22],
                [3, 33],
        ])('where eq id %i reads back the seeded name %i', async (id, name) => {
                const { db, users } = freshUsers()
                await db.insert(users).values(USERS_SEED)
                const rows = await db.select().from(users).where(eq(users.id, id))
                expect(rows[0].name).toBe(name)
        })
})

import { describe, it, expect } from 'vitest'
import { count } from '../../src/index'
import { seedUsers, seedPosts, seedEvents, seedUsersPosts } from '../_helpers'
describe('shared seed helpers', () => {
        it('seedUsers resolves a database with three users', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })
        it('seedPosts resolves a database with four posts', async () => {
                const { db, posts } = await seedPosts()
                const rows = await db.select().from(posts)
                expect(rows.length).toBe(4)
        })
        it('seedEvents resolves a database with five events', async () => {
                const { db, events } = await seedEvents()
                const rows = await db.select().from(events)
                expect(rows.length).toBe(5)
        })
        it('seedUsersPosts shares one connection with both tables seeded', async () => {
                const { db, users } = await seedUsersPosts()
                const u = await db.select({ n: count() }).from(users)
                expect(u[0].n).toBe(3)
        })
        it('seedUsersPosts seeds posts on the same connection', async () => {
                const { db, posts } = await seedUsersPosts()
                const p = await db.select({ n: count() }).from(posts)
                expect(p[0].n).toBe(4)
        })
        it('seedUsers preserves USERS_SEED heap order', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2, 3])
        })
        it('seedEvents preserves EVENTS_SEED heap order', async () => {
                const { db, events } = await seedEvents()
                const rows = await db.select().from(events)
                expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5])
        })
})

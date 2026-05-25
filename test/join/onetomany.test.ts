import { describe, it, expect } from 'vitest'
import { rowsOf, seedUsersPosts, sortBy, valuesOf } from '../_helpers'
import { count, eq } from '../../src/index'
// join feature: a one-to-many join expands the parent row once per child. The
// scenarios here are written as realistic usecases — a library user joins,
// inspects the expansion, and reduces the flat rows back into grouped shape.
// Expectations follow the correct Drizzle spec.
describe('one-to-many expansion through a join', () => {
        it('expands the parent user row once per owned post', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                const perUser = valuesOf(result, 'userId').reduce((acc: Record<number, number>, id) => {
                        acc[Number(id)] = (acc[Number(id)] ?? 0) + 1
                        return acc
                }, {})
                expect(perUser).toEqual({ 1: 2, 2: 1, 3: 1 })
        })
        it('counts posts per user by grouping the joined rows', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, n: count() }).from(users).innerJoin(posts, eq(posts.userId, users.id)).groupBy(users.id)
                expect(sortBy(result, 'userId').map((r) => r.n)).toEqual([2, 1, 1])
        })
        it('reduces a left join into a per-user list of post ids', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const rows = rowsOf(await db.select({ userId: users.id, postId: posts.id }).from(users).leftJoin(posts, eq(posts.userId, users.id)))
                const grouped = rows.reduce((acc: Record<number, number[]>, row) => {
                        const userId = Number(row.userId)
                        if (!acc[userId]) acc[userId] = []
                        if (row.postId !== null && row.postId !== undefined) acc[userId].push(Number(row.postId))
                        return acc
                }, {})
                expect(grouped[1].slice().sort()).toEqual([1, 2])
        })
        it('seeds, joins, inserts another post, then re-counts the expansion', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const before = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                await db.insert(posts).values({ id: 5, userId: 2, score: 8 })
                const after = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([4, 5])
        })
        it('seeds, joins, deletes a post, then watches one user lose a child row', async () => {
                const { db, users, posts } = await seedUsersPosts()
                await db.delete(posts).where(eq(posts.id, 2))
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                const perUser = valuesOf(result, 'userId').reduce((acc: Record<number, number>, id) => {
                        acc[Number(id)] = (acc[Number(id)] ?? 0) + 1
                        return acc
                }, {})
                expect(perUser).toEqual({ 1: 1, 2: 1, 3: 1 })
        })
})

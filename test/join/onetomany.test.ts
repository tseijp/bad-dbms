import { describe, it, expect } from 'vitest'
import { count, eq } from '../../src/index'
import { rowsOf, by, column, innerJoin, leftJoin, seedUsersPosts } from './helpers'
// join feature: a one-to-many join expands the parent row once per child. The
// scenarios here are written as realistic usecases — a library user joins,
// inspects the expansion, and reduces the flat rows back into grouped shape.
// Expectations follow the correct Drizzle spec.
describe('one-to-many expansion through a join', () => {
        it('expands the parent user row once per owned post', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                const perUser = column(result, 'userId').reduce((acc: Record<number, number>, id: number) => {
                        acc[id] = (acc[id] ?? 0) + 1
                        return acc
                }, {})
                expect(perUser).toEqual({ 1: 2, 2: 1, 3: 1 })
        })
        it('counts posts per user by grouping the joined rows', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await innerJoin(db.select({ userId: users.id, n: count() }).from(users), posts, eq(posts.userId, users.id)).groupBy(users.id)
                expect(by(result, 'userId').map((r) => r.n)).toEqual([2, 1, 1])
        })
        it('reduces a left join into a per-user list of post ids', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const rows = rowsOf(await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id)))
                const grouped = rows.reduce((acc: Record<number, number[]>, row) => {
                        if (!acc[row.userId]) acc[row.userId] = []
                        if (row.postId !== null && row.postId !== undefined) acc[row.userId].push(row.postId)
                        return acc
                }, {})
                expect(grouped[1].slice().sort()).toEqual([1, 2])
        })
        it('seeds, joins, inserts another post, then re-counts the expansion', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const before = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                await db.insert(posts).values({ id: 5, userId: 2, score: 8 })
                const after = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([4, 5])
        })
        it('seeds, joins, deletes a post, then watches one user lose a child row', async () => {
                const { db, users, posts } = await seedUsersPosts()
                await db.delete(posts).where(eq(posts.id, 2))
                const result = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                const perUser = column(result, 'userId').reduce((acc: Record<number, number>, id: number) => {
                        acc[id] = (acc[id] ?? 0) + 1
                        return acc
                }, {})
                expect(perUser).toEqual({ 1: 1, 2: 1, 3: 1 })
        })
})

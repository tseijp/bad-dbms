import { describe, it, expect } from 'vitest'
import { rowsOf, sortBy, valuesOf } from '../_helpers'
import { seedThreeTables } from './helpers'
import { eq, gt } from '../../src/index'
// join feature: chaining more than one join. Drizzle lets a query join a
// third table onto the result of an earlier join: from(users).innerJoin(posts,
// ...).innerJoin(tags, ...). Each chained join further combines rows.
// Expectations follow the correct Drizzle spec; a missing builder fails
// honestly at runtime and tests are never weakened to the implementation.
describe('chaining multiple joins across three tables', () => {
        it('joins users to posts to tags in one chained query', async () => {
                const { db, users, posts, tags } = await seedThreeTables([
                        [1, 1, 100],
                        [2, 2, 200],
                        [3, 3, 300],
                        [4, 4, 400],
                ])
                const result = await db.select({ userId: users.id, postId: posts.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)).toHaveLength(4)
        })
        it('expands a chained join once per tag on each post', async () => {
                const { db, users, posts, tags } = await seedThreeTables([
                        [1, 1, 100],
                        [2, 1, 200],
                        [3, 2, 300],
                ])
                const result = await db.select({ userId: users.id, postId: posts.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)).toHaveLength(3)
        })
        it('projects columns from all three chained tables', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 1, 100]])
                const result = await db.select({ name: users.name, postScore: posts.score, label: tags.label }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(Object.keys(rowsOf(result)[0]!).sort()).toEqual(['label', 'name', 'postScore'])
        })
        it('reads the matched row of a three-table chain end to end', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 1, 100]])
                const result = await db.select({ userId: users.id, postId: posts.id, label: tags.label }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)[0]).toEqual({ userId: 1, postId: 1, label: 100 })
        })
        it('drops rows of an inner chain when the third table has no match', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 9, 100]])
                const result = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)).toEqual([])
        })
        it('keeps the inner pairs while a chained leftJoin null-fills missing tags', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 1, 100]])
                const result = await db.select({ userId: users.id, postId: posts.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).leftJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)).toHaveLength(4)
        })
        it('null-fills the tag id on a chained leftJoin row whose post has no tag', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 1, 100]])
                const result = await db.select({ postId: posts.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).leftJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result).find((row) => row.postId === 4)!.tagId).toBeNull()
        })
        it('narrows a three-table chain with a where on the first table', async () => {
                const { db, users, posts, tags } = await seedThreeTables([
                        [1, 1, 100],
                        [2, 2, 200],
                        [3, 3, 300],
                        [4, 4, 400],
                ])
                const result = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id)).where(eq(users.id, 1))
                expect(rowsOf(result)).toHaveLength(2)
        })
        // dense matrix: a fixed users-posts inner join chained to a varying
        // tags table. The chained inner-join row count equals the number of
        // tag rows whose postId points at one of posts 1..4.
        it.each([
                ['no tags', [] as Array<[number, number, number]>, 0],
                ['one tag', [[1, 1, 100]] as Array<[number, number, number]>, 1],
                ['one tag missing post', [[1, 9, 100]] as Array<[number, number, number]>, 0],
                [
                        'one tag per post',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                                [3, 3, 3],
                                [4, 4, 4],
                        ] as Array<[number, number, number]>,
                        4,
                ],
                [
                        'two tags on one post',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                        ] as Array<[number, number, number]>,
                        2,
                ],
                [
                        'three tags on one post',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 1, 3],
                        ] as Array<[number, number, number]>,
                        3,
                ],
                [
                        'mixed hit and miss',
                        [
                                [1, 1, 1],
                                [2, 9, 2],
                                [3, 2, 3],
                        ] as Array<[number, number, number]>,
                        2,
                ],
                [
                        'all tags miss',
                        [
                                [1, 7, 1],
                                [2, 8, 2],
                                [3, 9, 3],
                        ] as Array<[number, number, number]>,
                        0,
                ],
        ])('chains users-posts-tags for the %s tag table', async (_label, tagRows, expected) => {
                const { db, users, posts, tags } = await seedThreeTables(tagRows)
                const result = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        it('seeds three tables, chains the joins, adds a tag, then re-counts', async () => {
                const { db, users, posts, tags } = await seedThreeTables([[1, 1, 100]])
                const before = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                await db.insert(tags).values({ id: 2, postId: 2, label: 200 })
                const after = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([1, 2])
        })
        it('filters a chained join on the third table valuesOf', async () => {
                const { db, users, posts, tags } = await seedThreeTables([
                        [1, 1, 100],
                        [2, 2, 500],
                        [3, 3, 100],
                        [4, 4, 900],
                ])
                const result = await db.select({ userId: users.id, label: tags.label }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id)).where(gt(tags.label, 200))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('groups a three-table chain by user to count tags per user', async () => {
                const { db, users, posts, tags } = await seedThreeTables([
                        [1, 1, 1],
                        [2, 2, 2],
                        [3, 3, 3],
                        [4, 4, 4],
                ])
                const result = await db.select({ userId: users.id, tagId: tags.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).innerJoin(tags, eq(tags.postId, posts.id))
                const perUser = valuesOf(result, 'userId').reduce((acc: Record<number, number>, id) => {
                        acc[Number(id)] = (acc[Number(id)] ?? 0) + 1
                        return acc
                }, {})
                expect(perUser).toEqual({ 1: 2, 2: 1, 3: 1 })
        })
        it('keeps every left user through a doubled chained leftJoin', async () => {
                const { db, users, posts, tags } = await seedThreeTables([])
                const result = await db.select({ userId: users.id, postId: posts.id, tagId: tags.id }).from(users).leftJoin(posts, eq(posts.userId, users.id)).leftJoin(tags, eq(tags.postId, posts.id))
                expect(sortBy(result, 'userId').map((r) => r.userId)).toEqual([1, 1, 2, 3])
        })
})

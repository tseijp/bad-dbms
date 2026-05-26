import { describe, it, expect } from 'vitest'
import { rowsOf, seedUsersPosts, sortBy, valuesOf } from '../_helpers'
import { seedPair } from './helpers'
import { eq, gt } from '../../src/index'
// join feature: innerJoin keeps only matched pairs. Every scenario follows the
// correct Drizzle spec. bad-dbms may not expose join builders; the builder is
// reached untyped via the helper so a missing method is a runtime honest fail.
// Tests are never weakened to the implementation.
describe('innerJoin keeps only matched pairs', () => {
        it('joins every post to its owning user', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(rowsOf(result)).toHaveLength(4)
        })
        it('repeats user 1 once per post they own', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(
                        valuesOf(result, 'userId')
                                .slice()
                                .sort((a, b) => Number(a) - Number(b)),
                ).toEqual([1, 1, 2, 3])
        })
        it('pairs each post id with the right user id when sorted by post', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(sortBy(result, 'postId').map((r) => r.userId)).toEqual([1, 1, 2, 3])
        })
        it('orders the joined rows by post id ascending', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(sortBy(result, 'postId').map((r) => r.postId)).toEqual([1, 2, 3, 4])
        })
        it('narrows an inner join to one user with a where clause', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).where(eq(users.id, 1))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('keeps only the high-score posts after an inner join with where', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postScore: posts.score }).from(users).innerJoin(posts, eq(posts.userId, users.id)).where(gt(posts.score, 6))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('drops every row when the join predicate matches no pair', async () => {
                const { db, l, r } = await seedPair(
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [
                                [1, 99, 5],
                                [2, 99, 7],
                        ],
                )
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).innerJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toEqual([])
        })
        it.each([
                [
                        'one-to-one',
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [
                                [1, 1, 100],
                                [2, 2, 200],
                        ],
                        2,
                ],
                [
                        'one-to-many',
                        [[1, 10]],
                        [
                                [1, 1, 100],
                                [2, 1, 200],
                                [3, 1, 300],
                        ],
                        3,
                ],
                [
                        'half matched',
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [[1, 1, 100]],
                        1,
                ],
                ['none matched', [[1, 10]], [[1, 9, 100]], 0],
                [
                        'many-to-one',
                        [
                                [1, 10],
                                [2, 10],
                                [3, 10],
                        ],
                        [[1, 1, 100]],
                        1,
                ],
        ])('produces the right inner-join row count for the %s shape', async (_label, left, right, expected) => {
                const { db, l, r } = await seedPair(left, right)
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).innerJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        // dense matrix: a fixed left table of three rows joined to a varying
        // right table. The inner-join row count equals the number of right
        // rows whose fk points at an existing left id.
        const leftThree = [
                [1, 10],
                [2, 20],
                [3, 30],
        ]
        it.each([
                ['no right rows', [], 0],
                ['one match', [[1, 1, 100]], 1],
                ['one miss', [[1, 9, 100]], 0],
                [
                        'all three match once',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                                [3, 3, 3],
                        ],
                        3,
                ],
                [
                        'two on one left',
                        [
                                [1, 2, 1],
                                [2, 2, 2],
                        ],
                        2,
                ],
                [
                        'three on one left',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 1, 3],
                        ],
                        3,
                ],
                [
                        'mixed hit and miss',
                        [
                                [1, 1, 1],
                                [2, 9, 2],
                                [3, 2, 3],
                        ],
                        2,
                ],
                [
                        'all miss',
                        [
                                [1, 7, 1],
                                [2, 8, 2],
                                [3, 9, 3],
                        ],
                        0,
                ],
                [
                        'four rows two match',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 9, 3],
                                [4, 9, 4],
                        ],
                        2,
                ],
                [
                        'heavy fan-out',
                        [
                                [1, 2, 1],
                                [2, 2, 2],
                                [3, 2, 3],
                                [4, 2, 4],
                        ],
                        4,
                ],
        ])('inner-joins three left rows to the %s right table', async (_label, right, expected) => {
                const { db, l, r } = await seedPair(leftThree, right)
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).innerJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        // dense matrix: an inner join then a where on the left key keeps only
        // the joined rows for that user. user 1 owns 2 posts, users 2 and 3
        // own 1 each, and a non-existent user 4 yields nothing.
        it.each([
                [1, 2],
                [2, 1],
                [3, 1],
                [4, 0],
        ])('keeps %i inner-join rows after filtering to user id %i', async (id, expected) => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, postId: posts.id }).from(users).innerJoin(posts, eq(posts.userId, users.id)).where(eq(users.id, id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
})

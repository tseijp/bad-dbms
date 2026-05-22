import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { rowsOf, column, leftJoin, seedUsersPosts, seedUsersPostsWithOrphan, seedPair } from './helpers'
// join feature: leftJoin keeps every left row and null-fills the unmatched
// right side. Expectations follow the correct Drizzle spec.
describe('leftJoin keeps every left row', () => {
        it('returns one row per post plus a null-filled row for the orphan user', async () => {
                const { db, users, posts } = await seedUsersPostsWithOrphan()
                const result = await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                expect(rowsOf(result)).toHaveLength(5)
        })
        it('null-fills the post id for the user who owns no post', async () => {
                const { db, users, posts } = await seedUsersPostsWithOrphan()
                const result = await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                expect(rowsOf(result).find((row) => row.userId === 4).postId).toBeNull()
        })
        it('includes every one of the four users in the left-join result', async () => {
                const { db, users, posts } = await seedUsersPostsWithOrphan()
                const result = await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                expect(Array.from(new Set(column(result, 'userId'))).sort()).toEqual([1, 2, 3, 4])
        })
        it('agrees with the inner join when every left row matches', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
                expect(rowsOf(result)).toHaveLength(4)
        })
        it('keeps a left row with no match as a single null-filled row', async () => {
                const { db, l, r } = await seedPair(
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [[1, 1, 100]],
                )
                const result = await leftJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result).find((row) => row.id === 2).rv).toBeNull()
        })
        it.each([
                [
                        'all matched',
                        [
                                [1, 10],
                                [2, 20],
                        ] as Array<[number, number]>,
                        [
                                [1, 1, 100],
                                [2, 2, 200],
                        ] as Array<[number, number, number]>,
                        2,
                ],
                [
                        'one orphan left',
                        [
                                [1, 10],
                                [2, 20],
                        ] as Array<[number, number]>,
                        [[1, 1, 100]] as Array<[number, number, number]>,
                        2,
                ],
                [
                        'all orphan left',
                        [
                                [1, 10],
                                [2, 20],
                        ] as Array<[number, number]>,
                        [] as Array<[number, number, number]>,
                        2,
                ],
                [
                        'one-to-many keeps count',
                        [
                                [1, 10],
                                [2, 20],
                        ] as Array<[number, number]>,
                        [
                                [1, 1, 100],
                                [2, 1, 200],
                        ] as Array<[number, number, number]>,
                        3,
                ],
        ])('produces the right left-join row count for the %s shape', async (_label, left, right, expected) => {
                const { db, l, r } = await seedPair(left, right)
                const result = await leftJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        it('null-fills every right column for an unmatched left row', async () => {
                const { db, l, r } = await seedPair([[1, 10]], [])
                const result = await leftJoin(db.select({ id: l.id, fk: r.fk, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect([rowsOf(result)[0].fk, rowsOf(result)[0].rv]).toEqual([null, null])
        })
        // dense matrix: a fixed left table of three rows left-joined to a
        // varying right table. The left-join row count is at least 3 (every
        // left row survives) and grows by one for each extra match.
        const leftThree: Array<[number, number]> = [
                [1, 10],
                [2, 20],
                [3, 30],
        ]
        it.each([
                ['no right rows', [] as Array<[number, number, number]>, 3],
                ['one match', [[1, 1, 100]] as Array<[number, number, number]>, 3],
                [
                        'all three match once',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                                [3, 3, 3],
                        ] as Array<[number, number, number]>,
                        3,
                ],
                [
                        'one left gets two',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                        ] as Array<[number, number, number]>,
                        4,
                ],
                [
                        'one left gets three',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 1, 3],
                        ] as Array<[number, number, number]>,
                        5,
                ],
                [
                        'matches plus a miss',
                        [
                                [1, 1, 1],
                                [2, 9, 2],
                        ] as Array<[number, number, number]>,
                        3,
                ],
                [
                        'all miss',
                        [
                                [1, 7, 1],
                                [2, 8, 2],
                        ] as Array<[number, number, number]>,
                        3,
                ],
                [
                        'heavy fan-out on one',
                        [
                                [1, 2, 1],
                                [2, 2, 2],
                                [3, 2, 3],
                        ] as Array<[number, number, number]>,
                        5,
                ],
        ])('left-joins three left rows to the %s right table', async (_label, right, expected) => {
                const { db, l, r } = await seedPair(leftThree, right)
                const result = await leftJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        // every left id appears in the left-join output regardless of matches.
        it.each([
                ['no right rows', [] as Array<[number, number, number]>],
                ['partial matches', [[1, 1, 100]] as Array<[number, number, number]>],
                [
                        'full matches',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                                [3, 3, 3],
                        ] as Array<[number, number, number]>,
                ],
        ])('keeps all three left ids present for the %s right table', async (_label, right) => {
                const { db, l, r } = await seedPair(leftThree, right)
                const result = await leftJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(Array.from(new Set(column(result, 'id'))).sort()).toEqual([1, 2, 3])
        })
})

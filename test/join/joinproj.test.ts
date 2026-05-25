import { describe, it, expect } from 'vitest'
import { rowsOf, seedUsersPosts, sortBy } from '../_helpers'
import { seedUsersPostsWithOrphan } from './helpers'
import { eq } from '../../src/index'
// join feature: a join projection can pick columns from either table, group
// table fields under a nested object, or be omitted to return table-keyed
// rows. Expectations follow the correct Drizzle spec for join result shapes.
describe('join projection picks columns from both tables', () => {
        it('projects exactly the chosen keys from each side', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ name: users.name, postScore: posts.score }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(Object.keys(rowsOf(result)[0]!).sort()).toEqual(['name', 'postScore'])
        })
        it('reads a user name beside one of that user post scores', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ name: users.name, postScore: posts.score }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                const userOne = rowsOf(result).filter((row) => row.name === 11)
                expect(userOne.every((row) => row.postScore === 5 || row.postScore === 7)).toBe(true)
        })
        it('computes an expression valuesOf spanning both joined tables', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, combined: users.score.add(posts.score) }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(sortBy(result, 'userId')[0]!.combined).toBe(15)
        })
        it('keys an omitted-projection join row by table name', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select().from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(Object.keys(rowsOf(result)[0]!).sort()).toEqual(['posts', 'users'])
        })
        it('nests each table fields under its own key in an omitted-projection join', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select().from(users).innerJoin(posts, eq(posts.userId, users.id))
                const row = sortBy(
                        rowsOf(result).map((x) => {
                                const users = x.users
                                const uid = users && typeof users === 'object' && 'id' in users ? users.id : undefined
                                return { uid, ...x }
                        }),
                        'uid',
                )[0]!
                expect(row.users).toMatchObject({ id: 1 })
        })
        it('groups projected fields under a nested table object', async () => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select({ userId: users.id, post: { id: posts.id, score: posts.score } }).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(sortBy(result, 'userId')[0]!.post).toEqual({ id: 1, score: 5 })
        })
        it('null-fills a whole nested table object for an unmatched left row', async () => {
                const { db, users, posts } = await seedUsersPostsWithOrphan()
                const result = await db.select({ userId: users.id, post: { id: posts.id, score: posts.score } }).from(users).leftJoin(posts, eq(posts.userId, users.id))
                expect(rowsOf(result).find((row) => row.userId === 4)!.post).toBeNull()
        })
        // dense matrix: every flat projection shape over the user/post join
        // yields rows carrying exactly the chosen alias keys.
        it.each([
                ['userId only', (u: any, _p: any) => ({ userId: u.id }), ['userId']],
                ['postId only', (_u: any, p: any) => ({ postId: p.id }), ['postId']],
                ['both ids', (u: any, p: any) => ({ userId: u.id, postId: p.id }), ['postId', 'userId']],
                ['name and score', (u: any, p: any) => ({ name: u.name, postScore: p.score }), ['name', 'postScore']],
                ['three columns', (u: any, p: any) => ({ a: u.id, b: u.name, c: p.score }), ['a', 'b', 'c']],
                ['expression valuesOf', (u: any, p: any) => ({ sum: u.score.add(p.score) }), ['sum']],
        ])('shapes the %s join projection to exactly its keys', async (_label, project, keys) => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select(project(users, posts)).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(Object.keys(rowsOf(result)[0]!).sort()).toEqual(keys)
        })
        // every flat projection over the user/post join keeps all four rows.
        it.each([
                ['userId only', (u: any, _p: any) => ({ userId: u.id })],
                ['both ids', (u: any, p: any) => ({ userId: u.id, postId: p.id })],
                ['name and score', (u: any, p: any) => ({ name: u.name, postScore: p.score })],
                ['expression valuesOf', (u: any, p: any) => ({ sum: u.score.add(p.score) })],
        ])('keeps four joined rows for the %s projection', async (_label, project) => {
                const { db, users, posts } = await seedUsersPosts()
                const result = await db.select(project(users, posts)).from(users).innerJoin(posts, eq(posts.userId, users.id))
                expect(rowsOf(result)).toHaveLength(4)
        })
})

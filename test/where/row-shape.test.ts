import { describe, it, expect } from 'vitest'
import { eq, gt, gte } from '../../src/index'
import { seedUsers, seedPosts } from '../_helpers'
import { scoresOf } from './helpers'
describe('a predicate preserves the row shape it filters', () => {
        // where only chooses which rows survive; it never reshapes them.
        // A reader who filters down to a few rows still expects each
        // survivor to carry its full, untouched set of columns.
        it('isolating one user by id returns that row with all three columns intact', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(eq(users.id, 2))
                expect(rows[0]).toMatchObject({ id: 2, name: 22, score: 20 })
        })
        it('every survivor of a multi-row score filter keeps its own original score', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(gte(users.score, 20))
                const ordered = [...rows].sort((a, b) => a.id - b.id)
                expect(scoresOf(ordered)).toEqual([20, 30])
        })
        it('a filtered post row keeps its userId and score untouched alongside its id', async () => {
                const { db, posts } = await seedPosts()
                const rows = await db.select().from(posts).where(eq(posts.id, 3))
                expect(rows[0]).toMatchObject({ id: 3, userId: 2, score: 9 })
        })
        it('filtering changes which rows return but leaves every returned row the same shape', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(gt(users.score, 15))
                const keySets = rows.map((r) => Object.keys(r).sort().join(','))
                expect(keySets).toEqual(['id,name,score', 'id,name,score'])
        })
        it('a filtered read and an unfiltered read agree on the columns each shared row carries', async () => {
                const { db, users } = await seedUsers()
                const all = await db.select().from(users)
                const filtered = await db.select().from(users).where(eq(users.id, 1))
                const allRowOne = all.find((r: { id: number }) => r.id === 1)
                expect(filtered[0]).toEqual(allRowOne)
        })
})

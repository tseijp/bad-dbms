import { describe, it, expect } from 'vitest'
import { freshUsers, freshPosts, freshEvents } from './_fixtures'

describe('column omission', () => {
        // Correct spec: a column declared .default(0) and omitted on
        // insert takes its declared default; score is default(0).
        it('omitting a default(0) column writes the declared default', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11 })
                const rows = await db.select().from(users)
                expect(rows[0].score).toBe(0)
        })

        // Correct spec: a column with no default and no value is NULL.
        it('omitting posts.score (default 0) reads back the default 0', async () => {
                const { db, posts } = freshPosts()
                await db.insert(posts).values({ id: 1, userId: 9 })
                const rows = await db.select().from(posts)
                expect(rows[0].score).toBe(0)
        })

        // Correct spec: omitting a notNull column with no default is a
        // constraint violation; the insert must reject.
        it('omitting a notNull column rejects the insert', async () => {
                const { db, users } = freshUsers()
                await expect(db.insert(users).values({ id: 1, score: 10 })).rejects.toBeDefined()
        })

        // posts.user_id has no default and no notNull; omitting it
        // yields NULL per spec.
        it('omitting posts.userId reads back null', async () => {
                const { db, posts } = freshPosts()
                await db.insert(posts).values({ id: 1, score: 5 })
                const rows = await db.select().from(posts)
                expect(rows[0].userId).toBeNull()
        })

        it('omitting a no-default events column reads back null', async () => {
                const { db, events } = freshEvents()
                await db.insert(events).values({ id: 1, kind: 3 })
                const rows = await db.select().from(events)
                expect(rows[0].v).toBeNull()
        })

        it('omitting two no-default events columns reads both back null', async () => {
                const { db, events } = freshEvents()
                await db.insert(events).values({ id: 1 })
                const rows = await db.select().from(events)
                expect(rows[0]).toMatchObject({ id: 1, kind: null, v: null })
        })

        it.each([
                ['kind omitted', { id: 1, v: 9 }, 'kind'],
                ['v omitted', { id: 1, kind: 9 }, 'v'],
        ])('events %s reads the omitted column back as null', async (_label, row, key) => {
                const { db, events } = freshEvents()
                await db.insert(events).values(row)
                const rows = await db.select().from(events)
                expect(rows[0][key]).toBeNull()
        })

        it('a present column is unaffected when a sibling is omitted', async () => {
                const { db, events } = freshEvents()
                await db.insert(events).values({ id: 1, kind: 7 })
                const rows = await db.select().from(events)
                expect(rows[0].kind).toBe(7)
        })
})

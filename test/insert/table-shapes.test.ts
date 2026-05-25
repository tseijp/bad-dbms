import { describe, it, expect } from 'vitest'
import { USERS_SEED, POSTS_SEED, EVENTS_SEED } from '../_helpers'
import { freshPosts, freshEvents, freshNodes, freshTarget, freshUsers } from './_fixtures'
describe('other table shapes', () => {
        // The run-result expectations follow the Drizzle / SQLite insert
        // contract: a `changes` count, not bad-dbms's invented { rowCount }.
        it('an events insert resolves to a run-result with a changes count of 5', async () => {
                const { db, events } = freshEvents()
                const r = await db.insert(events).values(EVENTS_SEED)
                expect(r).toMatchObject({ changes: 5 })
        })
        it('events table reads EVENTS_SEED rows back in order', async () => {
                const { db, events } = freshEvents()
                await db.insert(events).values(EVENTS_SEED)
                const rows = await db.select().from(events)
                expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5])
        })
        it('events row at index 2 deep-equals its literal', async () => {
                const { db, events } = freshEvents()
                await db.insert(events).values(EVENTS_SEED)
                const rows = await db.select().from(events)
                expect(rows[2]).toMatchObject({ id: 3, kind: 1, v: 300 })
        })
        it('a posts insert resolves to a run-result with a changes count of 4', async () => {
                const { db, posts } = freshPosts()
                const r = await db.insert(posts).values(POSTS_SEED)
                expect(r).toMatchObject({ changes: 4 })
        })
        it('posts row reads back its renamed user_id column', async () => {
                const { db, posts } = freshPosts()
                await db.insert(posts).values({ id: 1, userId: 5, score: 9 })
                const rows = await db.select().from(posts)
                expect(rows[0].userId).toBe(5)
        })
        it('nodes table accepts a self-reference shaped row', async () => {
                const { db, nodes } = freshNodes()
                await db.insert(nodes).values({ id: 2, parentId: 1 })
                const rows = await db.select().from(nodes)
                expect(rows[0].parentId).toBe(1)
        })
        it('nodes table accepts multiple rows with parent links', async () => {
                const { db, nodes } = freshNodes()
                await db.insert(nodes).values([
                        { id: 1, parentId: 0 },
                        { id: 2, parentId: 1 },
                        { id: 3, parentId: 1 },
                ])
                const rows = await db.select().from(nodes)
                expect(rows.length).toBe(3)
        })
        it.each([
                ['users', () => freshTarget(freshUsers, 'users'), USERS_SEED],
                ['posts', () => freshTarget(freshPosts, 'posts'), POSTS_SEED],
                ['events', () => freshTarget(freshEvents, 'events'), EVENTS_SEED],
        ] as const)('a %s seed insert resolves to a changes count matching the seed length', async (_label, build, seed) => {
                const { db, t } = build()
                const r = await db.insert(t).values(seed as Record<string, number>[])
                expect(r).toMatchObject({ changes: seed.length })
        })
        it.each([
                ['users', () => freshTarget(freshUsers, 'users'), USERS_SEED],
                ['posts', () => freshTarget(freshPosts, 'posts'), POSTS_SEED],
                ['events', () => freshTarget(freshEvents, 'events'), EVENTS_SEED],
        ] as const)('%s seed insert reads back the full seed length', async (_label, build, seed) => {
                const { db, t } = build()
                await db.insert(t).values(seed as Record<string, number>[])
                const rows = await db.select().from(t)
                expect(rows.length).toBe(seed.length)
        })
})

import { describe, it, expect } from 'vitest'
import { freshUsers } from './_fixtures'

describe('sequential insert batches', () => {
        it('two sequential single-row inserts accumulate to two rows', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([{ id: 1, name: 11, score: 10 }])
                await db.insert(users).values([{ id: 2, name: 22, score: 20 }])
                const rows = await db.select().from(users)
                expect(rows.length).toBe(2)
        })

        it('two sequential single-row inserts keep ids 1,2 in order', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([{ id: 1, name: 11, score: 10 }])
                await db.insert(users).values([{ id: 2, name: 22, score: 20 }])
                const rows = await db.select().from(users)
                expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2])
        })

        it('three separate single-row inserts accumulate to three rows', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                await db.insert(users).values({ id: 2, name: 22, score: 20 })
                await db.insert(users).values({ id: 3, name: 33, score: 30 })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(3)
        })

        it.each([[2], [3], [4], [6]])('%i sequential batches of one row each accumulate', async (batches) => {
                const { db, users } = freshUsers()
                const ids = Array.from({ length: batches }, (_v, i) => i + 1)
                for (const id of ids) await db.insert(users).values({ id, name: id, score: id })
                const rows = await db.select().from(users)
                expect(rows.length).toBe(batches)
        })

        it.each([[[2, 3]], [[1, 4]], [[5, 5]], [[3, 7]]])('two batches sized %j accumulate to their sum', async (sizes) => {
                const { db, users } = freshUsers()
                let offset = 0
                for (const size of sizes) {
                        const rows = Array.from({ length: size }, (_v, i) => ({ id: offset + i + 1, name: 1, score: 0 }))
                        await db.insert(users).values(rows)
                        offset += size
                }
                const back = await db.select().from(users)
                expect(back.length).toBe(sizes[0] + sizes[1])
        })

        it('second batch appends after the first batch in insertion order', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([
                        { id: 1, name: 1, score: 0 },
                        { id: 2, name: 2, score: 0 },
                ])
                await db.insert(users).values([
                        { id: 3, name: 3, score: 0 },
                        { id: 4, name: 4, score: 0 },
                ])
                const rows = await db.select().from(users)
                expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2, 3, 4])
        })

        // A later batch cannot quietly re-use a key the first batch already
        // claimed: the primary-key constraint spans the whole table, not just
        // one statement.
        it('a second batch that re-uses a key from the first batch rejects', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([{ id: 1, name: 1, score: 0 }])
                await expect(db.insert(users).values([{ id: 1, name: 2, score: 0 }])).rejects.toBeDefined()
        })

        it('a rejected second batch leaves the first batch intact', async () => {
                const { db, users } = freshUsers()
                await db.insert(users).values([{ id: 1, name: 1, score: 0 }])
                await db
                        .insert(users)
                        .values([{ id: 1, name: 2, score: 0 }])
                        .catch(() => undefined)
                const rows = await db.select().from(users)
                expect(rows).toEqual([{ id: 1, name: 1, score: 0 }])
        })
})

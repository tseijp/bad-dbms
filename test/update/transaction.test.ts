import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { seeded, rowById, scoresInIdOrder } from './_fixtures'

describe('an update inside a transaction', () => {
        // A reader mutating rows within a transaction expects the
        // writes to land and to be visible afterward.
        it('a transactional update sets the targeted rows score', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.update(t).set({ score: 50 }).where(eq(t.id, 1))
                })
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)?.score).toBe(50)
        })

        it('two updates in one transaction both land on their rows', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.update(t).set({ score: 1 }).where(eq(t.id, 1))
                        await tx.update(t).set({ score: 2 }).where(eq(t.id, 2))
                })
                const rows = await db.select().from(t)
                expect([rowById(rows, 1)?.score, rowById(rows, 2)?.score]).toEqual([1, 2])
        })

        it('an expression update inside a transaction computes per row', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.update(t).set({ score: t.score.add(1) })
                })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([11, 21, 31])
        })

        it('a transactional update is visible to a read inside the same transaction', async () => {
                const { db, t } = await seeded()
                const seen = await db.transaction(async (tx) => {
                        await tx.update(t).set({ score: 77 }).where(eq(t.id, 3))
                        return tx.select().from(t).where(eq(t.id, 3))
                })
                expect((seen as { score: number }[])[0].score).toBe(77)
        })

        it('a per-row tick update sets every visited rows score to zero', async () => {
                const { db, t } = await seeded()
                const runner = db.transaction((tx, c) => {
                        return tx.update(t).set({ score: 0 }).where(eq(t.id, (c as { id: number }).id))
                })
                await runner.run()
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([0, 0, 0])
        })

        it('a per-row tick can raise each row by a constant amount', async () => {
                const { db, t } = await seeded()
                const runner = db.transaction((tx, c) => {
                        return tx.update(t).set({ score: t.score.add(5) }).where(eq(t.id, (c as { id: number }).id))
                })
                await runner.run()
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([15, 25, 35])
        })

        // A transaction is atomic: an update made inside a transaction whose
        // body then throws must be rolled back, leaving the row at its
        // pre-transaction value. This is the defining ACID guarantee.
        it('an update is rolled back when its transaction body throws after it', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.update(t).set({ score: 999 }).where(eq(t.id, 1))
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                // the throw must undo the update: id 1 keeps its seed score of 10
                expect(rowById(rows, 1)?.score).toBe(10)
        })

        it('an earlier update is undone when a later statement in the transaction throws', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.update(t).set({ score: 0 }).where(eq(t.id, 1))
                        await tx.update(t).set({ score: 0 }).where(eq(t.id, 2))
                        throw new Error('abort after two updates')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                // both updates must be undone: the seed scores stand
                expect(scoresInIdOrder(rows)).toEqual([10, 20, 30])
        })

        it('a whole-table expression update is rolled back when the transaction throws', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.update(t).set({ score: t.score.add(100) })
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([10, 20, 30])
        })
})

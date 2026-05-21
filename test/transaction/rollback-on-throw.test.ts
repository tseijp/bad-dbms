import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { fresh, seeded, idsOf, amountsById } from './_fixtures'

describe('a transaction rolls back every write when its body throws', () => {
        // The defining ACID guarantee: if the callback throws, the
        // transaction aborts and none of its writes survive. The table
        // must read back exactly as it was before the transaction.
        it('an insert is undone when the transaction body throws after it', async () => {
                const { db, t } = fresh()
                const attempt = db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 1, amount: 100 })
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                expect(rows).toEqual([])
        })

        it('an update is undone when the transaction body throws after it', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.update(t).set({ amount: 999 }).where(eq(t.id, 1))
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                expect(amountsById(rows)).toEqual([10, 20, 30])
        })

        it('a delete is undone when the transaction body throws after it', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.delete(t).where(eq(t.id, 2))
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })

        it('an earlier write is rolled back when a later statement throws', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 9, amount: 90 })
                        await tx.update(t).set({ amount: 0 }).where(eq(t.id, 1))
                        throw new Error('abort after two writes')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                // both the insert of id 9 and the update of id 1 must be undone
                expect(amountsById(rows)).toEqual([10, 20, 30])
        })

        it('a transaction that throws leaves the row count unchanged', async () => {
                const { db, t } = await seeded()
                const attempt = db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 4, amount: 40 })
                        await tx.insert(t).values({ id: 5, amount: 50 })
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                expect(rows.length).toBe(3)
        })

        it('the error thrown inside the callback propagates out of the transaction', async () => {
                const { db } = fresh()
                const attempt = db.transaction(async () => {
                        throw new Error('the original error')
                })
                await expect(attempt).rejects.toThrow('the original error')
        })

        it('a committed transaction after a rolled-back one starts from the pre-abort state', async () => {
                const { db, t } = await seeded()
                await db
                        .transaction(async (tx) => {
                                await tx.insert(t).values({ id: 9, amount: 90 })
                                throw new Error('abort')
                        })
                        .catch(() => undefined)
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 4, amount: 40 })
                })
                const rows = await db.select().from(t)
                // id 9 was rolled back; only the seed plus id 4 remain
                expect(idsOf(rows)).toEqual([1, 2, 3, 4])
        })
})

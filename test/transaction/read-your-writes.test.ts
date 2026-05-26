import { describe, it, expect } from 'vitest'
import { eq, count } from '../../src/index'
import { idsOf } from '../_helpers'
import { seeded, amountsById, freshLedger } from './helpers'
describe('a read inside a transaction sees that transactions own writes', () => {
        // Read-your-writes: a select issued inside the transaction
        // observes every write made earlier in the same callback.
        it('a count read after an insert in the same transaction includes the new rows', async () => {
                const { db, t } = freshLedger()
                const seen = await db.transaction(async (tx) => {
                        await tx.insert(t).values([
                                { id: 1, amount: 10 },
                                { id: 2, amount: 20 },
                        ])
                        return tx.select({ n: count() }).from(t)
                })
                expect(seen).toEqual([{ n: 2 }])
        })
        it('a select after an update in the same transaction sees the updated value', async () => {
                const { db, t } = await seeded()
                const seen = await db.transaction(async (tx) => {
                        await tx.update(t).set({ amount: 77 }).where(eq(t.id, 2))
                        return tx.select().from(t).where(eq(t.id, 2))
                })
                expect(seen[0].amount).toBe(77)
        })
        it('a select after a delete in the same transaction no longer sees the row', async () => {
                const { db, t } = await seeded()
                const seen = await db.transaction(async (tx) => {
                        await tx.delete(t).where(eq(t.id, 1))
                        return tx.select().from(t)
                })
                expect(idsOf(seen)).toEqual([2, 3])
        })
        it('two writes then a read in one transaction reflect both writes', async () => {
                const { db, t } = await seeded()
                const seen = await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 4, amount: 40 })
                        await tx.update(t).set({ amount: 0 }).where(eq(t.id, 3))
                        return tx.select().from(t)
                })
                expect(amountsById(seen)).toEqual([10, 20, 0, 40])
        })
        it('a write inside a rolled-back transaction is not visible to reads after it', async () => {
                const { db, t } = await seeded()
                await db
                        .transaction(async (tx) => {
                                await tx.insert(t).values({ id: 9, amount: 90 })
                                throw new Error('abort')
                        })
                        .catch(() => undefined)
                const rows = await db.select().from(t).where(eq(t.id, 9))
                expect(rows).toEqual([])
        })
})

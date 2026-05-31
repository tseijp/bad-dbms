import { describe, it, expect } from 'vitest'
import { eq, gt } from '../../src/index'
import { seeded, amountsById, freshLedger } from './helpers'
describe('an explicit tx.rollback aborts the transaction', () => {
        // Drizzle exposes tx.rollback(): calling it aborts the
        // transaction so none of its writes survive, without the
        // caller having to throw a bespoke error.
        it('calling tx.rollback undoes an insert made earlier in the body', async () => {
                const { db, t } = freshLedger()
                await db
                        .transaction(async (tx) => {
                                await tx.insert(t).values({ id: 1, amount: 100 })
                                tx.rollback()
                        })
                        .catch(() => undefined)
                const rows = await db.select().from(t)
                expect(rows).toEqual([])
        })
        it('calling tx.rollback undoes an update made earlier in the body', async () => {
                const { db, t } = await seeded()
                await db
                        .transaction(async (tx) => {
                                await tx.update(t).set({ amount: 0 }).where(eq(t.id, 1))
                                tx.rollback()
                        })
                        .catch(() => undefined)
                const rows = await db.select().from(t)
                expect(amountsById(rows)).toEqual([10, 20, 30])
        })
        it('a transaction that rolls back explicitly leaves the row count unchanged', async () => {
                const { db, t } = await seeded()
                await db
                        .transaction(async (tx) => {
                                await tx.delete(t).where(gt(t.id, 0))
                                tx.rollback()
                        })
                        .catch(() => undefined)
                const rows = await db.select().from(t)
                expect(rows.length).toBe(3)
        })
})

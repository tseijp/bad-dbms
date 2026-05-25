import { describe, it, expect } from 'vitest'
import { idsOf } from '../_helpers'
import { freshLedger } from './helpers'
describe('transactions compose on one connection and isolate across connections', () => {
        // Sequential transactions on the same connection build on each
        // other's committed state; transactions on separate
        // connections never see each other's writes.
        it('two sequential transactions on one connection accumulate their writes', async () => {
                const { db, t } = freshLedger()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values([
                                { id: 1, amount: 10 },
                                { id: 2, amount: 20 },
                        ])
                })
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 3, amount: 30 })
                })
                const rows = await db.select().from(t)
                expect(idsOf(rows as { id: number }[])).toEqual([1, 2, 3])
        })
        it('a second transaction sees the committed writes of the first', async () => {
                const { db, t } = freshLedger()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 1, amount: 10 })
                })
                const seenInside = await db.transaction(async (tx) => {
                        return tx.select().from(t)
                })
                expect(idsOf(seenInside as { id: number }[])).toEqual([1])
        })
        it('two separate connections do not see each others transactional writes', async () => {
                const a = freshLedger()
                const b = freshLedger()
                await a.db.transaction(async (tx) => {
                        await tx.insert(a.t).values({ id: 1, amount: 10 })
                })
                await b.db.transaction(async (tx) => {
                        await tx.insert(b.t).values({ id: 2, amount: 20 })
                })
                const rowsB = await b.db.select().from(b.t)
                expect(idsOf(rowsB)).toEqual([2])
        })
        it('a rolled-back transaction leaves the connection usable for the next one', async () => {
                const { db, t } = freshLedger()
                await db
                        .transaction(async (tx) => {
                                await tx.insert(t).values({ id: 1, amount: 10 })
                                throw new Error('abort')
                        })
                        .catch(() => undefined)
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 2, amount: 20 })
                })
                const rows = await db.select().from(t)
                // only the committed second transaction's row survives
                expect(idsOf(rows as { id: number }[])).toEqual([2])
        })
})

import { describe, it, expect } from 'vitest'
import { idsOf } from '../_helpers'
import { freshLedger } from './helpers'
describe('nested transactions and savepoints', () => {
        // Drizzle supports nesting: tx.transaction(...) opens a
        // savepoint. An inner rollback undoes only the inner work; the
        // outer transaction keeps going and commits the rest.
        it('an inner transaction commits as part of the outer transaction', async () => {
                const { db, t } = freshLedger()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 1, amount: 10 })
                        await tx.transaction(async (inner) => {
                                await inner.insert(t).values({ id: 2, amount: 20 })
                        })
                })
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 2])
        })
        it('an inner rollback undoes only the inner write, not the outer one', async () => {
                const { db, t } = freshLedger()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 1, amount: 10 })
                        await tx
                                .transaction(async (inner) => {
                                        await inner.insert(t).values({ id: 2, amount: 20 })
                                        throw new Error('inner abort')
                                })
                                .catch(() => undefined)
                })
                const rows = await db.select().from(t)
                // the outer insert of id 1 commits; the inner insert of id 2 is rolled back
                expect(idsOf(rows)).toEqual([1])
        })
        it('an outer rollback undoes the inner committed write as well', async () => {
                const { db, t } = freshLedger()
                await db
                        .transaction(async (tx) => {
                                await tx.transaction(async (inner) => {
                                        await inner.insert(t).values({ id: 1, amount: 10 })
                                })
                                throw new Error('outer abort')
                        })
                        .catch(() => undefined)
                const rows = await db.select().from(t)
                // the outer abort discards everything, including the inner savepoint
                expect(rows).toEqual([])
        })
        it('a nested transaction returns its callbacks value to the outer body', async () => {
                const { db } = freshLedger()
                const result = await db.transaction(async (tx) => {
                        return tx.transaction(async () => 7)
                })
                expect(result).toBe(7)
        })
})

import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { fresh, seeded, idsOf, amountsById } from './_fixtures'

describe('a committed transaction applies all of its writes', () => {
        // The plain callback variant runs a block of writes; once the
        // callback resolves, every write is durably visible.
        it('a single insert inside a transaction is visible afterward', async () => {
                const { db, t } = fresh()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 1, amount: 100 })
                })
                const rows = await db.select().from(t)
                expect(rows).toEqual([{ id: 1, amount: 100 }])
        })

        it.each([[1], [2], [3], [5], [10]])('a transaction inserting %i rows leaves exactly %i rows committed', async (n) => {
                const { db, t } = fresh()
                const rows = Array.from({ length: n }, (_v, i) => ({ id: i + 1, amount: i }))
                await db.transaction(async (tx) => {
                        await tx.insert(t).values(rows)
                })
                const back = await db.select().from(t)
                expect(back.length).toBe(n)
        })

        it('several DML statements in one transaction all take effect together', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.insert(t).values({ id: 4, amount: 40 })
                        await tx.update(t).set({ amount: 0 }).where(eq(t.id, 1))
                        await tx.delete(t).where(eq(t.id, 2))
                })
                const rows = await db.select().from(t)
                expect(amountsById(rows)).toEqual([0, 30, 40])
        })

        it('an update inside a transaction commits the new value', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.update(t).set({ amount: 99 }).where(eq(t.id, 2))
                })
                const rows = await db.select().from(t)
                expect(rows.find((r: { id: number }) => r.id === 2)?.amount).toBe(99)
        })

        it('a delete inside a transaction commits the removal', async () => {
                const { db, t } = await seeded()
                await db.transaction(async (tx) => {
                        await tx.delete(t).where(eq(t.id, 3))
                })
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 2])
        })

        it('the tx handle exposes select, insert, update and delete as callable methods', async () => {
                const { db } = fresh()
                const kinds = await db.transaction(async (tx) => {
                        return [typeof tx.select, typeof tx.insert, typeof tx.update, typeof tx.delete]
                })
                expect(kinds).toEqual(['function', 'function', 'function', 'function'])
        })

        it('a transaction callback runs exactly once', async () => {
                const { db } = fresh()
                let runs = 0
                await db.transaction(async () => {
                        runs += 1
                })
                expect(runs).toBe(1)
        })
})

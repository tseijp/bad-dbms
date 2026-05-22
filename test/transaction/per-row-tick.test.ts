import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { fresh, seeded, idsOf, amountsById } from './_fixtures'
describe('the per-row tick variant iterates every primary-table row', () => {
        // The two-argument transaction builds a tick: its callback
        // runs once per row of the primary table, with c bound to the
        // current row. run(ctx) drives the iteration and returns ctx.
        it('a tick over a three-row table invokes its callback three times', async () => {
                const { db } = await seeded()
                let visits = 0
                const runner = db.transaction((_tx, _c) => {
                        visits += 1
                })
                await runner.run({})
                expect(visits).toBe(3)
        })
        it('the current-row proxy exposes each rows id in turn', async () => {
                const { db } = await seeded()
                const seen: number[] = []
                const runner = db.transaction((_tx, c) => {
                        seen.push((c as { id: number }).id)
                })
                await runner.run({})
                expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3])
        })
        it('a tick updating each visited row by its own id zeroes the whole table', async () => {
                const { db, t } = await seeded()
                const runner = db.transaction((tx, c) => {
                        return tx
                                .update(t)
                                .set({ amount: 0 })
                                .where(eq(t.id, (c as { id: number }).id))
                })
                await runner.run({})
                const rows = await db.select().from(t)
                expect(amountsById(rows)).toEqual([0, 0, 0])
        })
        it('a tick that deletes rows over a cutoff leaves only the rows below it', async () => {
                const { db, t } = await seeded()
                const runner = db.transaction((tx, c) => {
                        const cur = c as { id: number; amount: number }
                        if (cur.amount > 15) return tx.delete(t).where(eq(t.id, cur.id))
                        return undefined
                })
                await runner.run({})
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1])
        })
        it('a tick over an empty table never invokes its callback', async () => {
                const { db } = fresh()
                let visits = 0
                const runner = db.transaction((_tx, _c) => {
                        visits += 1
                })
                await runner.run({})
                expect(visits).toBe(0)
        })
        it('run returns the very context object it was given', async () => {
                const { db } = await seeded()
                const ctx = { marker: 1 }
                const runner = db.transaction((_tx, _c) => undefined)
                const returned = await runner.run(ctx)
                expect(returned).toBe(ctx)
        })
        it.each([
                [1, 3],
                [2, 6],
                [3, 9],
        ])('calling run %i times invokes the callback %i times in total', async (runs, expected) => {
                const { db } = await seeded()
                let visits = 0
                const runner = db.transaction((_tx, _c) => {
                        visits += 1
                })
                for (let i = 0; i < runs; i++) await runner.run({})
                expect(visits).toBe(expected)
        })
        it('a tick reading the current rows amount can accumulate a total into the context', async () => {
                const { db } = await seeded()
                const ctx = { total: 0 }
                const runner = db.transaction((_tx, c) => {
                        ctx.total += (c as { amount: number }).amount
                })
                await runner.run(ctx)
                expect(ctx.total).toBe(60)
        })
})

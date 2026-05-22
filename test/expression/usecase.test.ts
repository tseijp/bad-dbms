import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { column, seedUsers, intTable } from './helpers'
// expression feature: end-to-end usecase scenarios. Each `it` is a small
// story — a library user derives a value from an expression, mutates the
// data, and re-derives to confirm the expression tracks the new state.
// Expected values follow the correct Drizzle / SQL semantics.
describe('expression usecase scenarios', () => {
        it('models a discount: scale every score down then floor it to an int', async () => {
                const { db, t } = await intTable([19, 25, 33, 47])
                const rows = await db.select({ discounted: t.v.mul(8).div(10).toInt() }).from(t)
                expect(column(rows, 'discounted')).toEqual([15, 20, 26, 37])
        })
        it('flags rows over a threshold and re-reads the flag after an update', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ hot: users.score.gt(15) }).from(users)
                await db.update(users).set({ score: 5 }).where(eq(users.id, 3))
                const after = await db.select({ hot: users.score.gt(15) }).from(users)
                expect([column(before, 'hot'), column(after, 'hot')]).toEqual([
                        [false, true, true],
                        [false, true, false],
                ])
        })
        it('computes a per-row bonus from two columns and projects it beside the id', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, bonus: users.score.add(users.id).mul(2) }).from(users)
                expect(rows).toEqual([
                        { id: 1, bonus: 22 },
                        { id: 2, bonus: 44 },
                        { id: 3, bonus: 66 },
                ])
        })
        it('builds a parity flag from a modulo expression', async () => {
                const { db, t } = await intTable([1, 2, 3, 4, 5, 6])
                const rows = await db.select({ even: t.v.mod(2).eq(0) }).from(t)
                expect(column(rows, 'even')).toEqual([false, true, false, true, false, true])
        })
        it('seeds, derives a normalized score, then inserts a row and re-derives', async () => {
                const { db, t } = await intTable([100, 200, 300])
                const before = await db.select({ norm: t.v.div(100) }).from(t)
                await db.insert(t).values({ id: 4, v: 400 })
                const after = await db.select({ norm: t.v.div(100) }).from(t)
                expect([column(before, 'norm'), column(after, 'norm')]).toEqual([
                        [1, 2, 3],
                        [1, 2, 3, 4],
                ])
        })
        it('derives a clamped-style flag and re-checks it after lowering a value', async () => {
                const { db, t } = await intTable([5, 50, 500])
                const before = await db.select({ big: t.v.gte(50) }).from(t)
                await db.update(t).set({ v: 1 }).where(eq(t.id, 2))
                const after = await db.select({ big: t.v.gte(50) }).from(t)
                expect([column(before, 'big'), column(after, 'big')]).toEqual([
                        [false, true, true],
                        [false, false, true],
                ])
        })
        it('reads a derived running scale before and after deleting a row', async () => {
                const { db, t } = await intTable([10, 20, 30])
                const before = await db.select({ scaled: t.v.mul(3) }).from(t)
                await db.delete(t).where(eq(t.id, 2))
                const after = await db.select({ scaled: t.v.mul(3) }).from(t)
                expect([column(before, 'scaled'), column(after, 'scaled')]).toEqual([
                        [30, 60, 90],
                        [30, 90],
                ])
        })
})

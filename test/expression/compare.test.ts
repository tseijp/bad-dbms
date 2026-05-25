import { describe, it, expect } from 'vitest'
import { column, seedUsers, intTable, pairTable } from './helpers'
// expression feature: comparison operators yield a boolean per row. A
// comparison method evaluated in a projection produces true / false, never
// 1 / 0. Expected values follow the correct Drizzle / SQL semantics.
describe('comparison operators yield a boolean per row', () => {
        it.each([
                ['eq', 'eq', 20, [false, true, false]],
                ['ne', 'ne', 20, [true, false, true]],
                ['gt', 'gt', 20, [false, false, true]],
                ['gte', 'gte', 20, [false, true, true]],
                ['lt', 'lt', 20, [true, false, false]],
                ['lte', 'lte', 20, [true, true, false]],
        ])('evaluates score.%s(20) to a boolean sequence', async (_label, method, arg, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score[method](arg) }).from(users)
                expect(column(rows, 'x')).toEqual(expected)
        })
        it('returns strict booleans, not 1 and 0, from a comparison', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.gt(15) }).from(users)
                expect(column(rows, 'x')).toEqual([false, true, true])
        })
        it('compares two expressions and yields a boolean', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.eq(users.id.mul(10)) }).from(users)
                expect(column(rows, 'x')).toEqual([true, true, true])
        })
        it.each([
                ['eq across columns', 'eq', [false, true, false]],
                ['ne across columns', 'ne', [true, false, true]],
                ['gt across columns', 'gt', [true, false, false]],
                ['lt across columns', 'lt', [false, false, true]],
        ])('evaluates a.%s(b) to a boolean per row', async (_label, method, expected) => {
                const { db, t } = await pairTable([
                        [9, 5],
                        [7, 7],
                        [2, 8],
                ])
                const rows = await db.select({ x: t.a[method](t.b) }).from(t)
                expect(column(rows, 'x')).toEqual(expected)
        })
        it('compares an arithmetic expression against a literal', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(5).gt(20) }).from(users)
                expect(column(rows, 'x')).toEqual([false, true, true])
        })
        it('evaluates a comparison over a signed dataset', async () => {
                const { db, t } = await intTable([-5, 0, 5])
                const rows = await db.select({ x: t.v.gte(0) }).from(t)
                expect(column(rows, 'x')).toEqual([false, true, true])
        })
        it('evaluates equality against zero', async () => {
                const { db, t } = await intTable([0, 1, 0, -1])
                const rows = await db.select({ x: t.v.eq(0) }).from(t)
                expect(column(rows, 'x')).toEqual([true, false, true, false])
        })
})

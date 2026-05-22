import { describe, it, expect } from 'vitest'
import { column, seedUsers, intTable } from './helpers'
// expression feature: a column doubles as an SQL expression. Chaining .add,
// .eq, .toFloat, etc. builds an expression tree; placed in a select projection
// it is evaluated once per row. This feature owns the *evaluated value* of
// those chains. Every expected value is computed from the correct Drizzle /
// SQL evaluation semantics, never from observing bad-dbms behaviour.
describe('arithmetic operators evaluate per row', () => {
        it('adds a literal to every score', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(5) }).from(users)
                expect(column(rows, 'x')).toEqual([15, 25, 35])
        })
        it('subtracts a literal from every score', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.sub(5) }).from(users)
                expect(column(rows, 'x')).toEqual([5, 15, 25])
        })
        it('multiplies every score by a literal', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mul(2) }).from(users)
                expect(column(rows, 'x')).toEqual([20, 40, 60])
        })
        it('divides every score by a literal', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.div(10) }).from(users)
                expect(column(rows, 'x')).toEqual([1, 2, 3])
        })
        it('takes every score modulo a literal', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mod(7) }).from(users)
                expect(column(rows, 'x')).toEqual([3, 6, 2])
        })
        it('adds zero as an identity', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(0) }).from(users)
                expect(column(rows, 'x')).toEqual([10, 20, 30])
        })
        it('multiplies by one as an identity', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mul(1) }).from(users)
                expect(column(rows, 'x')).toEqual([10, 20, 30])
        })
        it('multiplies by zero to collapse every value', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mul(0) }).from(users)
                expect(column(rows, 'x')).toEqual([0, 0, 0])
        })
        // dense matrix: method and literal argument paired with the exact
        // per-row sequence over scores 10 / 20 / 30.
        it.each([
                ['add', 'add', 1, [11, 21, 31]],
                ['add negative', 'add', -5, [5, 15, 25]],
                ['add large', 'add', 1000, [1010, 1020, 1030]],
                ['sub', 'sub', 3, [7, 17, 27]],
                ['sub into negative', 'sub', 15, [-5, 5, 15]],
                ['mul', 'mul', 3, [30, 60, 90]],
                ['mul by negative', 'mul', -1, [-10, -20, -30]],
                ['div exact', 'div', 5, [2, 4, 6]],
                ['mod', 'mod', 3, [1, 2, 0]],
                ['mod by large', 'mod', 100, [10, 20, 30]],
        ])('evaluates score.%s over the user seed', async (_label, method, arg, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: (users.score as any)[method](arg) }).from(users)
                expect(column(rows, 'x')).toEqual(expected)
        })
        // arithmetic over a table of negative and zero values.
        it.each([
                ['add', 'add', 10, [0, 10, 5, 110]],
                ['sub', 'sub', 10, [-20, -10, -15, 90]],
                ['mul', 'mul', 2, [-20, 0, -10, 200]],
        ])('evaluates v.%s over a signed dataset', async (_label, method, arg, expected) => {
                const { db, t } = await intTable([-10, 0, -5, 100])
                const rows = await db.select({ x: (t.v as any)[method](arg) }).from(t)
                expect(column(rows, 'x')).toEqual(expected)
        })
        it('evaluates integer division truncating toward zero', async () => {
                const { db, t } = await intTable([7, 9, 14, 1])
                const rows = await db.select({ x: t.v.div(3) }).from(t)
                expect(column(rows, 'x')).toEqual([2, 3, 4, 0])
        })
        it('evaluates modulo with negative operands following SQL sign rules', async () => {
                const { db, t } = await intTable([-7, -9, 7])
                const rows = await db.select({ x: t.v.mod(3) }).from(t)
                expect(column(rows, 'x')).toEqual([-1, 0, 1])
        })
})

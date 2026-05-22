import { describe, it, expect } from 'vitest'
import { column, seedUsers, pairTable } from './helpers'
// expression feature: arithmetic between two columns of one row. Both operands
// are read from the same row. Expected values follow the correct Drizzle / SQL
// evaluation semantics.
describe('arithmetic between two columns of one row', () => {
        it('adds two columns of the same row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(users.id) }).from(users)
                expect(column(rows, 'x')).toEqual([11, 22, 33])
        })
        it('subtracts one column from another in the same row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.sub(users.id) }).from(users)
                expect(column(rows, 'x')).toEqual([9, 18, 27])
        })
        it('multiplies two columns of the same row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mul(users.id) }).from(users)
                expect(column(rows, 'x')).toEqual([10, 40, 90])
        })
        it('divides one column by another in the same row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.div(users.id) }).from(users)
                expect(column(rows, 'x')).toEqual([10, 10, 10])
        })
        it.each([
                ['add', 'add', [4, 12, 9]],
                ['sub', 'sub', [-2, 8, 3]],
                ['mul', 'mul', [3, 20, 18]],
        ])('evaluates a.%s(b) over a column pair', async (_label, method, expected) => {
                const { db, t } = await pairTable([
                        [1, 3],
                        [10, 2],
                        [6, 3],
                ])
                const rows = await db.select({ x: (t.a as any)[method](t.b) }).from(t)
                expect(column(rows, 'x')).toEqual(expected)
        })
        it('takes one column modulo another in the same row', async () => {
                const { db, t } = await pairTable([
                        [10, 3],
                        [20, 7],
                        [9, 9],
                ])
                const rows = await db.select({ x: t.a.mod(t.b) }).from(t)
                expect(column(rows, 'x')).toEqual([1, 6, 0])
        })
        it('reads two columns into one expression after a where filter', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select({ x: users.score.add(users.id) })
                        .from(users)
                        .where(users.id.gt(1))
                expect(column(rows, 'x')).toEqual([22, 33])
        })
})

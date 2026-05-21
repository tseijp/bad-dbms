import { describe, it, expect } from 'vitest'
import { column, seedUsers, intTable, floatTable } from './helpers'

// expression feature: type conversion methods. toFloat keeps the numeric
// value; toInt truncates toward zero; toBool maps zero to false and every
// non-zero value to true. Expected values follow the correct Drizzle / SQL
// semantics.

describe('type conversion methods', () => {
        it('keeps the numeric value through toFloat', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.toFloat() }).from(users)
                expect(column(rows, 'x')).toEqual([10, 20, 30])
        })

        it('truncates a float toward zero with toInt', async () => {
                const { db, t } = await floatTable([1.9, 2.1, 3.5])
                const rows = await db.select({ x: t.v.toInt() }).from(t)
                expect(column(rows, 'x')).toEqual([1, 2, 3])
        })

        it('truncates negative floats toward zero with toInt', async () => {
                const { db, t } = await floatTable([-1.9, -2.1, -0.5])
                const rows = await db.select({ x: t.v.toInt() }).from(t)
                expect(column(rows, 'x')).toEqual([-1, -2, 0])
        })

        it('maps every non-zero value to true with toBool', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.toBool() }).from(users)
                expect(column(rows, 'x')).toEqual([true, true, true])
        })

        it('maps zero to false and non-zero to true with toBool', async () => {
                const { db, t } = await intTable([0, 1, 0, 5, -3])
                const rows = await db.select({ x: t.v.toBool() }).from(t)
                expect(column(rows, 'x')).toEqual([false, true, false, true, true])
        })

        it.each([
                ['positive integers', [1, 2, 3], [1, 2, 3]],
                ['with zero', [0, 5, 10], [0, 5, 10]],
                ['negatives', [-1, -2, -3], [-1, -2, -3]],
        ])('keeps %s unchanged through toFloat', async (_label, values, expected) => {
                const { db, t } = await intTable(values)
                const rows = await db.select({ x: t.v.toFloat() }).from(t)
                expect(column(rows, 'x')).toEqual(expected)
        })

        it.each([
                ['just above integers', [1.01, 2.99, 3.5], [1, 2, 3]],
                ['exact integers as float', [4.0, 5.0, 6.0], [4, 5, 6]],
                ['fractions below one', [0.1, 0.9, 0.5], [0, 0, 0]],
        ])('truncates %s toward zero with toInt', async (_label, values, expected) => {
                const { db, t } = await floatTable(values)
                const rows = await db.select({ x: t.v.toInt() }).from(t)
                expect(column(rows, 'x')).toEqual(expected)
        })

        it('produces a strict boolean array from toBool, not numbers', async () => {
                const { db, t } = await intTable([0, 2])
                const rows = await db.select({ x: t.v.toBool() }).from(t)
                expect(column(rows, 'x')).toEqual([false, true])
        })
})

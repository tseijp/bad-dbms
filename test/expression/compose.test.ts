import { describe, it, expect } from 'vitest'
import { column, seedUsers, intTable, floatTable } from './helpers'

// expression feature: an expression composing arithmetic with a conversion.
// Expected values follow the correct Drizzle / SQL semantics.

describe('expression composing arithmetic with conversion', () => {
        it('applies arithmetic then converts the result to float', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(users.id).toFloat() }).from(users)
                expect(column(rows, 'x')).toEqual([11, 22, 33])
        })

        it('converts to int after a float-producing division', async () => {
                const { db, t } = await intTable([10, 21, 35])
                const rows = await db.select({ x: t.v.div(10).toInt() }).from(t)
                expect(column(rows, 'x')).toEqual([1, 2, 3])
        })

        it('converts an arithmetic result to a boolean', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.sub(10).toBool() }).from(users)
                expect(column(rows, 'x')).toEqual([false, true, true])
        })

        it('chains a conversion then further arithmetic', async () => {
                const { db, t } = await floatTable([1.9, 2.1, 3.5])
                const rows = await db.select({ x: t.v.toInt().mul(10) }).from(t)
                expect(column(rows, 'x')).toEqual([10, 20, 30])
        })

        it.each([
                ['add then toFloat', (s: any) => s.add(100).toFloat(), [110, 120, 130]],
                ['mul then toFloat', (s: any) => s.mul(2).toFloat(), [20, 40, 60]],
                ['sub then toBool', (s: any) => s.sub(20).toBool(), [true, false, true]],
                ['div then toInt', (s: any) => s.div(20).toInt(), [0, 1, 1]],
        ])('evaluates the %s composition', async (_label, build, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: build(users.score) }).from(users)
                expect(column(rows, 'x')).toEqual(expected)
        })

        it('seeds, reads a raw column, then re-reads it through a conversion chain', async () => {
                const { db, users } = await seedUsers()
                const raw = await db.select({ x: users.score }).from(users)
                const converted = await db.select({ x: users.score.toFloat().mul(2) }).from(users)
                expect([column(raw, 'x'), column(converted, 'x')]).toEqual([
                        [10, 20, 30],
                        [20, 40, 60],
                ])
        })
})

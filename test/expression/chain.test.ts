import { describe, it, expect } from 'vitest'
import { column, seedUsers } from './helpers'

// expression feature: composed expression chains evaluate strictly
// left-to-right with no operator-precedence re-ordering. a.add(1).mul(2) is
// (a + 1) * 2. Expected values follow the correct Drizzle / SQL semantics.

describe('composed expression chains evaluate left-to-right', () => {
        it('applies add then mul in chain order', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(1).mul(2) }).from(users)
                expect(column(rows, 'x')).toEqual([22, 42, 62])
        })

        it('applies mul then add in chain order', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.mul(2).add(1) }).from(users)
                expect(column(rows, 'x')).toEqual([21, 41, 61])
        })

        it('evaluates a three-step chain mixing two columns and a literal', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.add(users.id).sub(5) }).from(users)
                expect(column(rows, 'x')).toEqual([6, 17, 28])
        })

        it('evaluates a divide-then-multiply chain across two columns', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: users.score.div(10).mul(users.id) }).from(users)
                expect(column(rows, 'x')).toEqual([1, 4, 9])
        })

        // dense matrix: a chain over score 10 / 20 / 30 evaluated strictly
        // left-to-right, with no operator-precedence re-ordering.
        it.each([
                ['add then sub', (s: any) => s.add(5).sub(3), [12, 22, 32]],
                ['sub then mul', (s: any) => s.sub(5).mul(2), [10, 30, 50]],
                ['mul then div', (s: any) => s.mul(3).div(2), [15, 30, 45]],
                ['add then mul then sub', (s: any) => s.add(2).mul(2).sub(4), [20, 40, 60]],
                ['div then add then mul', (s: any) => s.div(10).add(1).mul(3), [6, 9, 12]],
                ['mod then add', (s: any) => s.mod(7).add(100), [103, 106, 102]],
                ['mul then mod', (s: any) => s.mul(2).mod(7), [6, 5, 4]],
                ['four-step chain', (s: any) => s.add(1).mul(2).sub(2).div(2), [10, 20, 30]],
        ])('evaluates the %s chain left-to-right', async (_label, build, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ x: build(users.score) }).from(users)
                expect(column(rows, 'x')).toEqual(expected)
        })

        it('proves chaining order matters by comparing two orderings', async () => {
                const { db, users } = await seedUsers()
                const addFirst = await db.select({ x: users.score.add(1).mul(2) }).from(users)
                const mulFirst = await db.select({ x: users.score.mul(2).add(1) }).from(users)
                expect([column(addFirst, 'x'), column(mulFirst, 'x')]).toEqual([
                        [22, 42, 62],
                        [21, 41, 61],
                ])
        })

        it('keeps a long chain stable across a re-read of the same query', async () => {
                const { db, users } = await seedUsers()
                const first = await db.select({ x: users.score.add(5).mul(2).sub(10) }).from(users)
                const second = await db.select({ x: users.score.add(5).mul(2).sub(10) }).from(users)
                expect([column(first, 'x'), column(second, 'x')]).toEqual([
                        [20, 40, 60],
                        [20, 40, 60],
                ])
        })
})

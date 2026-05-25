import { describe, it, expect } from 'vitest'
import { keysOf, rowsOf, seedUsers, valuesOf } from '../_helpers'
// select rework: expression columns in a projection. A projected expression
// is evaluated once per row and the projection key holds the computed value.
// The select feature owns only that a projection CAN carry a computed valuesOf
// and that the result is keyed by the alias; the arithmetic itself is the
// expression feature's concern.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a projected expression valuesOf produces the computed value, keyed by the
//     projection alias — not undefined, not the raw valuesOf.
//   * a projection of only expression columns still returns one row per
//     stored row and keys each row by exactly the expression aliases.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.
describe('expression columns in a projection', () => {
        it('doubles every score through a multiply expression valuesOf', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ doubled: users.score.mul(2) }).from(users)
                expect(valuesOf(rows, 'doubled')).toEqual([20, 40, 60])
        })
        it('keys an expression projection by its alias', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ doubled: users.score.mul(2) }).from(users)
                expect(keysOf(rows)).toEqual(['doubled'])
        })
        it('produces a defined value for every expression-valuesOf row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ doubled: users.score.mul(2) }).from(users)
                expect(rowsOf(rows).every((r) => r.doubled !== undefined)).toBe(true)
        })
        // matrix: a single-expression projection over scores 10/20/30.
        it.each([
                ['add 5', (u: any) => ({ x: u.score.add(5) }), [15, 25, 35]],
                ['sub 5', (u: any) => ({ x: u.score.sub(5) }), [5, 15, 25]],
                ['mul 2', (u: any) => ({ x: u.score.mul(2) }), [20, 40, 60]],
                ['div 10', (u: any) => ({ x: u.score.div(10) }), [1, 2, 3]],
                ['mod 7', (u: any) => ({ x: u.score.mod(7) }), [3, 6, 2]],
        ])('evaluates the %s expression valuesOf', async (_label, project, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(valuesOf(rows, 'x')).toEqual(expected)
        })
        // matrix: expressions referencing two columns of the same row.
        it.each([
                ['score plus id', (u: any) => ({ x: u.score.add(u.id) }), [11, 22, 33]],
                ['score minus id', (u: any) => ({ x: u.score.sub(u.id) }), [9, 18, 27]],
                ['score times id', (u: any) => ({ x: u.score.mul(u.id) }), [10, 40, 90]],
                ['score over id', (u: any) => ({ x: u.score.div(u.id) }), [10, 10, 10]],
        ])('evaluates the two-valuesOf expression %s', async (_label, project, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(valuesOf(rows, 'x')).toEqual(expected)
        })
        // matrix: composed expression chains in a projection.
        it.each([
                ['add then mul', (u: any) => ({ x: u.score.add(1).mul(2) }), [22, 42, 62]],
                ['mul then add', (u: any) => ({ x: u.score.mul(2).add(1) }), [21, 41, 61]],
                ['div then mul', (u: any) => ({ x: u.score.div(10).mul(u.id) }), [1, 4, 9]],
                ['add col then sub', (u: any) => ({ x: u.score.add(u.id).sub(5) }), [6, 17, 28]],
        ])('evaluates the composed projection %s', async (_label, project, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(valuesOf(rows, 'x')).toEqual(expected)
        })
        it('mixes a plain valuesOf and an expression valuesOf in one projection', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, bonus: users.score.add(1) }).from(users)
                expect(rowsOf(rows)[0]).toEqual({ id: 1, bonus: 11 })
        })
        it('keys a mixed plain-and-expression projection by both aliases', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, bonus: users.score.add(1) }).from(users)
                expect(keysOf(rows)).toEqual(['bonus', 'id'])
        })
        it('keeps the row count unchanged when a projection is all expressions', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ d: users.score.mul(2) }).from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })
        it('projects two independent expression columns side by side', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ twice: users.score.mul(2), more: users.score.add(100) }).from(users)
                expect(rowsOf(rows)[0]).toEqual({ twice: 20, more: 110 })
        })
        it.each([
                [0, { twice: 20, more: 110 }],
                [1, { twice: 40, more: 120 }],
                [2, { twice: 60, more: 130 }],
        ])('reads row %i of a two-expression projection exactly', async (index, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ twice: users.score.mul(2), more: users.score.add(100) }).from(users)
                expect(rowsOf(rows)[index]).toEqual(expected)
        })
        it('lets a user read raw then derived scores across two queries', async () => {
                const { db, users } = await seedUsers()
                const raw = await db.select({ score: users.score }).from(users)
                const derived = await db.select({ score: users.score.mul(3) }).from(users)
                expect([valuesOf(raw, 'score'), valuesOf(derived, 'score')]).toEqual([
                        [10, 20, 30],
                        [30, 60, 90],
                ])
        })
        it('seeds, projects a derived valuesOf, updates a row, then re-derives', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ d: users.score.mul(2) }).from(users)
                await db.update(users).set({ score: 100 }).where(users.id.eq(2))
                const after = await db.select({ d: users.score.mul(2) }).from(users)
                expect([valuesOf(before, 'd'), valuesOf(after, 'd')]).toEqual([
                        [20, 40, 60],
                        [20, 200, 60],
                ])
        })
})

import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, ne, gt, gte, lt, lte } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from '../_helpers'
// A table with a nullable score: id 2 is inserted without a score, so its
// score is genuinely NULL. Used to attack comparison against NULL.
const seededNullableScore = async () => {
        const t = table('scores', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
        return { db, t: db.tables.t }
}
describe('comparison operators narrow a user list', () => {
        // A reader filtering a small user table by score: each operator
        // is the realistic way to express "users at / above / below a
        // cutoff", and the surviving id set is what the caller acts on.
        it.each([
                ['eq', eq, 20, [2]],
                ['ne', ne, 20, [1, 3]],
                ['gt', gt, 20, [3]],
                ['gte', gte, 20, [2, 3]],
                ['lt', lt, 20, [1]],
                ['lte', lte, 20, [1, 2]],
        ] as const)('%s against the score 20 keeps the documented ids', async (_label, op, arg, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(op(users.score, arg))
                expect(idsOf(rows)).toEqual(expected)
        })
        it('a cutoff above every score yields an empty result the caller can branch on', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(eq(users.score, 999))
                expect(rows).toEqual([])
        })
        it('a cutoff below every score passes the whole table through unchanged', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(gt(users.score, 0))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('a strict and a loose cutoff on the same boundary differ by the boundary row', async () => {
                const { db, users } = await seedUsers()
                const strict = await db.select().from(users).where(gt(users.score, 20))
                const loose = await db.select().from(users).where(gte(users.score, 20))
                expect([idsOf(strict), idsOf(loose)]).toEqual([[3], [2, 3]])
        })
        it('filtering then filtering the survivors again composes into a tighter set', async () => {
                const { db, users } = await seedUsers()
                const wide = await db.select().from(users).where(gte(users.score, 20))
                expect(idsOf(wide)).toEqual([2, 3])
                const tight = await db.select().from(users).where(gt(users.score, 20))
                expect(idsOf(tight)).toEqual([3])
        })
        it('eq and ne on the same argument partition the table into complementary sets', async () => {
                const { db, users } = await seedUsers()
                const matched = await db.select().from(users).where(eq(users.score, 20))
                const rest = await db.select().from(users).where(ne(users.score, 20))
                expect([idsOf(matched), idsOf(rest)]).toEqual([[2], [1, 3]])
        })
        it('lt and gte on the same boundary partition the table into complementary sets', async () => {
                const { db, users } = await seedUsers()
                const below = await db.select().from(users).where(lt(users.score, 20))
                const atOrAbove = await db.select().from(users).where(gte(users.score, 20))
                const union = idsOf([...below, ...atOrAbove])
                expect(union).toEqual([1, 2, 3])
        })
        it('an equality probe per id confirms each seeded score in turn', async () => {
                const { db, users } = await seedUsers()
                const one = await db.select().from(users).where(eq(users.score, 10))
                const two = await db.select().from(users).where(eq(users.score, 20))
                const three = await db.select().from(users).where(eq(users.score, 30))
                expect([idsOf(one), idsOf(two), idsOf(three)]).toEqual([[1], [2], [3]])
        })
        it('comparing a column to itself keeps every row (a tautological filter)', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(gte(users.score, users.score))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('a strict comparison of a column to itself drops every row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(gt(users.score, users.score))
                expect(rows).toEqual([])
        })
        // Every comparison against a NULL operand yields UNKNOWN in SQL, so
        // the null-valued row is excluded by all six operators — including
        // ne, which is the trap: NULL != 10 is unknown, not true.
        it.each([
                ['eq', eq, [1]],
                ['ne', ne, [3]],
                ['gt', gt, [3]],
                ['gte', gte, [1, 3]],
                ['lt', lt, []],
                ['lte', lte, [1]],
        ] as const)('%s against 10 excludes the null-scored row', async (_label, op, expected) => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(op(t.score, 10))
                // id 2 holds NULL: every operator must leave it out
                expect(idsOf(rows)).toEqual(expected)
        })
        it('a comparison whose argument is null matches no row at all', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(eq(t.score, null as unknown as number))
                // x = NULL is unknown for every x, even where x is itself NULL
                expect(rows).toEqual([])
        })
        it('a null score equals nothing, so an eq probe at zero leaves it out', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(eq(t.score, 0))
                // NULL is not 0; no row has score 0 here, so the result is empty
                expect(rows).toEqual([])
        })
})

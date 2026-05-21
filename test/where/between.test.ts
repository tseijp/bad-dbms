import { describe, it, expect } from 'vitest'
import { database, table, integer, gt, gte, lt, lte, and, between, notBetween } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from './_fixtures'

// A table with a nullable score: id 2 holds genuine NULL. Used to attack
// between / notBetween against a NULL operand.
const seededNullableScore = async () => {
        const t = table('ranged', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, score: 10 },
                { id: 2 },
                { id: 3, score: 30 },
        ])
        return { db, t: db.tables.t }
}

describe('between expresses an inclusive range filter', () => {
        // A reader paging a score range reaches for between(); the
        // endpoints are inclusive, which these scenarios make explicit.
        it('a range spanning two scores keeps both endpoint rows', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(between(users.score, 10, 20))
                expect(idsOf(rows)).toEqual([1, 2])
        })

        it('both endpoints of a between are inclusive, confirmed against open bounds', async () => {
                const { db, users } = await seedUsers()
                const closed = await db.select().from(users).where(between(users.score, 10, 30))
                const open = await db.select().from(users).where(and(gt(users.score, 10), lt(users.score, 30)))
                expect([idsOf(closed), idsOf(open)]).toEqual([[1, 2, 3], [2]])
        })

        it('a range straddling one score keeps only the middle row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(between(users.score, 15, 25))
                expect(idsOf(rows)).toEqual([2])
        })

        it('a range entirely above the data yields an empty result', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(between(users.score, 100, 200))
                expect(rows).toEqual([])
        })

        it('a degenerate range whose bounds coincide keeps exactly the rows at that value', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(between(users.score, 20, 20))
                expect(idsOf(rows)).toEqual([2])
        })

        it('a between matches an equivalent gte-and-lte and-clause', async () => {
                const { db, users } = await seedUsers()
                const ranged = await db.select().from(users).where(between(users.score, 10, 20))
                const composed = await db.select().from(users).where(and(gte(users.score, 10), lte(users.score, 20)))
                expect(idsOf(ranged)).toEqual(idsOf(composed))
        })

        it('narrowing a between to a tighter sub-range drops the now-excluded rows', async () => {
                const { db, users } = await seedUsers()
                const wide = await db.select().from(users).where(between(users.score, 10, 30))
                expect(idsOf(wide)).toEqual([1, 2, 3])
                const narrow = await db.select().from(users).where(between(users.score, 20, 30))
                expect(idsOf(narrow)).toEqual([2, 3])
        })

        it('a range below the data and a range above it both come back empty', async () => {
                const { db, users } = await seedUsers()
                const low = await db.select().from(users).where(between(users.score, 0, 5))
                const high = await db.select().from(users).where(between(users.score, 40, 50))
                expect([low, high]).toEqual([[], []])
        })

        it('notBetween keeps exactly the rows whose value lies outside the range', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(notBetween(users.score, 15, 25))
                // scores 10 and 30 fall outside [15,25]; score 20 falls inside
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('between and notBetween over the same range partition a fully-populated table', async () => {
                const { db, users } = await seedUsers()
                const inside = await db.select().from(users).where(between(users.score, 15, 25))
                const outside = await db.select().from(users).where(notBetween(users.score, 15, 25))
                expect(idsOf([...inside, ...outside])).toEqual([1, 2, 3])
        })

        // The scenarios below attack NULL: a between test on a NULL column
        // value is UNKNOWN, so the null row is dropped by between and by
        // notBetween alike.
        it('a between over a column drops the row whose value is null', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(between(t.score, 0, 100))
                // id 2 holds NULL: NULL BETWEEN 0 AND 100 is unknown -> excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('notBetween over a column also drops the null row, since UNKNOWN negates to UNKNOWN', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(notBetween(t.score, 100, 200))
                // ids 1 and 3 lie outside [100,200]; the NULL row 2 stays excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('between and notBetween do not partition a table that holds a null', async () => {
                const { db, t } = await seededNullableScore()
                const inside = await db.select().from(t).where(between(t.score, 0, 100))
                const outside = await db.select().from(t).where(notBetween(t.score, 0, 100))
                // the null row falls out of both; the union is not the whole table
                expect(idsOf([...inside, ...outside])).toEqual([1, 3])
        })
})

import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, gt, lt, and, or, not, isNull, isNotNull } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from '../_helpers'
// A table with a nullable score: id 2 holds genuine NULL. Used to attack the
// three-valued truth tables of and / or / not.
const seededNullableScore = async () => {
        const t = table('rows', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
        return { db, t: db.tables.t }
}
describe('logical combinators express compound filters', () => {
        // A reader needing "in a score band" writes an and() of two
        // bounds; needing "either of two ids" writes an or(). These are
        // the everyday shapes of a non-trivial where clause.
        it('an and of a lower and upper bound keeps only the in-band rows', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 5), lt(users.score, 25)))
                expect(idsOf(rows)).toEqual([1, 2])
        })
        it('an and whose two halves cannot both hold yields an empty result', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 5), lt(users.score, 5)))
                expect(rows).toEqual([])
        })
        it('an or of two id equalities collects exactly those two rows', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(or(eq(users.id, 1), eq(users.id, 3)))
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('an or with one always-true half passes the whole table through', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(or(gt(users.score, 999), gt(users.score, 0)))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('not of an id equality keeps every other row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(not(eq(users.id, 2)))
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('a nested and-of-or pins one row by id then confirms its score', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(and(eq(users.id, 1), or(eq(users.score, 10), eq(users.score, 99))))
                expect(idsOf(rows)).toEqual([1])
        })
        it('an and of three bounds steadily narrows toward a single row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 0), gt(users.score, 15), lt(users.score, 25)))
                expect(idsOf(rows)).toEqual([2])
        })
        it('an or of three id equalities re-collects the whole table', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(or(eq(users.id, 1), eq(users.id, 2), eq(users.id, 3)))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('not of an or is the complement of that or (De Morgan in practice)', async () => {
                const { db, users } = await seedUsers()
                const inSet = await db
                        .select()
                        .from(users)
                        .where(or(eq(users.id, 1), eq(users.id, 2)))
                const outSet = await db
                        .select()
                        .from(users)
                        .where(not(or(eq(users.id, 1), eq(users.id, 2))))
                expect([idsOf(inSet), idsOf(outSet)]).toEqual([[1, 2], [3]])
        })
        it('not of an and is the complement of that and', async () => {
                const { db, users } = await seedUsers()
                const band = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 5), lt(users.score, 25)))
                const outside = await db
                        .select()
                        .from(users)
                        .where(not(and(gt(users.score, 5), lt(users.score, 25))))
                expect([idsOf(band), idsOf(outside)]).toEqual([[1, 2], [3]])
        })
        it('a double negation returns the same rows as the bare predicate', async () => {
                const { db, users } = await seedUsers()
                const plain = await db.select().from(users).where(eq(users.id, 2))
                const doubled = await db
                        .select()
                        .from(users)
                        .where(not(not(eq(users.id, 2))))
                expect(idsOf(plain)).toEqual(idsOf(doubled))
        })
        it('and of a predicate with its own negation can match nothing', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(and(eq(users.id, 2), not(eq(users.id, 2))))
                expect(rows).toEqual([])
        })
        it('or of a predicate with its own negation matches everything', async () => {
                const { db, users } = await seedUsers()
                const rows = await db
                        .select()
                        .from(users)
                        .where(or(eq(users.id, 2), not(eq(users.id, 2))))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        // The combinators below attack SQL's three-valued truth tables: when
        // one operand is UNKNOWN (a comparison against a NULL column value),
        // and / or / not propagate UNKNOWN by the standard rules.
        it('UNKNOWN and TRUE is UNKNOWN, so the null row drops out of the and', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(and(gt(t.score, 5), gt(t.id, 0)))
                // id 2: gt(score,5) is unknown; unknown AND true = unknown -> excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('UNKNOWN or TRUE is TRUE, so a true half still admits the null row', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(or(gt(t.score, 5), gt(t.id, 0)))
                // id 2: gt(score,5) unknown, but gt(id,0) is true -> unknown OR true = true
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('UNKNOWN or FALSE is UNKNOWN, so a false half cannot rescue the null row', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(or(gt(t.score, 5), lt(t.id, 0)))
                // id 2: gt(score,5) unknown, lt(id,0) false -> unknown OR false = unknown
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('NOT of UNKNOWN is still UNKNOWN, so negating a null comparison drops the row', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(not(gt(t.score, 5)))
                // id 2: NOT(unknown) = unknown -> excluded; ids 1 and 3 fail gt -> NOT true
                expect(idsOf(rows)).toEqual([])
        })
        it('a comparison and its negation do not partition a table that holds a null', async () => {
                const { db, t } = await seededNullableScore()
                const pos = await db.select().from(t).where(gt(t.score, 15))
                const neg = await db
                        .select()
                        .from(t)
                        .where(not(gt(t.score, 15)))
                // the null row falls out of both: union is not the whole table
                expect(idsOf([...pos, ...neg])).toEqual([1, 3])
        })
        it('isNull is the only way to reclaim the row that all comparisons drop', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(or(gt(t.score, 5), isNull(t.score)))
                // gt catches 1 and 3; isNull reclaims 2 -> the whole table
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('an and of isNotNull with a cutoff keeps only the non-null rows over the cutoff', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db
                        .select()
                        .from(t)
                        .where(and(isNotNull(t.score), gt(t.score, 15)))
                expect(idsOf(rows)).toEqual([3])
        })
})

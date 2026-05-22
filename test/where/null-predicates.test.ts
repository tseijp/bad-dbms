import { describe, it, expect } from 'vitest'
import { database, table, integer, and, or, not, eq, ne, gt, gte, lt, isNull, isNotNull } from '../../src/index'
import { idsOf } from './_fixtures'
// Every expectation here is SQL three-valued logic, the Drizzle contract for
// NULL. bad-dbms is a numeric column store and is suspected of coercing a
// missing nullable column to 0; if so these tests fail honestly. They are
// written to the correct spec and are never weakened to match a 0-coercion.
// A table with a nullable column. Rows 2 and 4 are inserted without a score,
// so their score is genuinely NULL — not 0.
const seededNullable = async () => {
        const t = table('members', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }, { id: 4 }, { id: 5, score: 0 }])
        return { db, t: db.tables.t }
}
describe('NULL three-valued logic in a where predicate', () => {
        // A reader filtering a table with missing values expects SQL's
        // three-valued logic: NULL is neither equal to nor unequal to
        // anything, and only isNull / isNotNull test for it.
        it('isNull matches exactly the rows whose nullable column was never set', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(isNull(t.score))
                expect(idsOf(rows)).toEqual([2, 4])
        })
        it('isNotNull matches exactly the rows that carry a real value, including zero', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(isNotNull(t.score))
                expect(idsOf(rows)).toEqual([1, 3, 5])
        })
        it('a null-valued column is not equal to zero, so eq-zero spares the null rows', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(eq(t.score, 0))
                // only id 5 was explicitly set to 0; NULL never equals 0
                expect(idsOf(rows)).toEqual([5])
        })
        it('a null-valued column is not not-equal to zero either, since NULL comparisons are unknown', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(ne(t.score, 0))
                // ids 1 and 3 differ from 0; the NULL rows 2 and 4 are excluded, not included
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('a greater-than test against a column drops the rows whose value is null', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(gt(t.score, 5))
                // NULL > 5 is unknown; ids 2 and 4 must not survive
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('a less-than test against a column also drops the null rows', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).where(lt(t.score, 100))
                expect(idsOf(rows)).toEqual([1, 3, 5])
        })
        it('an equality between two columns is unknown when either side is null', async () => {
                const t2 = table('pairs', {
                        id: integer('id').primaryKey(),
                        a: integer('a'),
                        b: integer('b'),
                })
                const db = database({ t: t2 })
                await db.insert(db.tables.t).values([
                        { id: 1, a: 5, b: 5 },
                        { id: 2, a: 7 },
                        { id: 3, b: 9 },
                ])
                const rows = await db.select().from(db.tables.t).where(eq(db.tables.t.a, db.tables.t.b))
                // id 1 has a==b; ids 2 and 3 each have a NULL side -> unknown -> excluded
                expect(idsOf(rows)).toEqual([1])
        })
        it('isNull and isNotNull partition the table with no row in both and none in neither', async () => {
                const { db, t } = await seededNullable()
                const nulls = await db.select().from(t).where(isNull(t.score))
                const present = await db.select().from(t).where(isNotNull(t.score))
                expect(idsOf([...nulls, ...present])).toEqual([1, 2, 3, 4, 5])
        })
        it('not of isNull behaves like isNotNull under three-valued logic', async () => {
                const { db, t } = await seededNullable()
                const viaNot = await db
                        .select()
                        .from(t)
                        .where(not(isNull(t.score)))
                const viaIsNotNull = await db.select().from(t).where(isNotNull(t.score))
                expect(idsOf(viaNot)).toEqual(idsOf(viaIsNotNull))
        })
        it('an and of a null-valued comparison contributes unknown and drops the row', async () => {
                const { db, t } = await seededNullable()
                const rows = await db
                        .select()
                        .from(t)
                        .where(and(gte(t.score, 0), lt(t.score, 100)))
                // the NULL rows fail both halves as unknown
                expect(idsOf(rows)).toEqual([1, 3, 5])
        })
        it('an or with a true half still admits a row even when the other half is unknown', async () => {
                const { db, t } = await seededNullable()
                const rows = await db
                        .select()
                        .from(t)
                        .where(or(isNull(t.score), gt(t.score, 5)))
                // isNull catches 2 and 4; gt catches 1 and 3; id 5 (score 0) matches neither
                expect(idsOf(rows)).toEqual([1, 2, 3, 4])
        })
        it('guarding a cutoff with isNotNull removes exactly the null rows the cutoff already failed', async () => {
                const { db, t } = await seededNullable()
                const guarded = await db
                        .select()
                        .from(t)
                        .where(and(isNotNull(t.score), gt(t.score, 5)))
                const bare = await db.select().from(t).where(gt(t.score, 5))
                // both must agree: NULL rows are absent either way
                expect(idsOf(guarded)).toEqual(idsOf(bare))
        })
})

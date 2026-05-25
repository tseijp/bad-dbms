import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeNullable, seqOf } from './helpers'
// Every expectation here is the SQL / Drizzle contract for how ORDER BY
// places NULL values. In SQLite — the dialect Drizzle drives here — NULLs
// sort BEFORE all non-null values under ASC and AFTER them under DESC. A
// nullable column inserted without a value holds a genuine NULL, which is not
// the number 0 and must not sort as if it were. bad-dbms is a numeric column
// store suspected of coercing a missing value to 0; if so these tests fail
// honestly. They are written to the correct spec and never weakened.
// rows 2 and 4 are inserted without a score: their score is genuinely NULL.
const seededNullable = async () => {
        const { db, t } = fresh(makeNullable)
        await db.insert(t).values([{ id: 1, score: 30 }, { id: 2 }, { id: 3, score: 10 }, { id: 4 }, { id: 5, score: 20 }])
        return { db, t }
}
describe('orderBy places NULL values at a defined end', () => {
        // A reader sorting a column that has gaps expects the NULL rows to
        // collect at one end, by the SQL rule, not to be scattered as zeros.
        it('an ascending sort puts every NULL-scored row before the non-null rows', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).orderBy(asc(t.score))
                // SQLite ASC: NULLs first, then 10, 20, 30
                expect(seqOf(rows, 'id')).toEqual([2, 4, 3, 5, 1])
        })
        it('a descending sort puts every NULL-scored row after the non-null rows', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).orderBy(desc(t.score))
                // SQLite DESC: 30, 20, 10, then NULLs last
                expect(seqOf(rows, 'id')).toEqual([1, 5, 3, 2, 4])
        })
        it('the non-null scores still come back in ascending order around the NULLs', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).orderBy(asc(t.score))
                const nonNull = (seqOf(rows, 'score') as (number | null)[]).filter((s) => s != null)
                expect(nonNull).toEqual([10, 20, 30])
        })
        it('a NULL score reads back as null, never as the number zero', async () => {
                const { db, t } = await seededNullable()
                const rows = await db.select().from(t).orderBy(asc(t.score))
                // the first row under ASC is a NULL row; its score must be null
                expect((rows[0] as { score: number | null }).score).toBeNull()
        })
        it('sorting a column that is entirely NULL keeps every row and orders none', async () => {
                const { db, t } = fresh(makeNullable)
                await db.insert(t).values([{ id: 1 }, { id: 2 }, { id: 3 }])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                expect(rows.length).toBe(3)
        })
        it('a NULL sorts strictly before zero under an ascending sort', async () => {
                const { db, t } = fresh(makeNullable)
                await db.insert(t).values([{ id: 1, score: 0 }, { id: 2 }])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                // NULL precedes 0; the NULL row (id 2) must come first
                expect(seqOf(rows, 'id')).toEqual([2, 1])
        })
        it('a NULL sorts strictly after zero under a descending sort', async () => {
                const { db, t } = fresh(makeNullable)
                await db.insert(t).values([{ id: 1, score: 0 }, { id: 2 }])
                const rows = await db.select().from(t).orderBy(desc(t.score))
                // DESC: 0 first, NULL last
                expect(seqOf(rows, 'id')).toEqual([1, 2])
        })
        it('a NULL sorts before a negative score under an ascending sort', async () => {
                const { db, t } = fresh(makeNullable)
                await db.insert(t).values([{ id: 1, score: -100 }, { id: 2 }, { id: 3, score: -1 }])
                const rows = await db.select().from(t).orderBy(asc(t.score))
                // NULL precedes even the most negative value
                expect(seqOf(rows, 'id')).toEqual([2, 1, 3])
        })
})

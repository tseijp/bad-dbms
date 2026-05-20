import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, inArray, notInArray } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from './_fixtures'

// A table with a nullable column: ids 2 and 4 are inserted without a tag, so
// their tag is genuinely NULL — the spec-correct ground for set membership
// against NULL.
const seededNullableTag = async () => {
        const t = table('entries', {
                id: integer('id').primaryKey(),
                tag: integer('tag'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, tag: 10 },
                { id: 2 },
                { id: 3, tag: 30 },
                { id: 4 },
        ])
        return { db, t: db.tables.t }
}

describe('set membership filters by an explicit id list', () => {
        // A reader holding a list of ids from elsewhere filters with
        // inArray; notInArray expresses the complementary exclusion.
        it('inArray keeps exactly the listed ids', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, [1, 3]))
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('inArray with an empty list matches nothing', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, []))
                expect(rows).toEqual([])
        })

        it('notInArray keeps exactly the ids absent from the list', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(notInArray(users.id, [1, 3]))
                expect(idsOf(rows)).toEqual([2])
        })

        it('inArray with only unknown ids matches nothing', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, [99]))
                expect(rows).toEqual([])
        })

        it('inArray and notInArray on the same list partition the table', async () => {
                const { db, users } = await seedUsers()
                const inside = await db.select().from(users).where(inArray(users.id, [1, 3]))
                const outside = await db.select().from(users).where(notInArray(users.id, [1, 3]))
                expect(idsOf([...inside, ...outside])).toEqual([1, 2, 3])
        })

        it('inArray over every id passes the whole table through', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, [1, 2, 3]))
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })

        it('notInArray over every id matches nothing', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(notInArray(users.id, [1, 2, 3]))
                expect(rows).toEqual([])
        })

        it('inArray ignores duplicate and unknown entries in the list', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, [1, 1, 99, 3]))
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('inArray on the score column filters by a value list, not the key', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.score, [10, 30]))
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('a single-element inArray behaves like an equality filter', async () => {
                const { db, users } = await seedUsers()
                const viaList = await db.select().from(users).where(inArray(users.id, [2]))
                const viaEq = await db.select().from(users).where(eq(users.id, 2))
                expect(idsOf(viaList)).toEqual(idsOf(viaEq))
        })

        // The set-membership scenarios below attack SQL's NULL semantics for
        // IN / NOT IN against a column that genuinely holds NULL.
        it('a null-valued column is never IN a list, so inArray skips the null rows', async () => {
                const { db, t } = await seededNullableTag()
                const rows = await db.select().from(t).where(inArray(t.tag, [10, 30]))
                // ids 2 and 4 hold NULL; NULL IN (...) is unknown -> excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('a list that contains the matching values still excludes the null-tagged rows', async () => {
                const { db, t } = await seededNullableTag()
                const rows = await db.select().from(t).where(inArray(t.tag, [10, 30, 0]))
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('NOT IN against a null-valued column is unknown, so notInArray drops the null rows', async () => {
                const { db, t } = await seededNullableTag()
                const rows = await db.select().from(t).where(notInArray(t.tag, [99]))
                // ids 1 and 3 are not in [99]; the NULL rows 2 and 4 are unknown -> excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('inArray and notInArray over a null-bearing column do not partition the table', async () => {
                const { db, t } = await seededNullableTag()
                const inside = await db.select().from(t).where(inArray(t.tag, [10, 30]))
                const outside = await db.select().from(t).where(notInArray(t.tag, [10, 30]))
                // the NULL rows fall out of both sets, so the union is not the whole table
                expect(idsOf([...inside, ...outside])).toEqual([1, 3])
        })

        it('a list literal that itself contains a null never matches a plain value via inArray', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users).where(inArray(users.id, [1, null as unknown as number, 3]))
                // a NULL element of the list cannot make a row match; 1 and 3 still do
                expect(idsOf(rows)).toEqual([1, 3])
        })
})

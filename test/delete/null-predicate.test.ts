import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, isNull, isNotNull } from '../../src/index'
import { idsOf } from './_fixtures'
describe('deleting rows selected by a NULL predicate', () => {
        // A nullable column genuinely holds NULL where no value was
        // given. isNull / isNotNull must select on actual NULL, and a
        // delete driven by them removes exactly those rows.
        const seededNullable = async () => {
                const t = table('items', {
                        id: integer('id').primaryKey(),
                        tag: integer('tag'),
                })
                const db = database({ t })
                // ids 2 and 4 are inserted without a tag: their tag is NULL
                await db.insert(db.tables.t).values([{ id: 1, tag: 5 }, { id: 2 }, { id: 3, tag: 7 }, { id: 4 }])
                return { db, t: db.tables.t }
        }
        it('deleting rows whose nullable column is null removes exactly those rows', async () => {
                const { db, t } = await seededNullable()
                await db.delete(t).where(isNull(t.tag))
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('deleting rows whose nullable column is not null keeps the null rows', async () => {
                const { db, t } = await seededNullable()
                await db.delete(t).where(isNotNull(t.tag))
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([2, 4])
        })
        it('a null-valued column is not equal to zero, so an eq-zero delete spares it', async () => {
                const { db, t } = await seededNullable()
                await db.delete(t).where(eq(t.tag, 0))
                const rows = await db.select().from(t)
                // NULL never equals 0; no row should be removed
                expect(idsOf(rows)).toEqual([1, 2, 3, 4])
        })
})

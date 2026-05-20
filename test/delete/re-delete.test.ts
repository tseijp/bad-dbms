import { describe, it, expect } from 'vitest'
import { eq, inArray, sum } from '../../src/index'
import { seededBoard, idsOf } from './_fixtures'

describe('re-deleting and deleting beyond the matched set', () => {
        // Once a row is gone a second delete of the same predicate
        // matches nothing; an update of a removed row touches nothing.
        it('deleting the same row twice removes it once and then matches nothing', async () => {
                const { db, t } = await seededBoard()
                await db.delete(t).where(eq(t.id, 2))
                const second = await db.delete(t).where(eq(t.id, 2))
                expect(second).toMatchObject({ rowCount: 0 })
        })

        it('updating a row that was already deleted changes nothing', async () => {
                const { db, t } = await seededBoard()
                await db.delete(t).where(eq(t.id, 1))
                const result = await db.update(t).set({ score: 999 }).where(eq(t.id, 1))
                expect(result).toMatchObject({ rowCount: 0 })
        })

        it('a deleted row never reappears after unrelated writes to the table', async () => {
                const { db, t } = await seededBoard()
                await db.delete(t).where(eq(t.id, 2))
                await db.update(t).set({ score: 0 }).where(eq(t.id, 1))
                await db.insert(t).values({ id: 5, score: 50 })
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 3, 5])
        })

        it('an empty SUM over a fully deleted table is null, not zero', async () => {
                const { db, t } = await seededBoard()
                await db.delete(t)
                const result = (await db.select({ s: sum(t.score) }).from(t)) as { s: number | null }[]
                // SQL: SUM of no rows is NULL
                expect(result[0].s).toBeNull()
        })

        it('inArray drives a delete that removes exactly the listed ids', async () => {
                const { db, t } = await seededBoard()
                await db.delete(t).where(inArray(t.id, [1, 3]))
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([2])
        })
})

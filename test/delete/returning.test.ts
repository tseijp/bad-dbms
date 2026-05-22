import { describe, it, expect } from 'vitest'
import { eq, lt } from '../../src/index'
import { seededBoard, idsOf } from './_fixtures'
describe('delete with returning yields the removed rows', () => {
        // In Drizzle, delete(...).where(...).returning() resolves to
        // the array of rows that were deleted, each a full row object
        // — not a bare count. This is the documented contract.
        it('returning gives back the deleted row as a full object', async () => {
                const { db, t } = await seededBoard()
                const removed = (await db.delete(t).where(eq(t.id, 2)).returning()) as Record<string, number>[]
                expect(removed).toEqual([{ id: 2, score: 20 }])
        })
        it('returning a multi-row delete yields one object per removed row', async () => {
                const { db, t } = await seededBoard()
                const removed = (await db.delete(t).where(lt(t.score, 25)).returning()) as { id: number }[]
                expect(idsOf(removed)).toEqual([1, 2])
        })
        it('returning on a delete that matched nothing yields an empty array', async () => {
                const { db, t } = await seededBoard()
                const removed = (await db.delete(t).where(eq(t.id, 999)).returning()) as unknown[]
                expect(removed).toEqual([])
        })
        it('a returned removed row carries every column it had before deletion', async () => {
                const { db, t } = await seededBoard()
                const removed = (await db.delete(t).where(eq(t.id, 3)).returning()) as Record<string, number>[]
                expect(removed[0]).toMatchObject({ id: 3, score: 30 })
        })
        it('returning the rows of a full delete enumerates the whole table', async () => {
                const { db, t } = await seededBoard()
                const removed = (await db.delete(t).returning()) as { id: number }[]
                expect(idsOf(removed)).toEqual([1, 2, 3])
        })
})

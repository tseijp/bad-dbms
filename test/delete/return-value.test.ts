import { describe, it, expect } from 'vitest'
import { eq, gt, gte, lt } from '../../src/index'
import { makeBoard, seededBoard } from './helpers'
describe('the delete return value reports the rows removed', () => {
        // delete(...).where(...) without returning resolves to a
        // result describing how many rows changed. The count must
        // equal the genuine number of rows removed.
        it.each([
                ['one id', (t: ReturnType<typeof makeBoard>) => eq(t.id, 2), 1],
                ['a low-score range', (t: ReturnType<typeof makeBoard>) => lt(t.score, 25), 2],
                ['every row', (t: ReturnType<typeof makeBoard>) => gt(t.score, 0), 3],
                ['no row', (t: ReturnType<typeof makeBoard>) => eq(t.id, 999), 0],
        ])('deleting %s reports a rowCount of the rows removed', async (_label, pred, expected) => {
                const { db, t } = await seededBoard()
                const result = await db.delete(t).where(pred(t))
                expect(result).toMatchObject({ rowCount: expected })
        })
        it('a no-where delete reports every row as removed', async () => {
                const { db, t } = await seededBoard()
                const result = await db.delete(t)
                expect(result).toMatchObject({ rowCount: 3 })
        })
        it('the reported count equals the drop in the surviving row count', async () => {
                const { db, t } = await seededBoard()
                const before = await db.select().from(t)
                await db.delete(t).where(gte(t.score, 20))
                const after = await db.select().from(t)
                expect(before.length - after.length).toBe(2)
        })
})

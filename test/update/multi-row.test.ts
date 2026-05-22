import { describe, it, expect } from 'vitest'
import { gt, gte, lt } from '../../src/index'
import { makeBoard, seeded, scoresInIdOrder } from './_fixtures'
describe('an update can mutate many rows at once', () => {
        // A reader applying a bulk correction sets the same value into
        // every row a broad predicate matches.
        it('a predicate over the whole table rewrites every score to one value', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 7 }).where(gt(t.id, 0))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([7, 7, 7])
        })
        it('a range predicate rewrites only the rows inside the band', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 0 }).where(lt(t.score, 25))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([0, 0, 30])
        })
        it('a no-where update rewrites the entire table', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 50 })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([50, 50, 50])
        })
        it.each([
                ['lt 15 hits one row', (t: ReturnType<typeof makeBoard>) => lt(t.score, 15), [9, 20, 30]],
                ['lt 25 hits two rows', (t: ReturnType<typeof makeBoard>) => lt(t.score, 25), [9, 9, 30]],
                ['gte 20 hits two rows', (t: ReturnType<typeof makeBoard>) => gte(t.score, 20), [10, 9, 9]],
                ['gt 0 hits all rows', (t: ReturnType<typeof makeBoard>) => gt(t.score, 0), [9, 9, 9]],
        ])('bulk-setting score to 9 where %s rewrites exactly the matched rows', async (_label, pred, expected) => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 9 }).where(pred(t))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual(expected)
        })
})

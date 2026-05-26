import { describe, it, expect } from 'vitest'
import { eq, gt, gte, lt } from '../../src/index'
import { makeBoard, freshBoard, seeded } from './helpers'
// The expectations here are derived from the Drizzle / SQLite update contract.
// In Drizzle over the SQLite driver, an update without returning() resolves to
// a run-result object carrying a `changes` count of how many rows the
// statement modified — a single object, never an array of { updated: n }.
// bad-dbms returns its own [{ updated: n }] shape; written to the Drizzle
// contract, these tests fail honestly and are never weakened to that shape.
describe('an update resolves to a run-result carrying a changes count', () => {
        // A reader checks the result of an update to learn how many rows the
        // statement modified, reading the `changes` field of the result.
        it.each([
                ['one id', (t: ReturnType<typeof makeBoard>) => eq(t.id, 2), 1],
                ['two ids by range', (t: ReturnType<typeof makeBoard>) => lt(t.score, 25), 2],
                ['every row', (t: ReturnType<typeof makeBoard>) => gt(t.score, 0), 3],
                ['no row', (t: ReturnType<typeof makeBoard>) => eq(t.id, 999), 0],
        ])('updating %s reports a changes count of the modified rows', async (_label, pred, expected) => {
                const { db, t } = await seeded()
                const result = await db.update(t).set({ score: 1 }).where(pred(t))
                expect(result).toMatchObject({ changes: expected })
        })
        it('an update resolves to a single result object, not an array', async () => {
                const { db, t } = await seeded()
                const result = await db.update(t).set({ score: 1 }).where(eq(t.id, 2))
                expect(Array.isArray(result)).toBe(false)
        })
        it('an update with no where clause reports every row in its changes count', async () => {
                const { db, t } = await seeded()
                const result = await db.update(t).set({ score: 0 })
                expect(result).toMatchObject({ changes: 3 })
        })
        it('updating an empty table reports a changes count of zero', async () => {
                const { db, t } = freshBoard()
                const result = await db.update(t).set({ score: 1 }).where(gt(t.id, 0))
                expect(result).toMatchObject({ changes: 0 })
        })
        it('the changes count matches the rows that actually carry the new value', async () => {
                const { db, t } = await seeded()
                const result = await db.update(t).set({ score: 77 }).where(gte(t.score, 20))
                const rows = await db.select().from(t)
                const carrying = rows.filter((r: { score: number | null }) => r.score === 77)
                expect(result.changes).toBe(carrying.length)
        })
})
describe('update with returning yields the updated rows', () => {
        // Drizzle's update(...).set(...).where(...).returning() resolves to
        // the array of rows as they are after the update — full row objects,
        // not a count.
        it('returning gives back the updated row with its new value', async () => {
                const { db, t } = await seeded()
                const updated = await db.update(t).set({ score: 99 }).where(eq(t.id, 2)).returning()
                expect(updated).toEqual([{ id: 2, name: 200, score: 99 }])
        })
        it('returning a multi-row update yields one object per modified row', async () => {
                const { db, t } = await seeded()
                const updated = await db.update(t).set({ score: 0 }).where(lt(t.score, 25)).returning()
                expect(updated.map((r) => r.id).sort()).toEqual([1, 2])
        })
        it('returning on an update that matched nothing yields an empty array', async () => {
                const { db, t } = await seeded()
                const updated = await db.update(t).set({ score: 0 }).where(eq(t.id, 999)).returning()
                expect(updated).toEqual([])
        })
        it('a returned row reflects the post-update value, not the old one', async () => {
                const { db, t } = await seeded()
                const updated = await db.update(t).set({ score: 1 }).where(eq(t.id, 3)).returning()
                expect(updated[0].score).toBe(1)
        })
})

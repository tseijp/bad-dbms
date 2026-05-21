import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { seeded, rowById, scoresInIdOrder } from './_fixtures'

describe('a literal set writes a fixed value into matched rows', () => {
        // A reader correcting one row's score writes a literal value
        // under an id predicate; the matched row takes the new value.
        it.each([
                ['id 1', 1, 99],
                ['id 2', 2, 99],
                ['id 3', 3, 99],
        ])('setting %s score to a literal stores that literal', async (_label, id, value) => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: value }).where(eq(t.id, id))
                const rows = await db.select().from(t)
                expect(rowById(rows, id)?.score).toBe(value)
        })

        it.each([[0], [1], [7], [50], [999], [123456]])('a literal score of %i is written verbatim into the matched row', async (value) => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: value }).where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect(rowById(rows, 2)?.score).toBe(value)
        })

        it('setting a score to zero overwrites the old non-zero value with zero', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 0 }).where(eq(t.id, 1))
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)?.score).toBe(0)
        })

        it('correcting a row then reading it back shows the corrected value', async () => {
                const { db, t } = await seeded()
                const before = await db.select().from(t)
                expect(rowById(before, 3)?.score).toBe(30)
                await db.update(t).set({ score: 35 }).where(eq(t.id, 3))
                const after = await db.select().from(t)
                expect(rowById(after, 3)?.score).toBe(35)
        })

        it('updating with a predicate that matches no row leaves every score unchanged', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 0 }).where(eq(t.id, 999))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([10, 20, 30])
        })

        it('a literal set never changes the number of rows in the table', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 1 }).where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect(rows.length).toBe(3)
        })
})

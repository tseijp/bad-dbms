import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, gte } from '../../src/index'
import { makeBoard, seeded, scoresInIdOrder } from './_fixtures'
// A table with a nullable score: id 2 holds genuine NULL. Used to attack what
// an expression setter computes when it touches a NULL column.
const seededNullableScore = async () => {
        const t = table('partialscore', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
        return { db, t: db.tables.t }
}
describe('an expression setter is evaluated per row', () => {
        // A reader awarding a relative bonus sets a column to an
        // expression of the row's own values; each row computes its
        // own new value.
        it('adding one to every score raises each row by its own starting point', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: t.score.add(1) })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([11, 21, 31])
        })
        it('doubling the score of one row leaves the others at their original values', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ score: t.score.mul(2) })
                        .where(eq(t.id, 3))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([10, 20, 60])
        })
        it('an expression mixing two columns of a row computes from that row alone', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: t.score.sub(t.id) })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([9, 18, 27])
        })
        it.each([
                ['add 5', (t: ReturnType<typeof makeBoard>) => t.score.add(5), [15, 25, 35]],
                ['sub 5', (t: ReturnType<typeof makeBoard>) => t.score.sub(5), [5, 15, 25]],
                ['mul 3', (t: ReturnType<typeof makeBoard>) => t.score.mul(3), [30, 60, 90]],
                ['div 10', (t: ReturnType<typeof makeBoard>) => t.score.div(10), [1, 2, 3]],
        ])('a whole-table expression setter of %s recomputes every score', async (_label, build, expected) => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: build(t) })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual(expected)
        })
        it('a chained expression applies the steps left to right per row', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: t.score.add(1).mul(2) })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([22, 42, 62])
        })
        it('an expression setter under a predicate computes only for the matched rows', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ score: t.score.add(100) })
                        .where(gte(t.score, 20))
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([10, 120, 130])
        })
        // An expression that touches a NULL column produces NULL in SQL — the
        // arithmetic does not treat the missing value as zero.
        it('adding a constant to a null column writes null back, not the constant', async () => {
                const { db, t } = await seededNullableScore()
                await db.update(t).set({ score: t.score.add(5) })
                const rows = (await db.select().from(t)) as { id: number; score: number | null }[]
                // id 2 was NULL: NULL + 5 = NULL, so it must read back null, not 5
                expect(rows.find((r) => r.id === 2)?.score).toBeNull()
        })
        it('the non-null rows of a null-touching expression update still compute correctly', async () => {
                const { db, t } = await seededNullableScore()
                await db.update(t).set({ score: t.score.add(5) })
                const rows = (await db.select().from(t)) as { id: number; score: number | null }[]
                expect([rows.find((r) => r.id === 1)?.score, rows.find((r) => r.id === 3)?.score]).toEqual([15, 35])
        })
        it('multiplying a null column by zero still yields null, not zero', async () => {
                const { db, t } = await seededNullableScore()
                await db.update(t).set({ score: t.score.mul(0) })
                const rows = (await db.select().from(t)) as { id: number; score: number | null }[]
                expect(rows.find((r) => r.id === 2)?.score).toBeNull()
        })
})

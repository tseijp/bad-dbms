import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { seeded, rowById } from './helpers'
describe('a multi-column set mutates several columns at once', () => {
        // A reader rewriting a whole record passes several columns in
        // one set call; all of them change together.
        it('setting name and score together writes both new values into the row', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ name: 111, score: 222 }).where(eq(t.id, 1))
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)).toMatchObject({ id: 1, name: 111, score: 222 })
        })
        it('a multi-column set leaves the other rows untouched on both columns', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ name: 999, score: 999 }).where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)).toMatchObject({ name: 100, score: 10 })
        })
        it('a multi-column set can mix a literal column and an expression column', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ name: 500, score: t.score.add(1) })
                        .where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect(rowById(rows, 2)).toMatchObject({ id: 2, name: 500, score: 21 })
        })
        it('two expression columns in one set each compute from the same row', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ name: t.name.add(1), score: t.score.add(1) })
                        .where(eq(t.id, 3))
                const rows = await db.select().from(t)
                expect(rowById(rows, 3)).toMatchObject({ id: 3, name: 301, score: 31 })
        })
        it('a whole-table multi-column set rewrites both columns of every row', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ name: 0, score: 0 })
                const rows = await db.select().from(t)
                const allZero = rows.every((r: { name: number | null; score: number | null }) => r.name === 0 && r.score === 0)
                expect(allZero).toBe(true)
        })
})

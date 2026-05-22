import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { seeded, rowById } from './_fixtures'
describe('repeated updates accumulate on the same row', () => {
        // A reader applying several corrections in turn expects each
        // to build on the row's current value, not the original seed.
        it('adding one to a row three times in a row raises its score by three', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ score: t.score.add(1) })
                        .where(eq(t.id, 1))
                await db
                        .update(t)
                        .set({ score: t.score.add(1) })
                        .where(eq(t.id, 1))
                await db
                        .update(t)
                        .set({ score: t.score.add(1) })
                        .where(eq(t.id, 1))
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)?.score).toBe(13)
        })
        it('an add then a matching subtract returns the row to its starting score', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ score: t.score.add(5) })
                        .where(eq(t.id, 2))
                await db
                        .update(t)
                        .set({ score: t.score.sub(5) })
                        .where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect(rowById(rows, 2)?.score).toBe(20)
        })
        it('a literal set followed by an expression update builds on the literal', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 100 }).where(eq(t.id, 3))
                await db
                        .update(t)
                        .set({ score: t.score.add(1) })
                        .where(eq(t.id, 3))
                const rows = await db.select().from(t)
                expect(rowById(rows, 3)?.score).toBe(101)
        })
        it.each([
                [1, 11],
                [2, 12],
                [4, 14],
                [8, 18],
        ])('applying add-one %i times leaves the row at the documented score', async (times, expected) => {
                const { db, t } = await seeded()
                for (let i = 0; i < times; i++) {
                        await db
                                .update(t)
                                .set({ score: t.score.add(1) })
                                .where(eq(t.id, 1))
                }
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)?.score).toBe(expected)
        })
        it('updating two different rows in turn keeps each rows changes separate', async () => {
                const { db, t } = await seeded()
                await db
                        .update(t)
                        .set({ score: t.score.add(1) })
                        .where(eq(t.id, 1))
                await db
                        .update(t)
                        .set({ score: t.score.add(2) })
                        .where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect([rowById(rows, 1)?.score, rowById(rows, 2)?.score]).toEqual([11, 22])
        })
})

import { describe, it, expect } from 'vitest'
import { eq, gt, gte, lt, and } from '../../src/index'
import { seeded, scoresInIdOrder } from './_fixtures'

describe('an update is visible to later reads', () => {
        // A reader mutating a row then querying it back, by predicate
        // or range, sees the mutation reflected.
        it('a row pushed above a threshold is then found by a greater-than predicate', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 999 }).where(eq(t.id, 2))
                const rows = await db.select().from(t).where(gt(t.score, 100))
                expect(rows.map((r: { id: number }) => r.id)).toEqual([2])
        })

        it('a row dropped below a threshold falls out of a greater-than predicate', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 1 }).where(eq(t.id, 3))
                const rows = await db.select().from(t).where(gt(t.score, 25))
                expect(rows).toEqual([])
        })

        it('an update that changes the key column moves the row under its new id', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ id: 9 }).where(eq(t.id, 1))
                const rows = await db.select().from(t).where(eq(t.id, 9))
                expect(rows[0]).toMatchObject({ id: 9, name: 100, score: 10 })
        })

        it('a whole-table bump is visible row by row on a follow-up read', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: t.score.add(100) })
                const rows = await db.select().from(t)
                expect(scoresInIdOrder(rows)).toEqual([110, 120, 130])
        })

        it('two reads bracketing an update show the before and after values', async () => {
                const { db, t } = await seeded()
                const before = await db.select().from(t).where(eq(t.id, 2))
                await db.update(t).set({ score: 0 }).where(eq(t.id, 2))
                const after = await db.select().from(t).where(eq(t.id, 2))
                expect([before[0].score, after[0].score]).toEqual([20, 0])
        })

        it('a row updated to a band edge is then caught by a range predicate', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 22 }).where(eq(t.id, 1))
                const rows = await db.select().from(t).where(and(gte(t.score, 20), lt(t.score, 25)))
                expect(rows.map((r: { id: number }) => r.id).sort()).toEqual([1, 2])
        })
})

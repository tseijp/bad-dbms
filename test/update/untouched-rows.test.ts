import { describe, it, expect } from 'vitest'
import { eq, ne, lt } from '../../src/index'
import { seeded, rowById } from './_fixtures'

describe('an update leaves non-matching rows untouched', () => {
        // A reader fixing one row trusts that the rows the predicate
        // skipped keep their original values exactly.
        it('updating one row by id leaves the other two scores at their seed values', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 99 }).where(eq(t.id, 2))
                const rows = await db.select().from(t)
                expect([rowById(rows, 1)?.score, rowById(rows, 3)?.score]).toEqual([10, 30])
        })

        it('a single-row update leaves the skipped rows whole, name and score intact', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 0 }).where(eq(t.id, 1))
                const rows = await db.select().from(t)
                expect(rowById(rows, 2)).toMatchObject({ id: 2, name: 200, score: 20 })
        })

        it('updating the low half by predicate leaves the high half untouched', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 5 }).where(lt(t.score, 25))
                const rows = await db.select().from(t)
                expect(rowById(rows, 3)?.score).toBe(30)
        })

        it('the row matched by a not-equal predicate stays put while the rest move', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 7 }).where(ne(t.id, 2))
                const rows = await db.select().from(t)
                expect(rowById(rows, 2)?.score).toBe(20)
        })

        it('an update touching one column leaves the other column of the same row alone', async () => {
                const { db, t } = await seeded()
                await db.update(t).set({ score: 88 }).where(eq(t.id, 1))
                const rows = await db.select().from(t)
                expect(rowById(rows, 1)?.name).toBe(100)
        })
})

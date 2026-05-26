import { describe, it, expect } from 'vitest'
import { eq, ne, gt, and, between } from '../../src/index'
import { idsOf } from '../_helpers'
import { seededBoard } from './helpers'
describe('a delete inside a transaction', () => {
        // A delete within a transaction lands and is visible after it,
        // and a failing transaction body rolls the delete back.
        it('a transactional delete removes the targeted row', async () => {
                const { db, t } = await seededBoard()
                await db.transaction(async (tx) => {
                        await tx.delete(t).where(eq(t.id, 1))
                })
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([2, 3])
        })
        it('a delete is rolled back when its transaction body throws', async () => {
                const { db, t } = await seededBoard()
                const attempt = db.transaction(async (tx) => {
                        await tx.delete(t).where(eq(t.id, 2))
                        throw new Error('abort')
                })
                await attempt.catch(() => undefined)
                const rows = await db.select().from(t)
                // the throw must undo the delete: every row should remain
                expect(idsOf(rows)).toEqual([1, 2, 3])
        })
        it('a per-row tick deletes every visited row whose score clears a cutoff', async () => {
                const { db, t } = await seededBoard()
                const runner = db.transaction((tx, c) => {
                        const cur = c
                        return tx.delete(t).where(and(eq(t.id, cur.id), gt(t.score, 15)))
                })
                await runner.run()
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1])
        })
        it('a transactional delete is visible to a read inside the same transaction', async () => {
                const { db, t } = await seededBoard()
                const seen = await db.transaction(async (tx) => {
                        await tx.delete(t).where(ne(t.id, 2))
                        return tx.select().from(t)
                })
                expect(idsOf(seen)).toEqual([2])
        })
        it('a between-driven delete inside a transaction removes the matched band', async () => {
                const { db, t } = await seededBoard()
                await db.transaction(async (tx) => {
                        await tx.delete(t).where(between(t.score, 10, 20))
                })
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([3])
        })
})

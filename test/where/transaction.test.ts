import { describe, it, expect } from 'vitest'
import { eq, gt, lt, and } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from './_fixtures'
describe('where used inside a transaction', () => {
        // A reader running filtered reads within a transaction expects
        // the predicate to behave exactly as it does outside one. Each
        // scenario performs the filtered work inside the callback and
        // cross-checks the surviving rows.
        it('a transactional lookup by id returns exactly the one matching user', async () => {
                const { db, users } = await seedUsers()
                const found = await db.transaction(async (tx) => {
                        return tx.select().from(users).where(eq(users.id, 2))
                })
                expect(idsOf(found as { id: number }[])).toEqual([2])
        })
        it('a transactional score-band read returns the in-band users', async () => {
                const { db, users } = await seedUsers()
                const found = await db.transaction(async (tx) => {
                        return tx
                                .select()
                                .from(users)
                                .where(and(gt(users.score, 5), lt(users.score, 25)))
                })
                expect(idsOf(found as { id: number }[])).toEqual([1, 2])
        })
        it('the same cutoff produces the same survivors inside and outside a transaction', async () => {
                const { db, users } = await seedUsers()
                const outside = await db.select().from(users).where(gt(users.score, 15))
                const inside = await db.transaction(async (tx) => {
                        return tx.select().from(users).where(gt(users.score, 15))
                })
                expect(idsOf(inside as { id: number }[])).toEqual(idsOf(outside))
        })
        it('two filtered reads in one transaction each apply only their own predicate', async () => {
                const { db, users } = await seedUsers()
                const pair = await db.transaction(async (tx) => {
                        const low = await tx.select().from(users).where(lt(users.score, 20))
                        const high = await tx.select().from(users).where(gt(users.score, 20))
                        return { low, high }
                })
                const { low, high } = pair as { low: { id: number }[]; high: { id: number }[] }
                expect([idsOf(low), idsOf(high)]).toEqual([[1], [3]])
        })
        it('a transactional filter then its complement recover the whole table', async () => {
                const { db, users } = await seedUsers()
                const halves = await db.transaction(async (tx) => {
                        const matched = await tx.select().from(users).where(eq(users.id, 2))
                        const rest = await tx.select().from(users).where(gt(users.score, 999))
                        return { matched, rest }
                })
                const { matched, rest } = halves as { matched: { id: number }[]; rest: { id: number }[] }
                expect([idsOf(matched), rest]).toEqual([[2], []])
        })
})

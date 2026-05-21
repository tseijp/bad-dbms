import { describe, it, expect } from 'vitest'
import { database } from '../../src/index'
import { count, sum, min, max, eq, gt } from '../../src/index'
import { makeUsers, seedUsers } from '../_helpers'
import { aggRow, scalar } from './helpers'

// aggregate feature: aggregation observed across a realistic insert / update /
// delete usecase. Each `it` is a small story — a library user seeds data,
// mutates it, and re-reads an aggregate to confirm it tracks the new state.
//
// rework-3 audit: `count` resolves to a number, `sum` to a Drizzle STRING.
// The mixed-shape rows below pin that exact contract; an empty sum is null.

describe('aggregate after an insert-and-mutate usecase', () => {
        it('seeds users, deletes one, then re-aggregates count and sum', async () => {
                const { db, users } = await seedUsers()
                await db.delete(users).where(eq(users.id, 3))
                const result = await db.select({ n: count(), s: sum(users.score) }).from(users)
                expect(aggRow(result)).toEqual({ n: 2, s: '30' })
        })

        it('seeds users, updates a score, then re-reads the table sum', async () => {
                const { db, users } = await seedUsers()
                await db.update(users).set({ score: 999 }).where(eq(users.id, 2))
                const result = await db.select({ s: sum(users.score) }).from(users)
                expect(scalar(result, 's')).toBe('1039')
        })

        it('inserts rows incrementally and watches count climb each step', async () => {
                const users = makeUsers()
                const db = database({ users })
                await db.insert(users).values({ id: 1, name: 11, score: 10 })
                const one = await db.select({ n: count() }).from(users)
                await db.insert(users).values({ id: 2, name: 22, score: 20 })
                const two = await db.select({ n: count() }).from(users)
                await db.insert(users).values({ id: 3, name: 33, score: 30 })
                const three = await db.select({ n: count() }).from(users)
                expect([scalar(one, 'n'), scalar(two, 'n'), scalar(three, 'n')]).toEqual([1, 2, 3])
        })

        it('deletes every row then aggregates the now-empty table', async () => {
                const { db, users } = await seedUsers()
                await db.delete(users).where(gt(users.id, 0))
                const result = await db.select({ n: count(), s: sum(users.score) }).from(users)
                expect(aggRow(result)).toEqual({ n: 0, s: null })
        })

        it('re-seeds after a full delete and confirms the sum returns as a string', async () => {
                const { db, users } = await seedUsers()
                await db.delete(users).where(gt(users.id, 0))
                const emptied = await db.select({ s: sum(users.score) }).from(users)
                await db.insert(users).values([
                        { id: 1, name: 11, score: 10 },
                        { id: 2, name: 22, score: 20 },
                ])
                const reseeded = await db.select({ s: sum(users.score) }).from(users)
                expect([scalar(emptied, 's'), scalar(reseeded, 's')]).toEqual([null, '30'])
        })

        it('aggregates min and max before and after lowering one score', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ lo: min(users.score), hi: max(users.score) }).from(users)
                await db.update(users).set({ score: 5 }).where(eq(users.id, 2))
                const after = await db.select({ lo: min(users.score), hi: max(users.score) }).from(users)
                expect([aggRow(before), aggRow(after)]).toEqual([
                        { lo: 10, hi: 30 },
                        { lo: 5, hi: 30 },
                ])
        })

        it('counts before and after a full delete then a re-seed', async () => {
                const { db, users } = await seedUsers()
                await db.delete(users).where(gt(users.id, 0))
                const emptied = await db.select({ n: count() }).from(users)
                await db.insert(users).values([
                        { id: 1, name: 11, score: 10 },
                        { id: 2, name: 22, score: 20 },
                        { id: 3, name: 33, score: 30 },
                ])
                const reseeded = await db.select({ n: count() }).from(users)
                expect([scalar(emptied, 'n'), scalar(reseeded, 'n')]).toEqual([0, 3])
        })
})

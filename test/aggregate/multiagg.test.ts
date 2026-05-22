import { describe, it, expect } from 'vitest'
import { count, sum, avg, min, max, gte } from '../../src/index'
import { seedUsers, seedEvents } from '../_helpers'
import { rowsOf, aggRow, numTable } from './helpers'
// aggregate feature: several aggregates in one projection collapse the table
// to one row carrying every aggregate alias. Drizzle resolves this to an
// array of exactly one row.
//
// rework-3 audit: Drizzle types `count` as a number, but `sum` and `avg` as
// STRINGS. A multi-aggregate row therefore mixes a numeric `n` with string
// `s` / `a`. The deep-equal assertions below pin that exact Drizzle shape;
// bad-dbms returns every aggregate as a JS number, so they fail honestly.
describe('multiple aggregates in one projection', () => {
        it('reads count, sum and avg of the user seed in one query', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)
                expect(aggRow(result)).toEqual({ n: 3, s: '60', a: '20' })
        })
        it('reads min and max of the event values in one query', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ lo: min(events.v), hi: max(events.v) }).from(events)
                expect(aggRow(result)).toEqual({ lo: 100, hi: 500 })
        })
        it('reads all five aggregates of the user seed at once', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({
                                n: count(),
                                s: sum(users.score),
                                a: avg(users.score),
                                lo: min(users.score),
                                hi: max(users.score),
                        })
                        .from(users)
                expect(aggRow(result)).toEqual({ n: 3, s: '60', a: '20', lo: 10, hi: 30 })
        })
        it('reads count, sum, avg, min, max of an empty table together', async () => {
                const { db, t } = await numTable([])
                const result = await db.select({ n: count(), s: sum(t.v), a: avg(t.v), lo: min(t.v), hi: max(t.v) }).from(t)
                expect(aggRow(result)).toEqual({ n: 0, s: null, a: null, lo: null, hi: null })
        })
        it('reads a multi-aggregate projection of a where-filtered subset', async () => {
                const { db, users } = await seedUsers()
                const result = await db
                        .select({ n: count(), s: sum(users.score) })
                        .from(users)
                        .where(gte(users.score, 20))
                expect(aggRow(result)).toEqual({ n: 2, s: '50' })
        })
        it('keeps a multi-aggregate projection to one result row', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count(), s: sum(users.score) }).from(users)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('seeds events, reads the full aggregate row, then narrows by where', async () => {
                const { db, events } = await seedEvents()
                const whole = await db.select({ n: count(), s: sum(events.v) }).from(events)
                const trimmed = await db
                        .select({ n: count(), s: sum(events.v) })
                        .from(events)
                        .where(gte(events.v, 300))
                expect([aggRow(whole), aggRow(trimmed)]).toEqual([
                        { n: 5, s: '1500' },
                        { n: 3, s: '1200' },
                ])
        })
})

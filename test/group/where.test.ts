import { describe, it, expect } from 'vitest'
import { count, sum, gt, gte, lt, lte, ne, between } from '../../src/index'
import { seedEvents } from '../_helpers'
import { rowsOf, groupWith } from './helpers'

// group feature: groupBy after where. The predicate trims rows first, then
// the survivors are bucketed. A group vanishes if where removes all its rows.
// Expectations follow the correct Drizzle / SQL spec.

describe('groupBy after where', () => {
        it('groups only the rows surviving a where predicate', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 150)).groupBy(events.kind)
                expect(groupWith(result, 'kind', 1).n).toBe(2)
        })

        it.each([
                [0, 1],
                [1, 2],
                [2, 1],
        ])('counts kind %i as %i after where v>150', async (kind, expected) => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 150)).groupBy(events.kind)
                expect(groupWith(result, 'kind', kind).n).toBe(expected)
        })

        it('drops a group entirely when where removes all its rows', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 250)).groupBy(events.kind)
                expect(rowsOf(result)).toHaveLength(2)
        })

        it('returns an empty array when where matches no row before grouping', async () => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 9999)).groupBy(events.kind)
                expect(rowsOf(result)).toEqual([])
        })

        it.each([
                ['gte 300', (e: any) => gte(e.v, 300), 2],
                ['lt 300', (e: any) => lt(e.v, 300), 1],
                ['lte 200', (e: any) => lte(e.v, 200), 1],
                ['ne 300', (e: any) => ne(e.v, 300), 3],
                ['between 200 and 400', (e: any) => between(e.v, 200, 400), 2],
        ])('forms the right group count after where %s', async (_label, predicate, expected) => {
                const { db, events } = await seedEvents()
                const result = await db.select({ kind: events.kind, n: count() }).from(events).where(predicate(events)).groupBy(events.kind)
                expect(rowsOf(result)).toHaveLength(expected)
        })

        it('sums each group over only the where-filtered rows', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, s: sum(events.v) })
                        .from(events)
                        .where(gt(events.v, 150))
                        .groupBy(events.kind)
                expect(groupWith(result, 'kind', 1).s).toBe('700')
        })
})

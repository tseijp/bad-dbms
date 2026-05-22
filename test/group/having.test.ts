import { describe, it, expect } from 'vitest'
import { count, sum, eq, gt, gte, lt, lte, ne } from '../../src/index'
import { seedEvents } from '../_helpers'
import { rowsOf } from './helpers'
// group feature: having filters whole groups by an aggregate predicate. It is
// a Drizzle clause that only makes sense after groupBy. bad-dbms's select
// builder exposes no .having method, so these fail honestly via a runtime
// error; they follow the correct Drizzle spec and are never weakened to pass.
describe('having filters groups by aggregate', () => {
        it('keeps only groups whose count exceeds one', async () => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(gt(count(), 1))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('keeps the single group whose count equals one', async () => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(eq(count(), 1))
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('identifies kind 2 as the only single-row group', async () => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(eq(count(), 1))
                expect(rowsOf(result)[0].kind).toBe(2)
        })
        it('keeps groups whose per-group sum exceeds a threshold', async () => {
                const { db, events } = await seedEvents()
                const result = await (
                        db
                                .select({ kind: events.kind, s: sum(events.v) })
                                .from(events)
                                .groupBy(events.kind) as any
                ).having(gt(sum(events.v), 400))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('returns an empty array when having matches no group', async () => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(gt(count(), 99))
                expect(rowsOf(result)).toEqual([])
        })
        it('combines where, groupBy and having in one query', async () => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 150)).groupBy(events.kind) as any).having(gt(count(), 1))
                expect(rowsOf(result)).toHaveLength(1)
        })
        // dense matrix: having over per-group count for the event seed, whose
        // group sizes are 2 / 2 / 1.
        it.each([
                ['gt 0', (c: any) => gt(c, 0), 3],
                ['gt 1', (c: any) => gt(c, 1), 2],
                ['gt 2', (c: any) => gt(c, 2), 0],
                ['gte 1', (c: any) => gte(c, 1), 3],
                ['gte 2', (c: any) => gte(c, 2), 2],
                ['lt 2', (c: any) => lt(c, 2), 1],
                ['lte 1', (c: any) => lte(c, 1), 1],
                ['lte 2', (c: any) => lte(c, 2), 3],
                ['eq 1', (c: any) => eq(c, 1), 1],
                ['eq 2', (c: any) => eq(c, 2), 2],
                ['ne 2', (c: any) => ne(c, 2), 1],
        ])('keeps the right group count for having count %s', async (_label, predicate, expected) => {
                const { db, events } = await seedEvents()
                const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(predicate(count()))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        // dense matrix: having over per-group sum, group sums are 300/700/500.
        it.each([
                ['gt 200', (s: any) => gt(s, 200), 3],
                ['gt 400', (s: any) => gt(s, 400), 2],
                ['gt 700', (s: any) => gt(s, 700), 0],
                ['gte 500', (s: any) => gte(s, 500), 2],
                ['lt 500', (s: any) => lt(s, 500), 1],
                ['lte 500', (s: any) => lte(s, 500), 2],
                ['eq 700', (s: any) => eq(s, 700), 1],
        ])('keeps the right group count for having sum %s', async (_label, predicate, expected) => {
                const { db, events } = await seedEvents()
                const result = await (
                        db
                                .select({ kind: events.kind, s: sum(events.v) })
                                .from(events)
                                .groupBy(events.kind) as any
                ).having(predicate(sum(events.v)))
                expect(rowsOf(result)).toHaveLength(expected)
        })
})

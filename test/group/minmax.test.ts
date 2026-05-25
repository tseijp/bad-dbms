import { describe, it, expect } from 'vitest'
import { findBy, seedEvents } from '../_helpers'
import { groupTable, labelTable } from './helpers'
import { count, sum, avg, min, max } from '../../src/index'
// group feature: per-group min and max. Each bucket reports its own extremes.
//
// review note: per-group min/max over an INTEGER valuesOf returns a number in
// both Drizzle and bad-dbms — those tests pass honestly and are kept.
// The genuine Drizzle attack min/max hides is min/max over a TEXT valuesOf:
// SQL `MIN`/`MAX` on a string valuesOf return the lexicographically smallest /
// largest STRING. bad-dbms stores text internally as u32, so a per-group
// text min/max fails honestly. The `per-group min/max over a text valuesOf`
// describe below pins that contract.
describe('per-group min and max', () => {
        it('finds the min and max of the kind-0 event group', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, lo: min(events.v), hi: max(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                expect(findBy(result, 'kind', 0)!).toEqual({ kind: 0, lo: 100, hi: 200 })
        })
        it.each([
                [0, 100, 200],
                [1, 300, 400],
                [2, 500, 500],
        ])('finds min/max of event kind %i as %i/%i', async (kind, lo, hi) => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({ kind: events.kind, lo: min(events.v), hi: max(events.v) })
                        .from(events)
                        .groupBy(events.kind)
                const row = findBy(result, 'kind', kind)!
                expect([row.lo, row.hi]).toEqual([lo, hi])
        })
        it.each([
                [
                        'spread group',
                        [
                                [0, 5],
                                [0, 95],
                                [0, 50],
                        ] as Array<[number, number]>,
                        0,
                        5,
                        95,
                ],
                [
                        'negatives',
                        [
                                [1, -10],
                                [1, -3],
                                [1, -50],
                        ] as Array<[number, number]>,
                        1,
                        -50,
                        -3,
                ],
                ['singleton', [[2, 7]] as Array<[number, number]>, 2, 7, 7],
                [
                        'equal values',
                        [
                                [3, 8],
                                [3, 8],
                        ] as Array<[number, number]>,
                        3,
                        8,
                        8,
                ],
        ])('finds min/max of the %s shape per group', async (_label, pairs, key, lo, hi) => {
                const { db, t } = await groupTable(pairs)
                const result = await db
                        .select({ g: t.g, lo: min(t.v), hi: max(t.v) })
                        .from(t)
                        .groupBy(t.g)
                const row = findBy(result, 'g', key)!
                expect([row.lo, row.hi]).toEqual([lo, hi])
        })
        // rework-3 audit: a mixed-aggregate group row pins the Drizzle return
        // contract — `n` numeric, `s` and `a` strings, `lo` and `hi` the
        // valuesOf's own numeric type. bad-dbms returns every aggregate as a
        // number, so the string-typed `s` / `a` fail honestly.
        it('reads count, sum, avg, min, max of every group at once', async () => {
                const { db, events } = await seedEvents()
                const result = await db
                        .select({
                                kind: events.kind,
                                n: count(),
                                s: sum(events.v),
                                a: avg(events.v),
                                lo: min(events.v),
                                hi: max(events.v),
                        })
                        .from(events)
                        .groupBy(events.kind)
                expect(findBy(result, 'kind', 0)!).toEqual({ kind: 0, n: 2, s: '300', a: '150', lo: 100, hi: 200 })
        })
        // dense matrix: one fixed dataset, per-group min and max for every key.
        const rangeData: Array<[number, number]> = [
                [0, 50],
                [0, 10],
                [0, 90],
                [1, -3],
                [1, -30],
                [1, -1],
                [2, 7],
                [3, 12],
                [3, 12],
                [4, 0],
                [4, 100],
        ]
        it.each([
                [0, 10],
                [1, -30],
                [2, 7],
                [3, 12],
                [4, 0],
        ])('finds the min of group %i in the range dataset as %i', async (key, expected) => {
                const { db, t } = await groupTable(rangeData)
                const result = await db
                        .select({ g: t.g, lo: min(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', key)!.lo).toBe(expected)
        })
        it.each([
                [0, 90],
                [1, -1],
                [2, 7],
                [3, 12],
                [4, 100],
        ])('finds the max of group %i in the range dataset as %i', async (key, expected) => {
                const { db, t } = await groupTable(rangeData)
                const result = await db
                        .select({ g: t.g, hi: max(t.v) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', key)!.hi).toBe(expected)
        })
        it.each([
                [0, 10, 90],
                [1, -30, -1],
                [2, 7, 7],
                [3, 12, 12],
                [4, 0, 100],
        ])('reads min and max of group %i together', async (key, lo, hi) => {
                const { db, t } = await groupTable(rangeData)
                const result = await db
                        .select({ g: t.g, lo: min(t.v), hi: max(t.v) })
                        .from(t)
                        .groupBy(t.g)
                const row = findBy(result, 'g', key)!
                expect([row.lo, row.hi]).toEqual([lo, hi])
        })
})
describe('per-group min and max over a text valuesOf', () => {
        // SQL MIN/MAX on a text valuesOf return the lexicographically smallest /
        // largest string. bad-dbms stores text internally as u32, so these
        // fail honestly until text columns hold real strings.
        const labels: Array<[number, string]> = [
                [0, 'delta'],
                [0, 'alpha'],
                [0, 'charlie'],
                [1, 'zulu'],
                [1, 'mike'],
                [2, 'solo'],
        ]
        it('finds the lexicographically smallest label in a group', async () => {
                const { db, t } = await labelTable(labels)
                const result = await db
                        .select({ g: t.g, lo: min(t.label) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', 0)!.lo).toBe('alpha')
        })
        it('finds the lexicographically largest label in a group', async () => {
                const { db, t } = await labelTable(labels)
                const result = await db
                        .select({ g: t.g, hi: max(t.label) })
                        .from(t)
                        .groupBy(t.g)
                expect(findBy(result, 'g', 0)!.hi).toBe('delta')
        })
        it.each([
                [0, 'alpha', 'delta'],
                [1, 'mike', 'zulu'],
                [2, 'solo', 'solo'],
        ])('reads the text min/max of group %i as %s / %s', async (key, lo, hi) => {
                const { db, t } = await labelTable(labels)
                const result = await db
                        .select({ g: t.g, lo: min(t.label), hi: max(t.label) })
                        .from(t)
                        .groupBy(t.g)
                const row = findBy(result, 'g', key)!
                expect([row.lo, row.hi]).toEqual([lo, hi])
        })
        it('returns a string, not a numeric code, for a per-group text min', async () => {
                const { db, t } = await labelTable(labels)
                const result = await db
                        .select({ g: t.g, lo: min(t.label) })
                        .from(t)
                        .groupBy(t.g)
                expect(typeof findBy(result, 'g', 0)!.lo).toBe('string')
        })
        it('orders text extremes by lexicographic order, not insertion order', async () => {
                const { db, t } = await labelTable([
                        [0, 'mango'],
                        [0, 'apple'],
                        [0, 'banana'],
                ])
                const result = await db
                        .select({ g: t.g, lo: min(t.label), hi: max(t.label) })
                        .from(t)
                        .groupBy(t.g)
                const row = findBy(result, 'g', 0)!
                expect([row.lo, row.hi]).toEqual(['apple', 'mango'])
        })
})

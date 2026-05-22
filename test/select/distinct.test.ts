import { describe, it, expect } from 'vitest'
import { database, table, integer } from '../../src/index'
import { rowsOf, valuesOf, keysOf, seedUsers, seedEvents } from './helpers'
// select rework: selectDistinct. Drizzle's `selectDistinct` collapses
// duplicate projected rows, returning one row per distinct projected tuple.
//
// bad-dbms exposes no `selectDistinct` method, so it is reached off the
// builder untyped: a missing method fails honestly at runtime, per test,
// rather than being commented out. Expected values follow the correct
// Drizzle spec and are never weakened to the implementation.
// selectDistinct reached untyped so a missing builder fails honestly at run.
const selectDistinct = (db: any, projection?: unknown) => (projection === undefined ? db.selectDistinct() : db.selectDistinct(projection))
// a generic table for distinct scenarios over controlled duplicate data.
const seedValues = async (values: number[]) => {
        const t = table('t', { id: integer('id').primaryKey(), v: integer('v') })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
describe('selectDistinct collapses duplicate projected rows', () => {
        it('collapses duplicate kind rows to the distinct set', async () => {
                const { db, events } = await seedEvents()
                const rows = await selectDistinct(db, { kind: events.kind }).from(events)
                expect(valuesOf(rows, 'kind').slice().sort()).toEqual([0, 1, 2])
        })
        it('returns three rows from a distinct read over five duplicated kinds', async () => {
                const { db, events } = await seedEvents()
                const rows = await selectDistinct(db, { kind: events.kind }).from(events)
                expect(rowsOf(rows)).toHaveLength(3)
        })
        it('treats distinct over already-unique user rows as a no-op', async () => {
                const { db, users } = await seedUsers()
                const rows = await selectDistinct(db).from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })
        it('keys a distinct projection by exactly the projected alias', async () => {
                const { db, events } = await seedEvents()
                const rows = await selectDistinct(db, { kind: events.kind }).from(events)
                expect(keysOf(rows)).toEqual(['kind'])
        })
        // matrix: a single-column distinct read over varying duplicate shapes.
        it.each([
                ['all unique', [1, 2, 3, 4], 4],
                ['all identical', [5, 5, 5, 5], 1],
                ['one duplicate pair', [1, 2, 2], 2],
                ['interleaved duplicates', [1, 2, 1, 2, 1], 2],
                ['triples', [7, 7, 7, 8, 8, 8], 2],
                ['single row', [9], 1],
        ])('returns the distinct row count for the %s dataset', async (_label, values, expected) => {
                const { db, t } = await seedValues(values)
                const rows = await selectDistinct(db, { v: t.v }).from(t)
                expect(rowsOf(rows)).toHaveLength(expected)
        })
        it.each([
                ['unique run', [10, 20, 30], [10, 20, 30]],
                ['with duplicates', [10, 10, 20, 30, 30], [10, 20, 30]],
                ['negatives and zero', [0, 0, -5, -5, 5], [-5, 0, 5]],
        ])('returns the sorted distinct values for the %s dataset', async (_label, values, expected) => {
                const { db, t } = await seedValues(values)
                const rows = await selectDistinct(db, { v: t.v }).from(t)
                expect(
                        valuesOf(rows, 'v')
                                .slice()
                                .sort((a, b) => a - b),
                ).toEqual(expected)
        })
        it('returns an empty array from a distinct read of an empty table', async () => {
                const { db, t } = await seedValues([])
                const rows = await selectDistinct(db, { v: t.v }).from(t)
                expect(rowsOf(rows)).toEqual([])
        })
        it('keeps a distinct read of all-distinct rows the same length as a bare read', async () => {
                const { db, users } = await seedUsers()
                const bare = await db.select().from(users)
                const distinct = await selectDistinct(db).from(users)
                expect([rowsOf(bare).length, rowsOf(distinct).length]).toEqual([3, 3])
        })
        it('collapses a full-row distinct read over a table with duplicate rows', async () => {
                const t = table('t', { id: integer('id').primaryKey(), a: integer('a'), b: integer('b') })
                const db = database({ t })
                await db.insert(t).values([
                        { id: 1, a: 1, b: 1 },
                        { id: 2, a: 1, b: 1 },
                        { id: 3, a: 2, b: 2 },
                ])
                const rows = await selectDistinct(db, { a: t.a, b: t.b }).from(t)
                expect(rowsOf(rows)).toHaveLength(2)
        })
        it('seeds duplicates, reads distinct, inserts a new value, then re-reads distinct', async () => {
                const { db, t } = await seedValues([1, 1, 2])
                const before = await selectDistinct(db, { v: t.v }).from(t)
                await db.insert(t).values({ id: 4, v: 3 })
                const after = await selectDistinct(db, { v: t.v }).from(t)
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([2, 3])
        })
})

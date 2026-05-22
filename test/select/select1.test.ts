import { describe, it, expect } from 'vitest'
import { database } from '../../src/index'
import { makeUsers } from '../_helpers'
import { rowsOf, valuesOf, keysOf, seedUsers, seedEvents, seedLabels, LABELS } from './helpers'
// select rework: reading every column with an omitted projection. Drizzle's
// `select().from(t)` resolves to an array of row objects, one per stored row,
// each carrying every declared column under its own name.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a text column round-trips its STRING value through a bare select;
//     bad-dbms stores text internally as u32 and is expected to lose it.
//   * an omitted projection returns exactly the declared column set, no
//     internal bookkeeping keys (`__rid`, etc.).
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.
describe('select all columns', () => {
        it('reads back every seeded user row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })
        it('returns rows carrying exactly the three declared columns', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(keysOf(rows)).toEqual(['id', 'name', 'score'])
        })
        it('does not leak an internal rid key into a bare select row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect('__rid' in rowsOf(rows)[0]).toBe(false)
        })
        it.each([
                [0, { id: 1, name: 11, score: 10 }],
                [1, { id: 2, name: 22, score: 20 }],
                [2, { id: 3, name: 33, score: 30 }],
        ])('returns row %i with its exact seeded values', async (index, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(rowsOf(rows)[index]).toEqual(expected)
        })
        it('preserves insertion order across a bare select', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select().from(users)
                expect(valuesOf(rows, 'id')).toEqual([1, 2, 3])
        })
        it('reads an empty array from a freshly built un-seeded table', async () => {
                const users = makeUsers()
                const db = database({ users })
                const rows = await db.select().from(db.tables.users)
                expect(rowsOf(rows)).toEqual([])
        })
        it('reads all five event rows back with every column present', async () => {
                const { db, events } = await seedEvents()
                const rows = await db.select().from(events)
                expect([rowsOf(rows).length, keysOf(rows)]).toEqual([5, ['id', 'kind', 'v']])
        })
        // a bare select must round-trip a text column as its string value.
        it('round-trips a text column value through a bare select', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select().from(items)
                expect(valuesOf(rows, 'label')).toEqual(['alpha', 'beta', 'gamma'])
        })
        it.each([
                [0, 'alpha'],
                [1, 'beta'],
                [2, 'gamma'],
        ])('reads the text label of row %i as the string %s', async (index, label) => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select().from(items)
                expect(rowsOf(rows)[index].label).toBe(label)
        })
        it('keeps a text label a string, not a numeric code, after a bare select', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select().from(items)
                expect(typeof rowsOf(rows)[0].label).toBe('string')
        })
        it('returns a row with the text column beside its integer columns', async () => {
                const { db, items } = await seedLabels([[1, 'solo', 99]])
                const rows = await db.select().from(items)
                expect(rowsOf(rows)[0]).toEqual({ id: 1, label: 'solo', qty: 99 })
        })
        it.each([1, 2, 3, 5, 8])('reads back exactly %i rows after seeding that many', async (n) => {
                const users = makeUsers()
                const db = database({ users })
                const data = Array.from({ length: n }, (_v, i) => ({ id: i + 1, name: i + 1, score: i }))
                await db.insert(users).values(data)
                const rows = await db.select().from(users)
                expect(rowsOf(rows)).toHaveLength(n)
        })
        it('seeds, reads all, inserts one more, then re-reads the larger set', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select().from(users)
                await db.insert(users).values({ id: 4, name: 44, score: 40 })
                const after = await db.select().from(users)
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([3, 4])
        })
})

import { describe, it, expect } from 'vitest'
import { rowsOf, valuesOf, keysOf, seedUsers, seedLabels, LABELS } from './helpers'

// select rework: projecting a chosen subset of columns. A projection narrows
// the column set but never the row set.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a subset projection yields rows with EXACTLY the projected keys — no
//     unselected column leaks through.
//   * the row keys are the projection keys, in the order declared.
//   * projecting a text column keeps its string value.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.

describe('projecting a subset of columns', () => {
        it('narrows a user read to a single id key per row', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id }).from(users)
                expect(rowsOf(rows).every((r) => Object.keys(r).length === 1)).toBe(true)
        })

        it('keys an id-only projection by exactly the id key', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id }).from(users)
                expect(Object.keys(rowsOf(rows)[0])).toEqual(['id'])
        })

        it('reads the id values in order from an id-only projection', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id }).from(users)
                expect(valuesOf(rows, 'id')).toEqual([1, 2, 3])
        })

        it('projects two columns and yields exactly those two keys', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, score: users.score }).from(users)
                expect(rowsOf(rows)[0]).toEqual({ id: 1, score: 10 })
        })

        it('omits an unselected column entirely from a two-column projection', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, score: users.score }).from(users)
                expect('name' in rowsOf(rows)[0]).toBe(false)
        })

        it('keeps every row when a projection narrows columns', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ name: users.name }).from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })

        // matrix: every subset projection over the users table yields exactly
        // the projected key set.
        it.each([
                ['id only', (u: any) => ({ id: u.id }), ['id']],
                ['name only', (u: any) => ({ name: u.name }), ['name']],
                ['score only', (u: any) => ({ score: u.score }), ['score']],
                ['id and name', (u: any) => ({ id: u.id, name: u.name }), ['id', 'name']],
                ['id and score', (u: any) => ({ id: u.id, score: u.score }), ['id', 'score']],
                ['name and score', (u: any) => ({ name: u.name, score: u.score }), ['name', 'score']],
                ['all three', (u: any) => ({ id: u.id, name: u.name, score: u.score }), ['id', 'name', 'score']],
        ])('shapes the %s projection to exactly its keys', async (_label, project, keys) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(keysOf(rows)).toEqual(keys)
        })

        // matrix: every subset projection keeps all three rows.
        it.each([
                ['id only', (u: any) => ({ id: u.id })],
                ['name and score', (u: any) => ({ name: u.name, score: u.score })],
                ['all three', (u: any) => ({ id: u.id, name: u.name, score: u.score })],
        ])('keeps all three rows for the %s projection', async (_label, project) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(rowsOf(rows)).toHaveLength(3)
        })

        // matrix: a two-column projection read row by row against exact values.
        it.each([
                [0, { id: 1, score: 10 }],
                [1, { id: 2, score: 20 }],
                [2, { id: 3, score: 30 }],
        ])('reads row %i of an id-and-score projection exactly', async (index, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, score: users.score }).from(users)
                expect(rowsOf(rows)[index]).toEqual(expected)
        })

        it('lets a user widen then narrow a projection across two reads', async () => {
                const { db, users } = await seedUsers()
                const wide = await db.select().from(users)
                const narrow = await db.select({ id: users.id }).from(users)
                expect([keysOf(wide).length, keysOf(narrow).length]).toEqual([3, 1])
        })

        // projecting a text column keeps the string value.
        it('projects a text column and keeps its string value', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ label: items.label }).from(items)
                expect(valuesOf(rows, 'label')).toEqual(['alpha', 'beta', 'gamma'])
        })

        it('projects a text column beside an integer column with exact values', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ label: items.label, qty: items.qty }).from(items)
                expect(rowsOf(rows)[1]).toEqual({ label: 'beta', qty: 20 })
        })

        it('narrows an items read to just the text column', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ label: items.label }).from(items)
                expect(keysOf(rows)).toEqual(['label'])
        })

        it('seeds, projects a subset, inserts a row, then re-projects the subset', async () => {
                const { db, users } = await seedUsers()
                const before = await db.select({ id: users.id }).from(users)
                await db.insert(users).values({ id: 4, name: 44, score: 40 })
                const after = await db.select({ id: users.id }).from(users)
                expect([valuesOf(before, 'id'), valuesOf(after, 'id')]).toEqual([
                        [1, 2, 3],
                        [1, 2, 3, 4],
                ])
        })
})

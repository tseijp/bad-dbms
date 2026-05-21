import { describe, it, expect } from 'vitest'
import { rowsOf, valuesOf, keysOf, seedUsers, seedLabels, LABELS } from './helpers'

// select rework: aliasing a projected column. In a Drizzle projection the
// object KEY is the alias the result row is keyed by; the source column's own
// name never appears in the result unless it is also used as a key.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * `select({ point: users.score })` yields rows keyed `point`, with NO
//     `score` key — the alias fully replaces the column name.
//   * one column projected under two aliases yields both keys, each holding
//     that column's value.
//   * aliasing works the same for a text column.
// Expected values follow the correct Drizzle spec, never bad-dbms behaviour.

describe('aliasing a projected column', () => {
        it('reads scores back when the alias equals the column name', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ score: users.score }).from(users)
                expect(valuesOf(rows, 'score')).toEqual([10, 20, 30])
        })

        it('keys the result by the alias when it differs from the column name', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ point: users.score }).from(users)
                expect(keysOf(rows)).toEqual(['point'])
        })

        it('drops the original column name when an alias renames it', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ point: users.score }).from(users)
                expect('score' in rowsOf(rows)[0]).toBe(false)
        })

        it('reads aliased values in order under the new key', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ point: users.score }).from(users)
                expect(valuesOf(rows, 'point')).toEqual([10, 20, 30])
        })

        // matrix: a single column projected under a variety of alias names
        // always keys the result by the alias, never the column name.
        it.each([
                ['point', (u: any) => ({ point: u.score }), 'point'],
                ['total', (u: any) => ({ total: u.score }), 'total'],
                ['value', (u: any) => ({ value: u.score }), 'value'],
                ['userId', (u: any) => ({ userId: u.id }), 'userId'],
                ['label', (u: any) => ({ label: u.name }), 'label'],
        ])('keys the result by the alias %s', async (_label, project, alias) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(keysOf(rows)).toEqual([alias])
        })

        it.each([
                ['point for score', (u: any) => ({ point: u.score }), 'score'],
                ['total for score', (u: any) => ({ total: u.score }), 'score'],
                ['userId for id', (u: any) => ({ userId: u.id }), 'id'],
                ['label for name', (u: any) => ({ label: u.name }), 'name'],
        ])('drops the source column name %s when aliased', async (_label, project, source) => {
                const { db, users } = await seedUsers()
                const rows = await db.select(project(users)).from(users)
                expect(source in rowsOf(rows)[0]).toBe(false)
        })

        it('projects one column twice under two aliases', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ a: users.id, b: users.id }).from(users)
                expect(rowsOf(rows).every((r) => r.a === r.b)).toBe(true)
        })

        it('reads both aliases of a double projection with the same value', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ a: users.id, b: users.id }).from(users)
                expect(rowsOf(rows)[0]).toEqual({ a: 1, b: 1 })
        })

        it('gives a double projection exactly the two alias keys', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ a: users.id, b: users.id }).from(users)
                expect(keysOf(rows)).toEqual(['a', 'b'])
        })

        it('re-labels two columns and reads them under the new names', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ uid: users.id, pts: users.score }).from(users)
                expect(keysOf(rows)).toEqual(['pts', 'uid'])
        })

        it.each([
                [0, { uid: 1, pts: 10 }],
                [1, { uid: 2, pts: 20 }],
                [2, { uid: 3, pts: 30 }],
        ])('reads row %i of a relabelled two-column projection exactly', async (index, expected) => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ uid: users.id, pts: users.score }).from(users)
                expect(rowsOf(rows)[index]).toEqual(expected)
        })

        it('keys a renamed text column by its alias', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ tag: items.label }).from(items)
                expect(keysOf(rows)).toEqual(['tag'])
        })

        it('reads a renamed text column value under its alias', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ tag: items.label }).from(items)
                expect(valuesOf(rows, 'tag')).toEqual(['alpha', 'beta', 'gamma'])
        })

        it('drops the text column name when it is aliased', async () => {
                const { db, items } = await seedLabels(LABELS)
                const rows = await db.select({ tag: items.label }).from(items)
                expect('label' in rowsOf(rows)[0]).toBe(false)
        })

        it('mixes an aliased column with a same-named column in one projection', async () => {
                const { db, users } = await seedUsers()
                const rows = await db.select({ id: users.id, pts: users.score }).from(users)
                expect(rowsOf(rows)[0]).toEqual({ id: 1, pts: 10 })
        })
})

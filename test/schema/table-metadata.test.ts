import { describe, it, expect } from 'vitest'
import { table, integer, text } from '../../src/index'
import * as bad from '../../src/index'
// schema rework: attack table introspection against the correct Drizzle spec.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * `getTableColumns(table)` returns the column map keyed by property name.
//   * `getTableColumns(table).id` is the identical object as `table.id`.
//   * `getTableConfig(table)` reports `name`, `columns`, `primaryKeys`,
//     `foreignKeys`, `uniqueConstraints`.
// bad-dbms exposes neither introspection helper. The earlier version of this
// file COMMENTED OUT the introspection describe as "Roadmap" — that was an
// attack failure. The helpers are now reached off the namespace import so a
// missing export fails honestly per test at runtime.
const getTableColumns = (t: unknown) => (bad as any).getTableColumns(t)
const getTableConfig = (t: unknown) => (bad as any).getTableConfig(t)
describe('table node and declared shape', () => {
        it('records the table name on the node', () => {
                const users = table('users', { id: integer('id') })
                expect((users as any).node.name).toBe('users')
        })
        it('exposes the columns array on $meta', () => {
                const t = table('t', { id: integer('id') })
                expect(Array.isArray(t.$meta.columns)).toBe(true)
        })
        it.each(['users', 'posts', 'events', 'nodes'])('records the name %s on the table', (name) => {
                const t = table(name, { id: integer('id') })
                expect(t.$meta.name).toBe(name)
        })
        it('keeps two declarations of the same shape independent', () => {
                const a = table('t', { id: integer('id') })
                const b = table('t', { id: integer('id') })
                expect(a.$meta).not.toBe(b.$meta)
        })
        it('builds a twelve-column table reporting length 12', () => {
                const t = table('big', {
                        c0: integer('c0'),
                        c1: integer('c1'),
                        c2: integer('c2'),
                        c3: integer('c3'),
                        c4: integer('c4'),
                        c5: integer('c5'),
                        c6: integer('c6'),
                        c7: integer('c7'),
                        c8: integer('c8'),
                        c9: integer('c9'),
                        c10: integer('c10'),
                        c11: integer('c11'),
                })
                expect(t.$meta.columns).toHaveLength(12)
        })
})
describe('table introspection (Drizzle parity)', () => {
        it('returns the column keys from getTableColumns', () => {
                const t = table('t', { id: integer('id'), name: text('name') })
                const cols = getTableColumns(t)
                expect(Object.keys(cols).sort()).toEqual(['id', 'name'])
        })
        it('returns the identical column object from getTableColumns', () => {
                const t = table('t', { id: integer('id'), name: text('name') })
                const cols = getTableColumns(t)
                expect(cols.id).toBe((t as any).id)
        })
        it('returns one entry per declared column from getTableColumns', () => {
                const t = table('t', { a: integer('a'), b: integer('b'), c: integer('c') })
                const cols = getTableColumns(t)
                expect(Object.keys(cols)).toHaveLength(3)
        })
        it('returns the table name from getTableConfig', () => {
                const t = table('users', { id: integer('id'), name: text('name'), score: integer('score') })
                const config = getTableConfig(t)
                expect(config.name).toBe('users')
        })
        it('returns the column list length from getTableConfig', () => {
                const t = table('users', { id: integer('id'), name: text('name'), score: integer('score') })
                const config = getTableConfig(t)
                expect(config.columns).toHaveLength(3)
        })
        it('lists the primary-key column from getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), name: text('name') })
                const config = getTableConfig(t)
                const pkCols = config.primaryKeys.flatMap((pk: any) => pk.columns.map((c: any) => c.name))
                expect(pkCols).toContain('id')
        })
        it('lists a foreign key from getTableConfig', () => {
                const users = table('users', { id: integer('id').primaryKey() })
                const posts = table('posts', {
                        id: integer('id').primaryKey(),
                        userId: integer('user_id').references(() => (users as any).id),
                })
                const config = getTableConfig(posts)
                expect(config.foreignKeys.length).toBe(1)
        })
        it('lists a unique constraint from getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), email: text('email').unique() })
                const config = getTableConfig(t)
                expect(config.uniqueConstraints.length).toBe(1)
        })
        it('reports empty primary-key, foreign-key and unique lists for a bare table', () => {
                const t = table('t', { a: integer('a'), b: integer('b') })
                const config = getTableConfig(t)
                expect([config.primaryKeys, config.foreignKeys, config.uniqueConstraints]).toEqual([[], [], []])
        })
})

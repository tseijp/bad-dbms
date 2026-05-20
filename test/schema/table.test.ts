import { describe, it, expect } from 'vitest'
import { table, integer } from '../../src/index'
import * as bad from '../../src/index'

// schema rework: table declaration structure. The structural invariants here
// (name preserved, declared column order kept, distinct tables are distinct
// references) are genuine Drizzle-parity facts and would hold in Drizzle too.
//
// The rework switches column-name reads off the bad-dbms internal
// `$meta.columns[].$col.name` path onto the public column `name` property and
// the Drizzle `getTableColumns` introspection helper, so a column-shape
// divergence fails honestly rather than passing through an internal field.

const getTableColumns = (t: unknown) => (bad as any).getTableColumns(t)
const columnNames = (t: any) => Object.values(getTableColumns(t)).map((c: any) => c.name)

describe('table()', () => {
        it('reads the table name from the declared table', () => {
                const users = table('users', { id: integer('id') })
                expect(users.$meta.name).toBe('users')
        })

        it.each(['users', 'posts', 'events', 'nodes', 'a', 't', 'long_table_name'])(
                'preserves table name %s',
                (name) => {
                        const t = table(name, { id: integer('id') })
                        expect(t.$meta.name).toBe(name)
                }
        )

        it('keeps declared column order through getTableColumns', () => {
                const users = table('users', {
                        id: integer('id'),
                        name: integer('name'),
                        score: integer('score'),
                })
                expect(columnNames(users)).toEqual(['id', 'name', 'score'])
        })

        it('reports three columns through getTableColumns', () => {
                const users = table('users', {
                        id: integer('id'),
                        name: integer('name'),
                        score: integer('score'),
                })
                expect(Object.keys(getTableColumns(users))).toHaveLength(3)
        })

        it.each([
                [1, { a: integer('a') }],
                [2, { a: integer('a'), b: integer('b') }],
                [3, { a: integer('a'), b: integer('b'), c: integer('c') }],
                [5, { a: integer('a'), b: integer('b'), c: integer('c'), d: integer('d'), e: integer('e') }],
        ])('declares a table with %i columns', (count, cols) => {
                const t = table('t', cols as any)
                expect(Object.keys(getTableColumns(t))).toHaveLength(count as number)
        })

        it('declares two different tables as distinct references', () => {
                const users = table('users', { id: integer('id') })
                const posts = table('posts', { id: integer('id'), userId: integer('user_id') })
                expect(users).not.toBe(posts)
        })

        it('keeps a foreign property off the users table', () => {
                const users = table('users', { id: integer('id') })
                expect((users as any).userId).toBeUndefined()
        })

        it('declares two same-named tables as distinct references', () => {
                const a = table('t', { id: integer('id') })
                const b = table('t', { id: integer('id') })
                expect(a).not.toBe(b)
        })

        it('keeps two same-named tables independent in their column sets', () => {
                const a = table('t', { id: integer('id') })
                table('t', { id: integer('id'), extra: integer('extra') })
                expect(Object.keys(getTableColumns(a))).toHaveLength(1)
        })

        it('reports a one-column table through getTableColumns', () => {
                const solo = table('solo', { only: integer('only') })
                expect(Object.keys(getTableColumns(solo))).toHaveLength(1)
        })

        it('reports the single column name of a one-column table', () => {
                const solo = table('solo', { only: integer('only') })
                expect(columnNames(solo)).toEqual(['only'])
        })

        it('exposes a declared column as a table property', () => {
                const users = table('users', { id: integer('id') })
                expect((users as any).id).toBeDefined()
        })

        it('exposes the same column object on the property and via getTableColumns', () => {
                const users = table('users', { id: integer('id') })
                expect(getTableColumns(users).id).toBe((users as any).id)
        })

        it('keeps the column name on the public column property', () => {
                const users = table('users', { id: integer('id') })
                expect((users as any).id.name).toBe('id')
        })
})

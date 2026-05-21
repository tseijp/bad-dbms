import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'
import * as bad from '../../src/index'

// schema rework: attack the primary-key constraint against the correct
// Drizzle spec, not the bad-dbms `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a column exposes its primary-key state on the public `primary` boolean.
//     When unset it is strictly `false`, never `undefined`.
//   * `getTableConfig(table).primaryKeys` lists the primary-key columns.
//   * declaring two `.primaryKey()` columns forms a COMPOSITE primary key —
//     getTableConfig reports a single composite key over both columns.
// bad-dbms records `$col.primaryKey` as `true | undefined` and exposes no
// introspection, so these fail honestly and are never weakened.

const factories = { integer, uint, float, text } as const
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']

// getTableConfig is a Drizzle introspection API reached off the namespace
// import so a missing export fails honestly per test, not at module load.
const getTableConfig = (t: unknown) => (bad as any).getTableConfig(t)

describe('primary key constraint', () => {
        it.each(factoryNames)('marks the %s column primary on the public flag', (name) => {
                const t = table('t', { id: factories[name]('id').primaryKey() })
                expect((t as any).id.primary).toBe(true)
        })

        it.each(factoryNames)('reports a plain %s column as strictly not primary', (name) => {
                const t = table('t', { id: factories[name]('id') })
                expect((t as any).id.primary).toBe(false)
        })

        it('returns a chainable column from primaryKey()', () => {
                const c = integer('id').primaryKey()
                expect(typeof c.notNull).toBe('function')
        })

        it('a primary-key column is implicitly not null', () => {
                const t = table('t', { id: integer('id').primaryKey() })
                expect((t as any).id.notNull).toBe(true)
        })

        it('allows notNull chained after primaryKey', () => {
                const t = table('t', { id: integer('id').primaryKey().notNull() })
                expect((t as any).id.primary).toBe(true)
        })

        it('lists the primary-key column in getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), name: text('name') })
                const config = getTableConfig(t)
                expect(config.primaryKeys.length).toBe(1)
        })

        it('names the declared column as the primary key in getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), name: text('name') })
                const config = getTableConfig(t)
                const pkCols = config.primaryKeys.flatMap((pk: any) => pk.columns.map((c: any) => c.name))
                expect(pkCols).toContain('id')
        })

        it('reports no primary key in getTableConfig when none is declared', () => {
                const t = table('t', { id: integer('id'), name: text('name') })
                const config = getTableConfig(t)
                expect(config.primaryKeys).toEqual([])
        })

        it('treats two .primaryKey() columns as a single composite key', () => {
                const t = table('t', {
                        a: integer('a').primaryKey(),
                        b: integer('b').primaryKey(),
                })
                const config = getTableConfig(t)
                const allPkCols = config.primaryKeys.flatMap((pk: any) => pk.columns.map((c: any) => c.name))
                expect(allPkCols.sort()).toEqual(['a', 'b'])
        })

        it('marks both columns of a composite key primary on the public flag', () => {
                const t = table('t', {
                        a: integer('a').primaryKey(),
                        b: integer('b').primaryKey(),
                })
                expect([(t as any).a.primary, (t as any).b.primary]).toEqual([true, true])
        })

        it('keeps a primary-key column primary alongside a default value', () => {
                const t = table('t', { id: integer('id').primaryKey().default(1) })
                expect((t as any).id.primary).toBe(true)
        })

        it.each(factoryNames)('lists a %s primary-key column through getTableConfig', (name) => {
                const t = table('t', { id: factories[name]('id').primaryKey() })
                const config = getTableConfig(t)
                expect(config.primaryKeys.length).toBeGreaterThan(0)
        })
})

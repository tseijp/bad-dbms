import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text, getTableConfig } from '../../src/index'
// schema rework: attack the unique constraint against the correct Drizzle
// spec, not the bad-dbms `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a column exposes its unique state on the public `isUnique` boolean.
//     When unset it is strictly `false`, never `undefined`.
//   * `getTableConfig(table).uniqueConstraints` lists the unique columns.
// bad-dbms records `$col.unique` as `true | undefined` and exposes no
// introspection, so these fail honestly and are never weakened.
const factories = { integer, uint, float, text }
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
describe('unique constraint', () => {
        it.each(factoryNames)('marks the %s column unique on the public flag', (name) => {
                const t = table('t', { email: factories[name]('email').unique() })
                expect(t.email.isUnique).toBe(true)
        })
        it.each(factoryNames)('reports a plain %s column as strictly not unique', (name) => {
                const t = table('t', { email: factories[name]('email') })
                expect(t.email.isUnique).toBe(false)
        })
        it('reports an unset unique flag as a real boolean, not undefined', () => {
                const t = table('t', { email: integer('email') })
                expect(typeof t.email.isUnique).toBe('boolean')
        })
        it('marks a column unique with unique().primaryKey()', () => {
                const t = table('t', { email: integer('email').unique().primaryKey() })
                expect(t.email.isUnique).toBe(true)
        })
        it('marks a column primary with unique().primaryKey()', () => {
                const t = table('t', { email: integer('email').unique().primaryKey() })
                expect(t.email.primary).toBe(true)
        })
        it('marks a column unique regardless of chain order with primaryKey', () => {
                const t = table('t', { email: integer('email').primaryKey().unique() })
                expect(t.email.isUnique).toBe(true)
        })
        it('marks a column unique with unique().notNull()', () => {
                const t = table('t', { email: integer('email').unique().notNull() })
                expect(t.email.isUnique).toBe(true)
        })
        it('marks both columns chaining unique', () => {
                const t = table('t', {
                        a: integer('a').unique(),
                        b: integer('b').unique(),
                })
                expect([t.a.isUnique, t.b.isUnique]).toEqual([true, true])
        })
        it('keeps a plain column non-unique beside a unique sibling', () => {
                const t = table('t', { a: integer('a').unique(), b: integer('b') })
                expect([t.a.isUnique, t.b.isUnique]).toEqual([true, false])
        })
        it('lists the unique column in getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), email: text('email').unique() })
                const config = getTableConfig(t)
                expect(config.uniqueConstraints.length).toBe(1)
        })
        it('names the declared unique column in getTableConfig', () => {
                const t = table('users', { id: integer('id').primaryKey(), email: text('email').unique() })
                const config = getTableConfig(t)
                const uniqueCols = config.uniqueConstraints.flatMap((u) => u.columns.map((c) => c.name))
                expect(uniqueCols).toContain('email')
        })
        it('reports no unique constraints in getTableConfig when none is declared', () => {
                const t = table('t', { id: integer('id'), name: text('name') })
                const config = getTableConfig(t)
                expect(config.uniqueConstraints).toEqual([])
        })
        it('lists two unique columns separately in getTableConfig', () => {
                const t = table('t', {
                        a: integer('a').unique(),
                        b: integer('b').unique(),
                })
                const config = getTableConfig(t)
                expect(config.uniqueConstraints.length).toBe(2)
        })
})

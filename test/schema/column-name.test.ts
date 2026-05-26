import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'
// schema rework: attack column-name resolution and the column's initial
// constraint state against the correct Drizzle spec, not the bad-dbms `$col`
// descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a column exposes its name on the public `name` property.
//   * a freshly declared column reports its constraint state as strict
//     booleans on the public flags — `primary`, `notNull`, `isUnique`,
//     `hasDefault` are all strictly `false`, never `undefined`.
// bad-dbms records `$col.*` as `true | undefined`, so the strict-false
// assertions fail honestly and are never weakened.
const factories = { integer, uint, float, text }
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
describe('column name resolution', () => {
        it.each(factoryNames)('keeps the explicit factory name on a %s column', (name) => {
                const t = table('t', { c: factories[name]('explicit') })
                expect(t.c.name).toBe('explicit')
        })
        it('fills the column name from the property key for an integer column', () => {
                const t = table('t', { propKey: integer() })
                expect(t.propKey.name).toBe('propKey')
        })
        it('fills the column name from the property key for a uint column', () => {
                const t = table('t', { propKey: uint() })
                expect(t.propKey.name).toBe('propKey')
        })
        it('fills the column name from the property key for a float column', () => {
                const t = table('t', { propKey: float() })
                expect(t.propKey.name).toBe('propKey')
        })
        it('fills the column name from the property key for a text column', () => {
                const t = table('t', { propKey: text() })
                expect(t.propKey.name).toBe('propKey')
        })
        it('lets the explicit factory name win over the property key', () => {
                const t = table('t', { propKey: integer('given_name') })
                expect(t.propKey.name).toBe('given_name')
        })
        it.each(['id', 'name', 'score', 'user_id', 'created_at'])('records the factory name %s on the column', (name) => {
                const t = table('t', { c: integer(name) })
                expect(t.c.name).toBe(name)
        })
        it('builds two integer columns with the same name as distinct objects', () => {
                const a = integer('a')
                const b = integer('a')
                expect(a).not.toBe(b)
        })
        it('allows two same-named columns within one table declaration', () => {
                const t = table('t', { a: integer('dup'), b: integer('dup') })
                expect(t.$meta.columns).toHaveLength(2)
        })
        it('keeps two same-named columns as distinct objects in one table', () => {
                const t = table('t', { a: integer('dup'), b: integer('dup') })
                expect(t.$meta.columns[0]).not.toBe(t.$meta.columns[1])
        })
})
describe('column initial constraint state', () => {
        it.each(factoryNames)('reports a fresh %s column as strictly not primary', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c.primary).toBe(false)
        })
        it.each(factoryNames)('reports a fresh %s column as strictly not unique', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c.isUnique).toBe(false)
        })
        it.each(factoryNames)('reports a fresh %s column as strictly nullable', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c.notNull).toBe(false)
        })
        it.each(factoryNames)('reports a fresh %s column as having strictly no default', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c.hasDefault).toBe(false)
        })
        it.each(factoryNames)('reports the primary flag of a fresh %s column as a real boolean', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(typeof t.c.primary).toBe('boolean')
        })
        it.each(factoryNames)('reports the notNull flag of a fresh %s column as a real boolean', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(typeof t.c.notNull).toBe('boolean')
        })
})

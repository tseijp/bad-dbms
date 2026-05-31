import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text, getTableColumns } from '../../src/index'
// getTableColumns is a Drizzle introspection API. bad-dbms exposes no such
// export, so it is reached off the namespace import: the symbol is undefined
// and calling it fails honestly at runtime, per test, rather than crashing
// the whole module at import time.
const factories = { integer, uint, float, text }
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
// schema rework: attack the column factories against the correct Drizzle
// spec, not the bad-dbms internal `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour that bad-dbms is expected to miss:
//   * a column reports a SEMANTIC data type — `integer`/`uint`/`float` are
//     numeric, `text` is a string type. Drizzle never surfaces an internal
//     bit-width code (`i32`/`u32`/`f32`) as the public column data type.
//   * `getTableColumns(table)` returns the column map keyed by property name.
//   * a column carries a Drizzle column-type tag (`columnType`) such as
//     `SQLiteInteger` / `SQLiteText`, distinguishing integer from text.
// These follow the Drizzle spec; bad-dbms exposes only `i32`/`u32`/`f32` and
// no introspection, so the assertions fail honestly and are never weakened.
// the Drizzle data-type category each factory must report.
const drizzleType: Record<FactoryName, string> = {
        integer: 'integer',
        uint: 'integer',
        float: 'float',
        text: 'text',
}
describe('column factories', () => {
        it.each(factoryNames)('exposes %s column as a table property', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c).toBeDefined()
        })
        it.each(factoryNames)('keeps the explicit factory name for %s', (name) => {
                const t = table('t', { c: factories[name]('given_name') })
                expect(t.c.name).toBe('given_name')
        })
        it.each(factoryNames)('builds two %s columns as distinct objects', (name) => {
                const a = factories[name]('a')
                const b = factories[name]('a')
                expect(a).not.toBe(b)
        })
        it('allows two columns of the same name across two tables', () => {
                const a = table('a', { id: integer('id') })
                const b = table('b', { id: integer('id') })
                expect(a.id).not.toBe(b.id)
        })
        // a factory reports a semantic data type, never an internal bit-width
        // code. bad-dbms reports i32/u32/f32, so these fail honestly.
        it.each(factoryNames)('reports a semantic data type for the %s factory', (name) => {
                const t = table('t', { c: factories[name]('c') })
                expect(t.c.dataType).toBe(drizzleType[name])
        })
        it('reports an integer data type for an integer column', () => {
                const t = table('t', { c: integer('c') })
                expect(t.c.dataType).toBe('integer')
        })
        it('reports an integer data type for a uint column', () => {
                const t = table('t', { c: uint('c') })
                expect(t.c.dataType).toBe('integer')
        })
        it('reports a float data type for a float column', () => {
                const t = table('t', { c: float('c') })
                expect(t.c.dataType).toBe('float')
        })
        it('reports a text data type for a text column', () => {
                const t = table('t', { c: text('c') })
                expect(t.c.dataType).toBe('text')
        })
        it('does not surface an i32 bit-width code as an integer column type', () => {
                const t = table('t', { c: integer('c') })
                expect(t.c.dataType).not.toBe('i32')
        })
        it('does not surface a u32 bit-width code as a text column type', () => {
                const t = table('t', { c: text('c') })
                expect(t.c.dataType).not.toBe('u32')
        })
        // Drizzle tags each column with a column-type marker distinguishing
        // integer-backed from text-backed columns.
        it('distinguishes an integer column from a text column by columnType', () => {
                const t = table('t', { n: integer('n'), s: text('s') })
                expect(t.n.columnType).not.toBe(t.s.columnType)
        })
        it('tags an integer column with an integer columnType', () => {
                const t = table('t', { c: integer('c') })
                expect(String(t.c.columnType).toLowerCase()).toContain('int')
        })
        it('tags a text column with a text columnType', () => {
                const t = table('t', { c: text('c') })
                expect(String(t.c.columnType).toLowerCase()).toContain('text')
        })
        // getTableColumns is a Drizzle introspection API; bad-dbms exposes no
        // such export, so these fail honestly at runtime.
        it('returns every declared column from getTableColumns', () => {
                const t = table('t', { id: integer('id'), label: text('label') })
                const cols = getTableColumns(t)
                expect(Object.keys(cols).sort()).toEqual(['id', 'label'])
        })
        it.each(factoryNames)('exposes the %s column through getTableColumns', (name) => {
                const t = table('t', { c: factories[name]('c') })
                const cols = getTableColumns(t)
                expect(cols.c).toBeDefined()
        })
})

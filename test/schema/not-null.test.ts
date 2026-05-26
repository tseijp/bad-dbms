import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'
// schema rework: attack the not-null constraint against the correct Drizzle
// spec, not the bad-dbms `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a column exposes its not-null state on the public `notNull` boolean.
//     When unset it is strictly `false` (the column is nullable), never
//     `undefined`. bad-dbms leaves `$col.notNull` as `true | undefined`.
//   * a primary-key column is implicitly NOT NULL even without `.notNull()`.
// These follow the Drizzle spec; the assertions fail honestly and are never
// weakened to the implementation.
const factories = { integer, uint, float, text }
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
describe('not null constraint', () => {
        it.each(factoryNames)('marks the %s column not-null on the public flag', (name) => {
                const t = table('t', { name: factories[name]('name').notNull() })
                expect(t.name.notNull).toBe(true)
        })
        it.each(factoryNames)('reports a plain %s column as strictly nullable', (name) => {
                const t = table('t', { name: factories[name]('name') })
                expect(t.name.notNull).toBe(false)
        })
        it('reports an unset not-null flag as a real boolean, not undefined', () => {
                const t = table('t', { name: integer('name') })
                expect(typeof t.name.notNull).toBe('boolean')
        })
        it('treats a primary-key column as implicitly not null', () => {
                const t = table('t', { id: integer('id').primaryKey() })
                expect(t.id.notNull).toBe(true)
        })
        it('keeps a primary-key column not null with explicit notNull()', () => {
                const t = table('t', { id: integer('id').primaryKey().notNull() })
                expect(t.id.notNull).toBe(true)
        })
        it('sets not-null regardless of chain order with primaryKey', () => {
                const t = table('t', { id: integer('id').notNull().primaryKey() })
                expect(t.id.notNull).toBe(true)
        })
        it('sets not-null with notNull().unique()', () => {
                const t = table('t', { id: integer('id').notNull().unique() })
                expect(t.id.notNull).toBe(true)
        })
        it('keeps a unique column nullable when notNull is not declared', () => {
                const t = table('t', { id: integer('id').unique() })
                expect(t.id.notNull).toBe(false)
        })
        it('sets not-null with notNull().default()', () => {
                const t = table('t', { score: integer('score').notNull().default(3) })
                expect(t.score.notNull).toBe(true)
        })
        it('marks both columns chaining notNull', () => {
                const t = table('t', {
                        a: integer('a').notNull(),
                        b: integer('b').notNull(),
                })
                expect([t.a.notNull, t.b.notNull]).toEqual([true, true])
        })
        it('keeps a nullable column nullable beside a not-null sibling', () => {
                const t = table('t', { a: integer('a').notNull(), b: integer('b') })
                expect([t.a.notNull, t.b.notNull]).toEqual([true, false])
        })
})

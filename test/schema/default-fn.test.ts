import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'
// schema rework: attack the functional-default constraint against the correct
// Drizzle spec, not the bad-dbms `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * `$defaultFn(fn)` registers a runtime default generator exposed on the
//     public `defaultFn` property; the column also reports `hasDefault` true.
//   * `defaultFn` is the documented alias of `$defaultFn` — same method.
//   * a plain column has `hasDefault` strictly `false`, never `undefined`.
// bad-dbms records `$col.defaultFn` only, so these fail honestly and are
// never weakened to the implementation.
const factories = { integer, uint, float, text } as const
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']
describe('functional default', () => {
        it('records a $defaultFn returning 42 on the public defaultFn property', () => {
                const t = table('t', { seq: integer('seq').$defaultFn(() => 42) })
                expect(t.seq.defaultFn()).toBe(42)
        })
        it('marks hasDefault true on a column with a $defaultFn', () => {
                const t = table('t', { seq: integer('seq').$defaultFn(() => 1) })
                expect(t.seq.hasDefault).toBe(true)
        })
        it('records a $defaultFn whose first call returns 1', () => {
                let n = 0
                const t = table('t', { seq: integer('seq').$defaultFn(() => ++n) })
                expect(t.seq.defaultFn()).toBe(1)
        })
        it('records a $defaultFn whose second call returns 2', () => {
                let n = 0
                const t = table('t', { seq: integer('seq').$defaultFn(() => ++n) })
                const fn = t.seq.defaultFn
                fn()
                expect(fn()).toBe(2)
        })
        it('records a defaultFn alias returning 9', () => {
                const t = table('t', { seq: integer('seq').defaultFn(() => 9) })
                expect(t.seq.defaultFn()).toBe(9)
        })
        it('treats defaultFn alias as the same method as $defaultFn', () => {
                const c = integer('seq')
                expect(c.defaultFn).toBe(c.$defaultFn)
        })
        it.each(factoryNames)('records a $defaultFn on a %s column', (name) => {
                const t = table('t', { seq: factories[name]('seq').$defaultFn(() => 5) })
                expect(t.seq.defaultFn()).toBe(5)
        })
        it.each(factoryNames)('marks hasDefault strictly false on a plain %s column', (name) => {
                const t = table('t', { seq: factories[name]('seq') })
                expect(t.seq.hasDefault).toBe(false)
        })
        it('records a $defaultFn alongside notNull', () => {
                const t = table('t', {
                        seq: integer('seq')
                                .notNull()
                                .$defaultFn(() => 3),
                })
                expect(t.seq.defaultFn()).toBe(3)
        })
        it('records a $defaultFn alongside primaryKey', () => {
                const t = table('t', {
                        seq: integer('seq')
                                .primaryKey()
                                .$defaultFn(() => 8),
                })
                expect(t.seq.defaultFn()).toBe(8)
        })
        it('records a string-producing $defaultFn on a text column', () => {
                const t = table('t', { id: text('id').$defaultFn(() => 'uuid-x') })
                expect(t.id.defaultFn()).toBe('uuid-x')
        })
})

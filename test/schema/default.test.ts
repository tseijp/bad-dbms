import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'

// schema rework: attack the default-value constraint against the correct
// Drizzle spec, not the bad-dbms `$col` descriptor shape.
//
// Drizzle-guaranteed behaviour bad-dbms is expected to miss:
//   * a column exposes its default on the public `default` property and a
//     `hasDefault` boolean. `hasDefault` is strictly `false` when no default
//     is declared, never `undefined`.
//   * declaring `.default(0)` sets `hasDefault` true even though the value 0
//     is falsy — presence is tracked separately from the value.
// bad-dbms records `$col.defaultValue` only, so these fail honestly and are
// never weakened to the implementation.

const factories = { integer, uint, float, text } as const
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']

const intDefaults: Array<[string, number]> = [
        ['positive', 7],
        ['zero', 0],
        ['one', 1],
        ['negative', -5],
        ['large', 1000000],
        ['negative large', -999999],
]

const floatDefaults: Array<[string, number]> = [
        ['zero', 0],
        ['fraction', 0.5],
        ['negative fraction', -1.25],
        ['pi-ish', 3.14159],
        ['large fraction', 12345.678],
]

describe('default value', () => {
        it.each(intDefaults)('records a %s default on the public default property', (_label, value) => {
                const t = table('t', { score: integer('score').default(value) })
                expect((t as any).score.default).toBe(value)
        })

        it.each(intDefaults)('records a %s default on a uint column', (_label, value) => {
                const t = table('t', { score: uint('score').default(value) })
                expect((t as any).score.default).toBe(value)
        })

        it.each(floatDefaults)('records a %s default on a float column', (_label, value) => {
                const t = table('t', { score: float('score').default(value) })
                expect((t as any).score.default).toBe(value)
        })

        it.each(factoryNames)('marks hasDefault true on a %s column with a default', (name) => {
                const t = table('t', { score: factories[name]('score').default(1 as any) })
                expect((t as any).score.hasDefault).toBe(true)
        })

        it('marks hasDefault true even when the default value is the falsy 0', () => {
                const t = table('t', { score: integer('score').default(0) })
                expect((t as any).score.hasDefault).toBe(true)
        })

        it.each(factoryNames)('marks hasDefault strictly false on a plain %s column', (name) => {
                const t = table('t', { score: factories[name]('score') })
                expect((t as any).score.hasDefault).toBe(false)
        })

        it('reports hasDefault as a real boolean, not undefined', () => {
                const t = table('t', { score: integer('score') })
                expect(typeof (t as any).score.hasDefault).toBe('boolean')
        })

        it('records the not-null flag with notNull().default()', () => {
                const t = table('t', { score: integer('score').notNull().default(3) })
                expect((t as any).score.notNull).toBe(true)
        })

        it('records the default value with notNull().default()', () => {
                const t = table('t', { score: integer('score').notNull().default(3) })
                expect((t as any).score.default).toBe(3)
        })

        it('records the default value with default().notNull()', () => {
                const t = table('t', { score: integer('score').default(9).notNull() })
                expect((t as any).score.default).toBe(9)
        })

        it('records the default value alongside primaryKey', () => {
                const t = table('t', { score: integer('score').primaryKey().default(2) })
                expect((t as any).score.default).toBe(2)
        })

        it('records the default value with unique().default()', () => {
                const t = table('t', { score: integer('score').unique().default(4) })
                expect((t as any).score.default).toBe(4)
        })

        it('records a string default on a text column', () => {
                const t = table('t', { label: text('label').default('none') })
                expect((t as any).label.default).toBe('none')
        })
})

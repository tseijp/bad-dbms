import { describe, it, expect } from 'vitest'
import { table, integer, uint, float, text } from '../../src/index'

// schema rework note: `.order(min, max)` is a bad-dbms-specific column
// extension with NO Drizzle equivalent — it declares an init-time value range
// for generated rows. There is no Drizzle parity to attack here, so this file
// only verifies the extension records and exposes its own declared contract.
// It is intentionally the smallest describe in the schema suite; the genuine
// Drizzle-parity attack lives in the constraint and introspection files.
//
// The one Drizzle-relative assertion still made: `.order()` must not silently
// change a column's nullability or other public constraint state.

const factories = { integer, uint, float, text } as const
type FactoryName = keyof typeof factories
const factoryNames: FactoryName[] = ['integer', 'uint', 'float', 'text']

const ranges: Array<[number, number]> = [
        [0, 1],
        [0, 16],
        [1, 256],
        [-8, 8],
        [10, 1000],
]

describe('order extension (bad-dbms specific, no Drizzle parity)', () => {
        it('returns a chainable column from order()', () => {
                const c = integer('x').order(0, 16)
                expect(typeof c.notNull).toBe('function')
        })

        it.each(ranges)('keeps order(%i, %i) chainable into a constraint', (min, max) => {
                const t = table('t', { x: integer('x').order(min, max).notNull() })
                expect((t as any).x.notNull).toBe(true)
        })

        it('does not make an order column not-null as a side effect', () => {
                const t = table('t', { x: integer('x').order(0, 16) })
                expect((t as any).x.notNull).toBe(false)
        })

        it('does not make an order column unique as a side effect', () => {
                const t = table('t', { x: integer('x').order(0, 16) })
                expect((t as any).x.isUnique).toBe(false)
        })

        it('does not make an order column primary as a side effect', () => {
                const t = table('t', { x: integer('x').order(0, 16) })
                expect((t as any).x.primary).toBe(false)
        })

        it.each(factoryNames)('keeps an order %s column declarable inside a table', (name) => {
                const t = table('t', { x: factories[name]('x').order(0, 4) })
                expect((t as any).x).toBeDefined()
        })
})

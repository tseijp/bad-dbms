import { describe, it, expect } from 'vitest'
import { evalNode, compilePredicate, compileExpr } from '../../src/interface/compile'
import { lit, col, bin, un, fn, ctx0 } from './_helpers'
describe('evalNode primitives', () => {
        it('literal returns its value', () => {
                expect(evalNode({ type: 'literal', value: 5 }, {}, ctx0())).toBe(5)
        })
        it('column reads row by name', () => {
                expect(evalNode({ type: 'column', name: 'a', tableName: 't' }, { a: 7 }, ctx0())).toBe(7)
        })
})
describe('evalNode arithmetic binops', () => {
        it('+ adds operands', () => {
                expect(evalNode(bin('+', lit(2), lit(3)).node, {}, ctx0())).toBe(5)
        })
        it('- subtracts operands', () => {
                expect(evalNode(bin('-', lit(5), lit(3)).node, {}, ctx0())).toBe(2)
        })
        it('* multiplies operands', () => {
                expect(evalNode(bin('*', lit(2), lit(3)).node, {}, ctx0())).toBe(6)
        })
        it('/ divides operands', () => {
                expect(evalNode(bin('/', lit(6), lit(2)).node, {}, ctx0())).toBe(3)
        })
        it('% takes modulo', () => {
                expect(evalNode(bin('%', lit(7), lit(3)).node, {}, ctx0())).toBe(1)
        })
})
describe('evalNode comparison binops', () => {
        it('= compares equality', () => {
                expect(evalNode(bin('=', lit(1), lit(1)).node, {}, ctx0())).toBe(true)
        })
        it('!= compares inequality', () => {
                expect(evalNode(bin('!=', lit(1), lit(2)).node, {}, ctx0())).toBe(true)
        })
        it('< compares less than', () => {
                expect(evalNode(bin('<', lit(1), lit(2)).node, {}, ctx0())).toBe(true)
        })
        it('<= compares less than or equal', () => {
                expect(evalNode(bin('<=', lit(2), lit(2)).node, {}, ctx0())).toBe(true)
        })
        it('> compares greater than', () => {
                expect(evalNode(bin('>', lit(3), lit(2)).node, {}, ctx0())).toBe(true)
        })
        it('>= compares greater than or equal', () => {
                expect(evalNode(bin('>=', lit(2), lit(2)).node, {}, ctx0())).toBe(true)
        })
})
describe('evalNode logical binops (variadic)', () => {
        it('and is true when all args are truthy', () => {
                expect(evalNode(bin('and', lit(true), lit(1), lit('x')).node, {}, ctx0())).toBe(true)
        })
        it('and is false when any arg is falsy', () => {
                expect(evalNode(bin('and', lit(true), lit(0)).node, {}, ctx0())).toBe(false)
        })
        it('or is true when any arg is truthy', () => {
                expect(evalNode(bin('or', lit(false), lit(0), lit(1)).node, {}, ctx0())).toBe(true)
        })
        it('or is false when all args are falsy', () => {
                expect(evalNode(bin('or', lit(false), lit(0)).node, {}, ctx0())).toBe(false)
        })
})
describe('evalNode unop and func', () => {
        it('not negates child value', () => {
                expect(evalNode(un('not', lit(false)).node, {}, ctx0())).toBe(true)
        })
        it('between checks lo <= v <= hi', () => {
                expect(evalNode(fn('between', lit(5), lit(1), lit(10)).node, {}, ctx0())).toBe(true)
        })
        it('toFloat coerces child via Number', () => {
                expect(evalNode(fn('toFloat', lit('3.5')).node, {}, ctx0())).toBe(3.5)
        })
})
describe('evalNode currentTuple', () => {
        it('returns ctx.current[col]', () => {
                const ctx = { current: { id: 42 }, params: null }
                expect(evalNode({ type: 'currentTuple', col: 'id', tableName: 't' }, {}, ctx)).toBe(42)
        })
        it('returns undefined when ctx.current is null', () => {
                expect(evalNode({ type: 'currentTuple', col: 'id', tableName: 't' }, {}, ctx0())).toBeUndefined()
        })
        it('does not look at row when only col is referenced', () => {
                const ctx = { current: { id: 99 }, params: null }
                expect(evalNode({ type: 'currentTuple', col: 'id', tableName: 'other' }, { id: 1 }, ctx)).toBe(99)
        })
})
describe('compilePredicate / compileExpr', () => {
        it('compilePredicate yields function returning boolean', () => {
                const p = compilePredicate(col('a'), { current: null, params: null })
                expect(p({ a: 1 })).toBe(true)
        })
        it('compileExpr on SQL wrapper evaluates against row', () => {
                const f = compileExpr(col('a'), { current: null, params: null })
                expect(f({ a: 7 })).toBe(7)
        })
})
// Roadmap: subquery / EXISTS / CTE / window function (RANK, ROW_NUMBER) /
// NULLS FIRST / DISTINCT ON / GROUPING SETS evalNode paths are not
// implemented and therefore not tested here.

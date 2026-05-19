import { describe, it, expect } from 'vitest'
import {
        eq,
        ne,
        lt,
        lte,
        gt,
        gte,
        and,
        or,
        not,
        between,
        inArray,
        isNull,
        isNotNull,
} from '../../src/interface/expressions/conditions'
import { asc, desc } from '../../src/interface/expressions/select'

const wrappedLit = (value: any) => ({ kind: 'sql', node: { type: 'literal', value } })

describe('comparison binops', () => {
        it('eq emits binop with op = and wraps both literal operands via wrap()', () => {
                const e: any = eq(1, 2)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '=',
                        args: [wrappedLit(1), wrappedLit(2)],
                })
        })

        it('ne emits binop with op != and wrapped operands', () => {
                const e: any = ne(1, 2)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '!=',
                        args: [wrappedLit(1), wrappedLit(2)],
                })
        })

        it('lt emits binop with op < and wrapped operands', () => {
                const e: any = lt(1, 2)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '<',
                        args: [wrappedLit(1), wrappedLit(2)],
                })
        })

        it('lte emits binop with op <= and wrapped operands', () => {
                const e: any = lte(1, 2)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '<=',
                        args: [wrappedLit(1), wrappedLit(2)],
                })
        })

        it('gt emits binop with op > and wrapped operands', () => {
                const e: any = gt(2, 1)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '>',
                        args: [wrappedLit(2), wrappedLit(1)],
                })
        })

        it('gte emits binop with op >= and wrapped operands', () => {
                const e: any = gte(2, 1)
                expect(e.node).toMatchObject({
                        type: 'binop',
                        op: '>=',
                        args: [wrappedLit(2), wrappedLit(1)],
                })
        })

        it('passes an already-SQL operand through wrap by identity (no double-wrap)', () => {
                const inner: any = eq(1, 1)
                const outer: any = ne(inner, 0)
                expect(outer.node.args[0]).toBe(inner)
        })
})

describe('logical combinators', () => {
        it('and filters out undefined args and keeps remaining SQL wrappers as-is', () => {
                const left: any = eq(1, 1)
                const right: any = eq(2, 2)
                const e: any = and(left, undefined, right)
                expect(e.node).toMatchObject({ type: 'binop', op: 'and', args: [left, right] })
        })

        it('and with a single defined arg returns that arg unwrapped (no nested binop)', () => {
                const only: any = eq(1, 1)
                expect(and(only, undefined)).toBe(only)
        })

        it('or filters out undefined args and keeps remaining SQL wrappers as-is', () => {
                const left: any = eq(1, 1)
                const right: any = eq(2, 2)
                const e: any = or(left, undefined, right)
                expect(e.node).toMatchObject({ type: 'binop', op: 'or', args: [left, right] })
        })

        it('not wraps the predicate into a unop with op not and the arg passed through', () => {
                const inner: any = eq(1, 1)
                const e: any = not(inner)
                expect(e.node).toEqual({ type: 'unop', op: 'not', args: [inner] })
        })
})

describe('range and list predicates', () => {
        it('between emits func between with three wrapped args in order', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = between(col, 1, 10)
                expect(e.node).toMatchObject({
                        type: 'func',
                        name: 'between',
                        args: [col, wrappedLit(1), wrappedLit(10)],
                })
        })

        it('inArray emits binop in with values list wrapped element-wise', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = inArray(col, [1, 2, 3])
                expect(e.node.op).toBe('in')
                expect(e.node.args[0]).toBe(col)
                expect(e.node.args[1].node).toEqual({
                        type: 'list',
                        items: [wrappedLit(1), wrappedLit(2), wrappedLit(3)],
                })
        })
})

describe('null predicates', () => {
        it('isNull emits unop isNull with arg passed through', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = isNull(col)
                expect(e.node).toEqual({ type: 'unop', op: 'isNull', args: [col] })
        })

        it('isNotNull emits unop isNotNull with arg passed through', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = isNotNull(col)
                expect(e.node).toEqual({ type: 'unop', op: 'isNotNull', args: [col] })
        })
})

describe('order helpers', () => {
        it('asc emits order node with dir asc and the col passed through', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((asc(col) as any).node).toEqual({ type: 'order', dir: 'asc', col })
        })

        it('desc emits order node with dir desc and the col passed through', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((desc(col) as any).node).toEqual({ type: 'order', dir: 'desc', col })
        })
})

// Roadmap: subquery / EXISTS / NOT EXISTS / CTE / window function /
// NULLS FIRST / DISTINCT ON / GROUPING SETS / update().from() join /
// on conflict are out of scope here.

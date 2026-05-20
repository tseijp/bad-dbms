import { describe, it, expect } from 'vitest'
import { sql, raw, identifier, placeholder, param, isSQL, wrap, join } from '../../src/interface/sql'

const wrappedLit = (value: any) => ({ kind: 'sql', node: { type: 'literal', value } })

describe('sql template tag', () => {
        it('packs string parts and values into a list node with raw + wrapped literal items', () => {
                const s = sql`a ${1} b`
                expect(s.kind).toBe('sql')
                expect(s.node.type).toBe('list')
                const items = s.node.items
                expect(items.length).toBe(3)
                expect(items[0].node).toEqual({ type: 'raw', value: 'a ' })
                expect(items[1].node).toEqual({ type: 'literal', value: 1 })
                expect(items[2].node).toEqual({ type: 'raw', value: ' b' })
        })
})

describe('factories', () => {
        it('raw wraps string into raw SqlNode', () => {
                expect(raw('hello').node).toEqual({ type: 'raw', value: 'hello' })
        })

        it('identifier wraps name into identifier SqlNode', () => {
                expect(identifier('foo').node).toEqual({ type: 'identifier', name: 'foo' })
        })

        it('placeholder wraps name into placeholder SqlNode', () => {
                expect((placeholder('p') as any).node).toEqual({ type: 'placeholder', name: 'p' })
        })

        it('param wraps value into literal SqlNode preserving the value', () => {
                expect(param(5).node).toEqual({ type: 'literal', value: 5 })
        })
})

describe('isSQL', () => {
        it('returns true for SQL wrapper', () => {
                expect(isSQL(raw('x'))).toBe(true)
        })

        it('returns false for a plain SqlNode (missing kind:sql envelope)', () => {
                expect(isSQL({ type: 'literal', value: 1 })).toBe(false)
        })
})

describe('wrap', () => {
        it('wraps scalar into a literal SQL wrapper preserving the value', () => {
                expect(wrap(7).node).toEqual({ type: 'literal', value: 7 })
        })

        it('returns the same reference for an already-SQL input (identity, no copy)', () => {
                const r = raw('x')
                expect(wrap(r)).toBe(r)
        })
})

describe('join', () => {
        it('interleaves separator between every adjacent chunk and wraps both', () => {
                const s = join([1, 2, 3], ',')
                expect(s.node.type).toBe('list')
                const items = s.node.items.map((it: any) => it.node)
                expect(items).toEqual([
                        { type: 'literal', value: 1 },
                        { type: 'literal', value: ',' },
                        { type: 'literal', value: 2 },
                        { type: 'literal', value: ',' },
                        { type: 'literal', value: 3 },
                ])
        })
})

describe('chain methods on SQL wrapper', () => {
        it('add(literal) emits binop + with [receiver, wrap(literal)] in that order', () => {
                const recv = wrap(10)
                const s = recv.add!(2)
                expect(s.node.type).toBe('binop')
                expect(s.node.op).toBe('+')
                expect(s.node.args[0]).toBe(recv)
                expect(s.node.args[1].kind).toBe('sql')
                expect(s.node.args[1].node).toEqual({ type: 'literal', value: 2 })
        })

        it('returned wrapper from a chain step also exposes chain methods (chainability)', () => {
                const s = wrap(1).add!(2).sub!(1)
                expect(s.node.op).toBe('-')
                expect(typeof s.add).toBe('function')
                expect(typeof s.sub).toBe('function')
        })
})

// Roadmap: subquery, EXISTS, CTE, window function, NULLS FIRST, DISTINCT ON,
// GROUPING SETS, update().from() join, on conflict, string dictionary encoding
// are out of scope for sql.ts tests.

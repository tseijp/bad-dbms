import { describe, it, expect } from 'vitest'
import { integer, uint, float, text } from '../../src/interface/column'
import { eq } from '../../src/interface/expressions/conditions'
describe('column factories', () => {
        it('integer returns column with type i32', () => {
                expect(integer('a').$col.type).toBe('i32')
        })
        it('uint returns column with type u32', () => {
                expect(uint('a').$col.type).toBe('u32')
        })
        it('float returns column with type f32', () => {
                expect(float('a').$col.type).toBe('f32')
        })
        it('text returns column with type u32 and tag str', () => {
                const c = text('a').$col
                expect(c.type).toBe('u32')
                expect(c.tag).toBe('str')
        })
        it('factories are callable without name', () => {
                expect(integer().$col.name).toBe('')
        })
})
describe('constraint chain methods', () => {
        it('.primaryKey sets isPrimary equivalent flag', () => {
                expect((integer('id').primaryKey() as any).$col.primaryKey).toBe(true)
        })
        it('.unique sets unique flag', () => {
                expect((integer('id').unique() as any).$col.unique).toBe(true)
        })
        it('.notNull sets notNull flag', () => {
                expect((integer('id').notNull() as any).$col.notNull).toBe(true)
        })
        it('.default sets defaultValue', () => {
                expect((integer('id').default(7) as any).$col.defaultValue).toBe(7)
        })
        it('.$defaultFn stores callable defaultFn', () => {
                const f = () => 42
                const c = (integer('id') as any).$defaultFn(f)
                expect(c.$col.defaultFn).toBe(f)
        })
        it('.defaultFn alias also stores callable defaultFn', () => {
                const f = () => 42
                const c = (integer('id') as any).defaultFn(f)
                expect(typeof c.$col.defaultFn).toBe('function')
        })
        it('.references stores lazy resolver', () => {
                const other: any = integer('other')
                const c = (integer('id') as any).references(() => other)
                expect(typeof c.$col.references.fn).toBe('function')
        })
        it('.order sets hasOrder and orderRange', () => {
                const c = (integer('id') as any).order(0, 100)
                expect(c.$col.hasOrder).toBe(true)
                expect(c.$col.orderRange).toEqual([0, 100])
        })
})
describe('column as SQL expression', () => {
        it('eq(col, literal) emits binop = with column on left and wrapped literal on right', () => {
                const c: any = integer('id')
                const node: any = (eq(c, 1) as any).node
                expect(node.type).toBe('binop')
                expect(node.op).toBe('=')
                expect(node.args[0]).toBe(c)
                expect(node.args[1].kind).toBe('sql')
                expect(node.args[1].node).toEqual({ type: 'literal', value: 1 })
        })
        it('col.add(literal) emits binop + with column on left and wrapped literal on right', () => {
                const c: any = integer('id')
                const expr: any = c.add(1)
                expect(expr.node.type).toBe('binop')
                expect(expr.node.op).toBe('+')
                expect(expr.node.args[0]).toBe(c)
                expect(expr.node.args[1].kind).toBe('sql')
                expect(expr.node.args[1].node).toEqual({ type: 'literal', value: 1 })
        })
})
// Roadmap: string dictionary encoding ($col.tag === 'str' mapped to dictionary
// heap) is not yet enforced at the column factory level.

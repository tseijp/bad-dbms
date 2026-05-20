import { describe, it, expect } from 'vitest'
import { count, countDistinct, avg, avgDistinct, sum, sumDistinct, min, max } from '../../src/interface/functions/aggregate'
import { l1Distance, l2Distance, cosineDistance, innerProduct, hammingDistance, jaccardDistance } from '../../src/interface/functions/vector'
describe('aggregate factories', () => {
        it('count() emits aggregate name=count, distinct=false, args=[] (zero-arg variant)', () => {
                const e: any = count()
                expect(e.node).toEqual({ type: 'aggregate', name: 'count', distinct: false, args: [] })
        })
        it('count(col) emits aggregate name=count, distinct=false, args=[col passed through wrap]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = count(col)
                expect(e.node).toEqual({ type: 'aggregate', name: 'count', distinct: false, args: [col] })
        })
        it('countDistinct emits aggregate with distinct=true and the col arg passed through', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                const e: any = countDistinct(col)
                expect(e.node).toEqual({ type: 'aggregate', name: 'count', distinct: true, args: [col] })
        })
        it('sum emits aggregate name=sum, distinct=false, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((sum(col) as any).node).toEqual({ type: 'aggregate', name: 'sum', distinct: false, args: [col] })
        })
        it('sumDistinct emits aggregate name=sum, distinct=true, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((sumDistinct(col) as any).node).toEqual({ type: 'aggregate', name: 'sum', distinct: true, args: [col] })
        })
        it('avg emits aggregate name=avg, distinct=false, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((avg(col) as any).node).toEqual({ type: 'aggregate', name: 'avg', distinct: false, args: [col] })
        })
        it('avgDistinct emits aggregate name=avg, distinct=true, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((avgDistinct(col) as any).node).toEqual({ type: 'aggregate', name: 'avg', distinct: true, args: [col] })
        })
        it('min emits aggregate name=min, distinct=false, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((min(col) as any).node).toEqual({ type: 'aggregate', name: 'min', distinct: false, args: [col] })
        })
        it('max emits aggregate name=max, distinct=false, args=[col]', () => {
                const col: any = { kind: 'sql', node: { type: 'column', name: 'x' } }
                expect((max(col) as any).node).toEqual({ type: 'aggregate', name: 'max', distinct: false, args: [col] })
        })
})
describe('vector distance factories', () => {
        const col: any = { kind: 'sql', node: { type: 'column', name: 'v' } }
        const wrappedVec = { kind: 'sql', node: { type: 'literal', value: [1, 2] } }
        it('l2Distance emits func l2Distance with [col, wrapped vec] args', () => {
                const e: any = l2Distance(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'l2Distance', args: [col, wrappedVec] })
        })
        it('l1Distance emits func l1Distance with [col, wrapped vec] args', () => {
                const e: any = l1Distance(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'l1Distance', args: [col, wrappedVec] })
        })
        it('cosineDistance emits func cosineDistance with [col, wrapped vec] args', () => {
                const e: any = cosineDistance(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'cosineDistance', args: [col, wrappedVec] })
        })
        it('innerProduct emits func innerProduct with [col, wrapped vec] args', () => {
                const e: any = innerProduct(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'innerProduct', args: [col, wrappedVec] })
        })
        it('hammingDistance emits func hammingDistance with [col, wrapped vec] args', () => {
                const e: any = hammingDistance(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'hammingDistance', args: [col, wrappedVec] })
        })
        it('jaccardDistance emits func jaccardDistance with [col, wrapped vec] args', () => {
                const e: any = jaccardDistance(col, [1, 2])
                expect(e.node).toMatchObject({ type: 'func', name: 'jaccardDistance', args: [col, wrappedVec] })
        })
})
// Roadmap: window functions (RANK, ROW_NUMBER, LAG, LEAD ...) and
// GROUPING SETS aggregates are out of scope for functions tests.

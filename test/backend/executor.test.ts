import { describe, it, expect } from 'vitest'
import { evalNode } from '../../src/backend/executor'
import { makeExecutor, usersDef, insertRows, drainIter } from './_helpers'
const seedUsers = (rows: any[]) => {
        const stack = makeExecutor()
        stack.catalog.register('users', usersDef)
        insertRows(stack.catalog, 'users', rows)
        return stack
}
describe('executor SeqScan', () => {
        it('emits every alive row from the first column heap', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const rows = drainIter(executor.execute({ op: 'SeqScan', table: 'users' }))
                expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
        })
})
describe('executor Filter', () => {
        it('keeps only rows where predicate returns true', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Filter',
                                child: { op: 'SeqScan', table: 'users' },
                                predicate: (r: any) => r.id >= 2,
                        }),
                )
                expect(rows.map((r) => r.id)).toEqual([2, 3])
        })
})
describe('executor Projection', () => {
        it('returns an object with exactly the requested fields and matching values from child', () => {
                const { executor } = seedUsers([{ id: 1, name: 11, score: 999 }])
                const rows = drainIter(
                        executor.execute({
                                op: 'Projection',
                                child: { op: 'SeqScan', table: 'users' },
                                fields: ['id', 'name'],
                        }),
                )
                expect(rows[0]).toEqual({ id: 1, name: 11 })
        })
})
describe('executor Sort', () => {
        it('orders rows by the configured key direction', () => {
                const { executor } = seedUsers([
                        { id: 3, name: 3, score: 3 },
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Sort',
                                child: { op: 'SeqScan', table: 'users' },
                                keys: [{ field: 'id', dir: 'asc' }],
                        }),
                )
                expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
        })
})
describe('executor Aggregate count', () => {
        it('returns one row with the input row count', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 'c', kind: 'count', field: '' }],
                        }),
                )
                expect(rows).toEqual([{ c: 3 }])
        })
})
describe('executor Aggregate sum/avg/min/max', () => {
        it('computes sum over the named field', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 0, score: 10 },
                        { id: 2, name: 0, score: 20 },
                        { id: 3, name: 0, score: 30 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 's', kind: 'sum', field: 'score' }],
                        }),
                )
                expect(rows[0].s).toBe(60)
        })
        it('computes avg as sum/count', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 0, score: 10 },
                        { id: 2, name: 0, score: 20 },
                        { id: 3, name: 0, score: 30 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 'a', kind: 'avg', field: 'score' }],
                        }),
                )
                expect(rows[0].a).toBe(20)
        })
        it('computes min as the smallest value', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 0, score: 10 },
                        { id: 2, name: 0, score: 5 },
                        { id: 3, name: 0, score: 30 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 'm', kind: 'min', field: 'score' }],
                        }),
                )
                expect(rows[0].m).toBe(5)
        })
        it('computes max as the largest value', () => {
                const { executor } = seedUsers([
                        { id: 1, name: 0, score: 10 },
                        { id: 2, name: 0, score: 50 },
                        { id: 3, name: 0, score: 30 },
                ])
                const rows = drainIter(
                        executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 'm', kind: 'max', field: 'score' }],
                        }),
                )
                expect(rows[0].m).toBe(50)
        })
})
describe('executor Aggregate groupBy', () => {
        it('emits one row per groupBy key with the group key field set', () => {
                const stack = makeExecutor()
                stack.catalog.register('orders', { userId: { type: 'i32' }, amount: { type: 'i32' } })
                insertRows(stack.catalog, 'orders', [
                        { userId: 1, amount: 10 },
                        { userId: 1, amount: 20 },
                        { userId: 2, amount: 5 },
                ])
                const rows = drainIter(
                        stack.executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'orders' },
                                groupBy: ['userId'],
                                aggs: [{ name: 'total', kind: 'sum', field: 'amount' }],
                        }),
                )
                const byUser = new Map(rows.map((r: any) => [r.userId, r.total]))
                expect(byUser).toEqual(
                        new Map([
                                [1, 30],
                                [2, 5],
                        ]),
                )
        })
})
describe('executor Aggregate synthetic zero row', () => {
        it('emits 1 row with count=0 when input is empty and groupBy is empty', () => {
                const stack = makeExecutor()
                stack.catalog.register('users', usersDef)
                const rows = drainIter(
                        stack.executor.execute({
                                op: 'Aggregate',
                                child: { op: 'SeqScan', table: 'users' },
                                groupBy: [],
                                aggs: [{ name: 'c', kind: 'count', field: '' }],
                        }),
                )
                expect(rows).toEqual([{ c: 0 }])
        })
})
describe('executor NestedLoopJoin', () => {
        it('emits merged rows where predicate is true across the cross product', () => {
                const stack = makeExecutor()
                stack.catalog.register('a', { x: { type: 'i32' } })
                stack.catalog.register('b', { y: { type: 'i32' } })
                insertRows(stack.catalog, 'a', [{ x: 1 }, { x: 2 }])
                insertRows(stack.catalog, 'b', [{ y: 1 }, { y: 3 }])
                const rows = drainIter(
                        stack.executor.execute({
                                op: 'NestedLoopJoin',
                                left: { op: 'SeqScan', table: 'a' },
                                right: { op: 'SeqScan', table: 'b' },
                                predicate: (l: any, r: any) => l.x === r.y,
                        }),
                )
                expect(rows.map((r: any) => [r.x, r.y])).toEqual([[1, 1]])
        })
})
describe('executor HashJoin', () => {
        it('joins on leftKey === rightKey emitting merged x and y per match', () => {
                const stack = makeExecutor()
                stack.catalog.register('a', { x: { type: 'i32' } })
                stack.catalog.register('b', { y: { type: 'i32' } })
                insertRows(stack.catalog, 'a', [{ x: 1 }, { x: 2 }, { x: 3 }])
                insertRows(stack.catalog, 'b', [{ y: 2 }, { y: 3 }, { y: 4 }])
                const rows = drainIter(
                        stack.executor.execute({
                                op: 'HashJoin',
                                left: { op: 'SeqScan', table: 'a' },
                                right: { op: 'SeqScan', table: 'b' },
                                leftKey: 'x',
                                rightKey: 'y',
                        }),
                )
                const merged = rows.map((r: any) => [r.x, r.y]).sort((p: any, q: any) => p[0] - q[0])
                expect(merged).toEqual([
                        [2, 2],
                        [3, 3],
                ])
        })
})
describe('executor Update', () => {
        it('updates column heaps for predicate-matching rows and reports updated count', () => {
                const { executor, catalog } = seedUsers([
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const out = drainIter(
                        executor.execute({
                                op: 'Update',
                                table: 'users',
                                predicate: (r: any) => r.id === 2,
                                setters: { score: () => 99 },
                        }),
                )
                const rel = catalog.resolve('users')
                const after: number[] = []
                rel.heaps[2].scan((_rid: any, v: any) => void after.push(v))
                expect({ out: out[0], after }).toEqual({ out: { updated: 1 }, after: [1, 99, 3] })
        })
})
describe('executor Delete', () => {
        it('dispatches delete to every column heap and reports deleted count', () => {
                const { executor, catalog } = seedUsers([
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const out = drainIter(
                        executor.execute({
                                op: 'Delete',
                                table: 'users',
                                predicate: (r: any) => r.id === 2,
                        }),
                )
                const rel = catalog.resolve('users')
                const remaining: number[] = []
                rel.heaps[0].scan((_rid: any, v: any) => void remaining.push(v))
                expect({ out: out[0], remaining }).toEqual({ out: { deleted: 1 }, remaining: [1, 3] })
        })
})
describe('executor Insert', () => {
        it('calls catalog.insertRow per value and returns rowCount', () => {
                const stack = makeExecutor()
                stack.catalog.register('users', usersDef)
                const out = drainIter(
                        stack.executor.execute({
                                op: 'Insert',
                                table: 'users',
                                values: [
                                        { id: 1, name: 1, score: 1 },
                                        { id: 2, name: 2, score: 2 },
                                ],
                        }),
                )
                expect(out[0]).toEqual({ rowCount: 2 })
        })
        it('exposes rids when returning is true', () => {
                const stack = makeExecutor()
                stack.catalog.register('users', usersDef)
                const out = drainIter(
                        stack.executor.execute({
                                op: 'Insert',
                                table: 'users',
                                values: [{ id: 1, name: 1, score: 1 }],
                                returning: true,
                        }),
                )
                expect(Array.isArray(out[0].rids)).toBe(true)
        })
})
describe('evalNode primitive nodes', () => {
        it('returns the value of a literal node', () => {
                expect(evalNode({ type: 'literal', value: 42 }, null)).toBe(42)
        })
        it('reads column value from the supplied row', () => {
                expect(evalNode({ type: 'column', name: 'id' }, { id: 7 })).toBe(7)
        })
        it('evaluates binop via args[] when no left/right is given', () => {
                expect(
                        evalNode(
                                {
                                        type: 'binop',
                                        op: '+',
                                        args: [
                                                { type: 'literal', value: 2 },
                                                { type: 'literal', value: 3 },
                                        ],
                                },
                                null,
                        ),
                ).toBe(5)
        })
        it('recurses into nested binop args', () => {
                expect(
                        evalNode(
                                {
                                        type: 'binop',
                                        op: '*',
                                        args: [
                                                { type: 'literal', value: 2 },
                                                {
                                                        type: 'binop',
                                                        op: '+',
                                                        args: [
                                                                { type: 'literal', value: 1 },
                                                                { type: 'literal', value: 4 },
                                                        ],
                                                },
                                        ],
                                },
                                null,
                        ),
                ).toBe(10)
        })
        it('evaluates unop not via args[0]', () => {
                expect(evalNode({ type: 'unop', op: 'not', args: [{ type: 'literal', value: false }] }, null)).toBe(true)
        })
        it('evaluates func toFloat via the args array', () => {
                expect(evalNode({ type: 'func', name: 'toFloat', args: [{ type: 'literal', value: '3.5' }] }, null)).toBe(3.5)
        })
        it('returns list as an array of evaluated items', () => {
                expect(
                        evalNode(
                                {
                                        type: 'list',
                                        items: [
                                                { type: 'literal', value: 1 },
                                                { type: 'literal', value: 2 },
                                        ],
                                },
                                null,
                        ),
                ).toEqual([1, 2])
        })
        it('reads raw and identifier nodes as their value/name', () => {
                expect([evalNode({ type: 'raw', value: 'r' }, null), evalNode({ type: 'identifier', name: 'col' }, null)]).toEqual(['r', 'col'])
        })
})
describe('evalNode variadic and/or', () => {
        it('uses every() for and over 3+ args', () => {
                expect(
                        evalNode(
                                {
                                        type: 'binop',
                                        op: 'and',
                                        args: [
                                                { type: 'literal', value: true },
                                                { type: 'literal', value: true },
                                                { type: 'literal', value: true },
                                        ],
                                },
                                null,
                        ),
                ).toBe(true)
        })
        it('uses some() for or over 3+ args', () => {
                expect(
                        evalNode(
                                {
                                        type: 'binop',
                                        op: 'or',
                                        args: [
                                                { type: 'literal', value: false },
                                                { type: 'literal', value: false },
                                                { type: 'literal', value: true },
                                        ],
                                },
                                null,
                        ),
                ).toBe(true)
        })
})
describe('evalNode currentTuple', () => {
        it('reads ctx[col] when ctx is provided', () => {
                expect(evalNode({ type: 'currentTuple', col: 'id', tableName: 'users' }, null, { id: 9 })).toBe(9)
        })
        it('returns undefined when ctx is not provided', () => {
                expect(evalNode({ type: 'currentTuple', col: 'id', tableName: 'users' }, null)).toBe(undefined)
        })
})
describe('executor drain on empty', () => {
        it('returns [] for an Insert with zero values', () => {
                const stack = makeExecutor()
                stack.catalog.register('users', usersDef)
                const out = drainIter(stack.executor.execute({ op: 'Insert', table: 'users', values: [] }))
                expect(out).toEqual([{ rowCount: 0 }])
        })
})
// Roadmap (backend.md):
//   partial index — IndexScan が WHERE 述語付きで filter する経路、未実装
//   column pruning に基づく projection — Projection が child の field を制限する経路、未実装
//   external partition hash join — HashJoin が disk spill する経路、未実装
//   parallel scan — SeqScan の worker thread 分散、未実装
//   column store compression — Aggregate / Filter が compressed 値を直接比較、未実装
//   external sort spill — Sort の disk merge phase、未実装

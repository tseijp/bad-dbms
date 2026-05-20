import { describe, it, expect } from 'vitest'
import { database } from '../../src/interface/database'
import { table } from '../../src/interface/table'
import { integer, float } from '../../src/interface/column'
import { eq } from '../../src/interface/expressions/conditions'
import { sum } from '../../src/interface/functions/aggregate'
const makeUsers = () =>
        table('users', {
                id: integer('id').primaryKey(),
                name: integer('name').notNull(),
                score: integer('score').default(0),
        })
const makePosts = () =>
        table('posts', {
                id: integer('id').primaryKey(),
                userId: integer('user_id'),
                score: integer('score').default(0),
        })
const readScores = (db: any, name: string): number[] => {
        const out: number[] = []
        db.backend.catalog.scanTable(name, (_rid: any, row: any) => {
                out.push(row.score)
        })
        return out
}
const readIds = (db: any, name: string): number[] => {
        const out: number[] = []
        db.backend.catalog.scanTable(name, (_rid: any, row: any) => {
                out.push(row.id)
        })
        return out
}
describe('database construction', () => {
        it('accepts { tables } config and registers them', () => {
                const users = makeUsers()
                const db: any = database({ tables: { users } })
                const rel = db.backend.catalog.resolve('users')
                expect(rel.name).toBe('users')
        })
        it('accepts a bare tables map as first arg (auto-detect)', () => {
                const users = makeUsers()
                const db: any = database({ users })
                const rel = db.backend.catalog.resolve('users')
                expect(rel.columns.map((c: any) => c.name)).toEqual(['id', 'name', 'score'])
        })
})
describe('select chain', () => {
        it('returns each inserted row through SeqScan in heap order', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values([
                        { id: 1, name: 11, score: 10 },
                        { id: 2, name: 22, score: 20 },
                        { id: 3, name: 33, score: 30 },
                ])
                const rows = await db.select().from(users)
                expect(rows.map((r: any) => [r.id, r.score])).toEqual([
                        [1, 10],
                        [2, 20],
                        [3, 30],
                ])
        })
        it('filters via where clause to the matching row only', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values([
                        { id: 1, name: 11, score: 10 },
                        { id: 2, name: 22, score: 20 },
                ])
                const rows = await db
                        .select()
                        .from(users)
                        .where(eq((users as any).id, 2))
                expect(rows.map((r: any) => r.id)).toEqual([2])
        })
        it('unwraps aggregate-only projection (no groupBy) to the computed scalar row', async () => {
                const posts = makePosts()
                const db: any = database({ posts })
                await db.insert(posts).values([
                        { id: 1, userId: 1, score: 3 },
                        { id: 2, userId: 1, score: 4 },
                        { id: 3, userId: 1, score: 5 },
                ])
                const result: any = await db.select({ s: sum((posts as any).score) }).from(posts)
                expect(result).toEqual({ s: 12 })
        })
})
describe('insert chain', () => {
        it('stores the row and reports rowCount 1', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                const res = await db.insert(users).values({ id: 7, name: 70, score: 700 })
                expect(res).toEqual({ rowCount: 1 })
                expect(readIds(db, 'users')).toEqual([7])
        })
        it('stores every value and reports rowCount equal to array length', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                const res = await db.insert(users).values([
                        { id: 1, name: 11, score: 1 },
                        { id: 2, name: 22, score: 2 },
                        { id: 3, name: 33, score: 3 },
                ])
                expect(res).toEqual({ rowCount: 3 })
                expect(readIds(db, 'users')).toEqual([1, 2, 3])
        })
        it('.returning() yields one rid [pageId, offset] per inserted value', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                const res: any = await db
                        .insert(users)
                        .values([
                                { id: 1, name: 1, score: 1 },
                                { id: 2, name: 2, score: 2 },
                        ])
                        .returning()
                expect(res.length).toBe(2)
                expect(res[0].length).toBe(2)
                expect(typeof res[0][0]).toBe('number')
                expect(typeof res[0][1]).toBe('number')
        })
})
describe('update chain', () => {
        it('reports updated count and mutates the matched score', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values([
                        { id: 1, name: 0, score: 10 },
                        { id: 2, name: 0, score: 20 },
                ])
                const res: any = await db
                        .update(users)
                        .set({ score: 99 })
                        .where(eq((users as any).id, 1))
                expect(res[0]).toEqual({ updated: 1 })
                expect(readScores(db, 'users')).toEqual([99, 20])
        })
        it('SQL expression setter computes (row) => row.score + 1 per matched row', async () => {
                const posts = makePosts()
                const db: any = database({ posts })
                await db.insert(posts).values([
                        { id: 1, userId: 1, score: 3 },
                        { id: 2, userId: 1, score: 4 },
                ])
                const res: any = await db
                        .update(posts)
                        .set({ score: (posts as any).score.add(1) })
                        .where(eq((posts as any).id, 1))
                expect(res[0]).toEqual({ updated: 1 })
                expect(readScores(db, 'posts')).toEqual([4, 4])
        })
})
describe('delete chain', () => {
        it('removes the matched row only and reports deleted: 1', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values([
                        { id: 1, name: 0, score: 0 },
                        { id: 2, name: 0, score: 0 },
                        { id: 3, name: 0, score: 0 },
                ])
                const res: any = await db.delete(users).where(eq((users as any).id, 2))
                expect(res[0]).toEqual({ deleted: 1 })
                expect(readIds(db, 'users')).toEqual([1, 3])
        })
})
describe('transaction callback variant', () => {
        it('runs the callback exactly once with a tx surface that has insert/update/delete/select', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                let saw: any = null
                let calls = 0
                await db.transaction(async (tx: any) => {
                        calls++
                        saw = {
                                insert: typeof tx.insert,
                                update: typeof tx.update,
                                delete: typeof tx.delete,
                                select: typeof tx.select,
                        }
                })
                expect(calls).toBe(1)
                expect(saw).toEqual({ insert: 'function', update: 'function', delete: 'function', select: 'function' })
        })
})
describe('transaction per-row tick variant', () => {
        it('c.colName returns a currentTuple SqlNode that resolves via ctx.current at eval time', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values({ id: 42, name: 0, score: 0 })
                let probed: any = null
                const tick = db.transaction((_tx: any, c: any) => {
                        probed = c.id
                })
                await tick.run({})
                expect(probed.node).toEqual({ type: 'currentTuple', col: 'id', tableName: 'users' })
        })
        it('run iterates primary table alive rows exactly once each in heap order', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                await db.insert(users).values([
                        { id: 1, name: 11, score: 0 },
                        { id: 2, name: 22, score: 0 },
                        { id: 3, name: 33, score: 0 },
                ])
                const seen: number[] = []
                const tick = db.transaction(async (_tx: any, _c: any) => {
                        seen.push(0)
                })
                await tick.run({})
                expect(seen).toEqual([0, 0, 0])
        })
        it('run returns the same ctx object reference it received', async () => {
                const users = makeUsers()
                const db: any = database({ users })
                const tick = db.transaction(async (_tx: any, _c: any) => undefined)
                const ctx = { marker: 1 }
                const ret = await tick.run(ctx)
                expect(ret).toBe(ctx)
        })
})
describe('all(n) initializer', () => {
        it('inserts n rows distributed over hasOrder columns by z-order', async () => {
                const cells = table('cells', {
                        x: integer('x').order(0, 4),
                        y: integer('y').order(0, 4),
                        a: float('a').default(0),
                })
                const db: any = database({ cells })
                await db.all(16)
                const xs: number[] = []
                const ys: number[] = []
                db.backend.catalog.scanTable('cells', (_rid: any, row: any) => {
                        xs.push(row.x)
                        ys.push(row.y)
                })
                expect(xs.length).toBe(16)
                expect(xs.slice(0, 4)).toEqual([0, 1, 2, 3])
                expect(ys.slice(0, 4)).toEqual([0, 0, 0, 0])
                expect(ys[4]).toBe(1)
        })
        it('applies defaultFn for non-order columns at row generation time', async () => {
                let counter = 0
                const events = table('events', {
                        x: integer('x').order(0, 2),
                        y: integer('y').order(0, 2),
                        seq: integer('seq').$defaultFn(() => ++counter),
                })
                const db: any = database({ events })
                await db.all(4)
                const seqs: number[] = []
                db.backend.catalog.scanTable('events', (_rid: any, row: any) => {
                        seqs.push(row.seq)
                })
                expect(seqs).toEqual([1, 2, 3, 4])
        })
        it('returns a real Promise that supports .then chaining and .catch', async () => {
                const cells = table('cells', {
                        x: integer('x').order(0, 2),
                        y: integer('y').order(0, 2),
                        a: float('a').default(0),
                })
                const db: any = database({ cells })
                const ret = db.all(4)
                expect(ret).toBeInstanceOf(Promise)
                const chained = await ret.then((d: any) => d).then((d: any) => d.tables)
                expect(chained).toBe(db.tables)
                expect(typeof ret.catch).toBe('function')
        })
        it('rejects (does not synchronously throw) when a defaultFn throws during init', async () => {
                const boom = table('boom', {
                        x: integer('x').order(0, 2),
                        y: integer('y').order(0, 2),
                        seq: integer('seq').$defaultFn(() => {
                                throw new Error('init failure')
                        }),
                })
                const db: any = database({ boom })
                let ret: any
                expect(() => {
                        ret = db.all(4)
                }).not.toThrow()
                expect(ret).toBeInstanceOf(Promise)
                await expect(ret).rejects.toThrow('init failure')
        })
})
describe('use(adapter) chain', () => {
        it('returns db (chainable) and appends adapter to db.adapters', () => {
                const users = makeUsers()
                const db: any = database({ users })
                const a1 = { tag: 'a1' }
                const a2 = { tag: 'a2' }
                const ret = db.use(a1).use(a2)
                expect(ret).toBe(db)
                expect(db.adapters).toEqual([a1, a2])
        })
})
// Roadmap: WHERE への subquery / EXISTS、CTE、window function、
// ORDER BY の NULLS FIRST、DISTINCT ON、GROUPING SETS、
// update().from(otherTable) の本格 join、insert ... on conflict、
// string dictionary encoding は test 対象外。

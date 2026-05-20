import { describe, it, expect, vi } from 'vitest'
import { makeDb, usersTable, spyAdapter } from './_helpers'
describe('createDatabase surface', () => {
        it('returns an object with catalog/execute/transaction/stats/flush', () => {
                const db = makeDb()
                const got = {
                        catalog: typeof db.catalog,
                        execute: typeof db.execute,
                        transaction: typeof db.transaction,
                        stats: typeof db.stats,
                        flush: typeof db.flush,
                }
                expect(got).toEqual({
                        catalog: 'object',
                        execute: 'function',
                        transaction: 'function',
                        stats: 'function',
                        flush: 'function',
                })
        })
})
describe('execute is async', () => {
        it('returns a Promise that resolves to an array', async () => {
                const db = makeDb()
                const result = db.execute({})
                expect(typeof result.then).toBe('function')
                expect(await result).toEqual([])
        })
})
describe('execute InitAll', () => {
        it('invokes catalog.registerTable for each table in the InitAll payload', async () => {
                const db = makeDb()
                const spy = vi.spyOn(db.catalog, 'registerTable')
                await db.execute({ op: 'InitAll', count: 0, tables: { users: usersTable() } })
                expect(spy).toHaveBeenCalledTimes(1)
        })
        it('makes the registered table resolvable via catalog.resolve', async () => {
                const db = makeDb()
                await db.execute({ op: 'InitAll', count: 0, tables: { users: usersTable() } })
                expect(db.catalog.resolve('users')).toBeTruthy()
        })
})
describe('execute Select', () => {
        it('returns row array via planSelect-lowered physical AST', async () => {
                const db = makeDb()
                db.catalog.registerTable(usersTable())
                await db.execute({
                        op: 'Insert',
                        table: 'users',
                        values: [
                                { id: 1, name: 11, score: 1 },
                                { id: 2, name: 22, score: 2 },
                        ],
                })
                const rows = await db.execute({ op: 'Select', table: 'users' })
                expect(rows.map((r: any) => r.id).sort()).toEqual([1, 2])
        })
})
describe('execute Insert', () => {
        it('inserts every value row and returns rowCount in the result envelope', async () => {
                const db = makeDb()
                db.catalog.registerTable(usersTable())
                const out = await db.execute({
                        op: 'Insert',
                        table: 'users',
                        values: [
                                { id: 1, name: 1, score: 1 },
                                { id: 2, name: 2, score: 2 },
                                { id: 3, name: 3, score: 3 },
                        ],
                })
                expect(out[0]).toEqual({ rowCount: 3 })
        })
})
describe('execute Update', () => {
        it('mutates the matching column heap value via setter return', async () => {
                const db = makeDb()
                db.catalog.registerTable(usersTable())
                await db.execute({
                        op: 'Insert',
                        table: 'users',
                        values: [
                                { id: 1, name: 0, score: 1 },
                                { id: 2, name: 0, score: 2 },
                        ],
                })
                await db.execute({
                        op: 'Update',
                        table: 'users',
                        predicate: (r: any) => r.id === 1,
                        setters: { score: () => 77 },
                })
                const rows = await db.execute({ op: 'Select', table: 'users' })
                const byId = new Map(rows.map((r: any) => [r.id, r.score]))
                expect(byId.get(1)).toBe(77)
        })
})
describe('execute Delete', () => {
        it('marks every column heap slot dead for matching predicate', async () => {
                const db = makeDb()
                db.catalog.registerTable(usersTable())
                await db.execute({
                        op: 'Insert',
                        table: 'users',
                        values: [
                                { id: 1, name: 0, score: 1 },
                                { id: 2, name: 0, score: 2 },
                        ],
                })
                await db.execute({
                        op: 'Delete',
                        table: 'users',
                        predicate: (r: any) => r.id === 1,
                })
                const rows = await db.execute({ op: 'Select', table: 'users' })
                expect(rows.map((r: any) => r.id)).toEqual([2])
        })
})
describe('transaction', () => {
        it('invokes transam.begin then transam.commit on resolve', async () => {
                const db = makeDb()
                const beginSpy = vi.spyOn(db.transam, 'begin')
                const commitSpy = vi.spyOn(db.transam, 'commit')
                await db.transaction(async () => 42)
                expect({ b: beginSpy.mock.calls.length, c: commitSpy.mock.calls.length }).toEqual({ b: 1, c: 1 })
        })
        it('invokes transam.abort on reject and rethrows the error', async () => {
                const db = makeDb()
                const abortSpy = vi.spyOn(db.transam, 'abort')
                const boom = new Error('boom')
                await expect(
                        db.transaction(async () => {
                                throw boom
                        }),
                ).rejects.toBe(boom)
                expect(abortSpy).toHaveBeenCalledTimes(1)
        })
})
describe('stats()', () => {
        it('returns relations summary aggregating column blocks and indexCount', async () => {
                const db = makeDb()
                db.catalog.registerTable(usersTable())
                await db.execute({
                        op: 'Insert',
                        table: 'users',
                        values: [{ id: 1, name: 1, score: 1 }],
                })
                const s = db.stats()
                const rel = s.relations[0]
                expect({ name: rel.name, indexCount: rel.indexCount }).toEqual({ name: 'users', indexCount: 1 })
        })
})
describe('flush()', () => {
        it('invokes buffer.flushAll', () => {
                const db = makeDb()
                const spy = vi.spyOn(db.buffer, 'flushAll')
                db.flush()
                expect(spy).toHaveBeenCalledTimes(1)
        })
})
describe('createDatabase defaults', () => {
        it('uses frameCount=64 / ringCount=8 when config is empty', () => {
                const db = makeDb()
                expect(db.buffer.stats()).toMatchObject({ frameCount: 64, ringCount: 8 })
        })
})
describe('createDatabase config overrides', () => {
        it('honors frameCount/ringCount overrides in buffer.stats()', () => {
                const db = makeDb({ frameCount: 16, ringCount: 4 })
                expect(db.buffer.stats()).toMatchObject({ frameCount: 16, ringCount: 4 })
        })
        it('writes through the supplied fileAdapter when flushed after Insert', async () => {
                const adapter = spyAdapter()
                const db = makeDb({ fileAdapter: adapter })
                db.catalog.registerTable(usersTable())
                await db.execute({ op: 'Insert', table: 'users', values: [{ id: 1, name: 1, score: 1 }] })
                db.flush()
                expect(adapter.write.mock.calls.length).toBeGreaterThan(0)
        })
        it('honors pageSize override so smgr.extend writes a block of the configured size', async () => {
                const db = makeDb({ pageSize: 8192 })
                db.catalog.registerTable(usersTable())
                await db.execute({ op: 'Insert', table: 'users', values: [{ id: 1, name: 1, score: 1 }] })
                db.flush()
                const bytes = db.smgr.read(1 * 10000 + 10, 0, 0)
                expect(bytes.byteLength).toBe(8192)
        })
})
// Roadmap (backend.md):
//   InitAll の count > 0 (auto-seed 経路) — interface 側 (database({}).all(n)) の責務、backend test 対象外
//   stats() の index 深さ集計 — 現状 backend.index.ts では indexCount のみ集計、tree depth は未集計
//   transaction の per-row tick (callback の第 2 引数 c) — interface 側 (database.ts) の責務、backend test 対象外

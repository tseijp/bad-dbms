import { describe, it, expect } from 'vitest'
import { makeCatalog, usersDef, usersTable, insertRows } from './_helpers'
describe('catalog register', () => {
        it('preserves column count from def', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns.length).toBe(3)
        })
        it('preserves column names in declaration order', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns.map((c: any) => c.name)).toEqual(['id', 'name', 'score'])
        })
        it('preserves column types from def', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns.map((c: any) => c.type)).toEqual(['i32', 'u32', 'f32'])
        })
        it('assigns byteSize 4 to i32/f32/u32 columns', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns.every((c: any) => c.byteSize === 4)).toBe(true)
        })
        it('assigns distinct forkId per column from COLUMN_FORK_BASE', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns.map((c: any) => c.forkId)).toEqual([10, 11, 12])
        })
        it('flags isPrimary on the primary key column', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                expect(rel.columns[0].isPrimary).toBe(true)
        })
})
describe('catalog registerTable', () => {
        it('reads $meta.columns and constructs the same relation as register', () => {
                const { catalog } = makeCatalog()
                catalog.registerTable(usersTable())
                const rel = catalog.resolve('users')
                expect(rel.columns.map((c: any) => c.name)).toEqual(['id', 'name', 'score'])
        })
        it('propagates primaryKey flag from $col descriptor', () => {
                const { catalog } = makeCatalog()
                catalog.registerTable(usersTable())
                const rel = catalog.resolve('users')
                expect(rel.columns[0].isPrimary).toBe(true)
        })
        it('returns existing rel on second call without duplication', () => {
                const { catalog } = makeCatalog()
                const t = usersTable()
                catalog.registerTable(t)
                catalog.registerTable(t)
                expect(catalog.list().length).toBe(1)
        })
})
describe('catalog auto index', () => {
        it('creates one nbtree index for a primaryKey column', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', { id: { type: 'i32', isPrimary: true }, n: { type: 'i32' } })
                const rel = catalog.resolve('users')
                expect(rel.indexes.length).toBe(1)
        })
        it('names the auto index <table>_<col>_idx', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', { id: { type: 'i32', isPrimary: true } })
                const rel = catalog.resolve('users')
                expect(rel.indexes[0].name).toBe('users_id_idx')
        })
        it('uses nbtree kind for primaryKey index', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', { id: { type: 'i32', isPrimary: true } })
                const rel = catalog.resolve('users')
                expect(rel.indexes[0].kind).toBe('nbtree')
        })
        it('creates nbtree index for unique column', () => {
                const { catalog } = makeCatalog()
                catalog.register('t', { e: { type: 'u32', isUnique: true } })
                const rel = catalog.resolve('t')
                expect(rel.indexes[0].kind).toBe('nbtree')
        })
        it('creates nbtree index for hasOrder column', () => {
                const { catalog } = makeCatalog()
                catalog.register('t', { s: { type: 'i32', hasOrder: true } })
                const rel = catalog.resolve('t')
                expect(rel.indexes[0].kind).toBe('nbtree')
        })
        it('creates no index for plain columns', () => {
                const { catalog } = makeCatalog()
                catalog.register('t', { a: { type: 'i32' }, b: { type: 'i32' } })
                const rel = catalog.resolve('t')
                expect(rel.indexes.length).toBe(0)
        })
})
describe('catalog tupleDescriptor', () => {
        it('returns columns array with name/type/byteSize/forkId/heap/indexes', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                const desc = catalog.tupleDescriptor(rel)
                const first = desc.columns[0]
                expect(Object.keys(first).sort()).toEqual(['byteSize', 'forkId', 'heap', 'indexes', 'name', 'type'].sort())
        })
        it('attaches the matching heap handle to each column', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                const desc = catalog.tupleDescriptor(rel)
                expect(desc.columns[0].heap).toBe(rel.heaps[0])
        })
        it('attaches index descriptors only to columns that own them', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rel = catalog.resolve('users')
                const desc = catalog.tupleDescriptor(rel)
                expect(desc.columns[0].indexes.length).toBe(1)
        })
})
describe('catalog insertRow', () => {
        it('returns a 2-tuple rid for the first column heap', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rid = catalog.insertRow('users', { id: 1, name: 100, score: 1 })
                expect(rid.length).toBe(2)
        })
        it('keeps rid [blockNo, slot] aligned across all column heaps (DSM invariant)', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rid = catalog.insertRow('users', { id: 7, name: 200, score: 9 })
                const rel = catalog.resolve('users')
                const vals = rel.heaps.map((h: any) => h.read(rid))
                expect(vals).toEqual([7, 200, 9])
        })
        it('produces increasing slot indices across successive inserts on first heap', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const r1 = catalog.insertRow('users', { id: 1, name: 1, score: 1 })
                const r2 = catalog.insertRow('users', { id: 2, name: 2, score: 2 })
                expect(r2[1]).toBeGreaterThan(r1[1])
        })
})
describe('catalog rid round-trip via tupleDescriptor', () => {
        it('reads back the same row from every column heap', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                const rid = catalog.insertRow('users', { id: 42, name: 555, score: 3 })
                const rel = catalog.resolve('users')
                const desc = catalog.tupleDescriptor(rel)
                const row: any = {}
                for (const c of desc.columns) row[c.name] = c.heap.read(rid)
                expect(row).toEqual({ id: 42, name: 555, score: 3 })
        })
})
describe('catalog auto index population', () => {
        it('finds rid via auto index search after insertRow', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', { id: { type: 'i32', isPrimary: true } })
                const rid = catalog.insertRow('users', { id: 99 })
                const rel = catalog.resolve('users')
                const handle = rel.indexes[0].handle
                const found = 'search' in handle ? handle.search(99) : undefined
                expect(found).toEqual(rid)
        })
})
describe('catalog scanTable', () => {
        it('emits all alive rids in heap scan order', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                insertRows(catalog, 'users', [
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const ids: number[] = []
                catalog.scanTable('users', (_rid: any, row: any) => {
                        ids.push(row.id)
                })
                expect(ids).toEqual([1, 2, 3])
        })
        it('stops emission when callback returns false', () => {
                const { catalog } = makeCatalog()
                catalog.register('users', usersDef)
                insertRows(catalog, 'users', [
                        { id: 1, name: 1, score: 1 },
                        { id: 2, name: 2, score: 2 },
                        { id: 3, name: 3, score: 3 },
                ])
                const ids: number[] = []
                catalog.scanTable('users', (_rid: any, row: any) => {
                        ids.push(row.id)
                        if (row.id === 2) return false
                })
                expect(ids).toEqual([1, 2])
        })
})
describe('catalog resolve', () => {
        it('returns same descriptor for string name and Table object', () => {
                const { catalog } = makeCatalog()
                const t = usersTable()
                catalog.registerTable(t)
                expect(catalog.resolve('users')).toBe(catalog.resolve(t))
        })
})
// Roadmap (backend.md): partial index / column pruning に基づく projection 経路 /
//                       external partition hash join / parallel scan /
//                       column store compression / external sort spill /
//                       string column dictionary encoding ($col.tag === 'str' で別 fork) /
//                       orderRange を catalog 経路に流す再設計 — いずれも未実装のため backend test 対象外。

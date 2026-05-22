import { describe, it, expect } from 'vitest'
import { database, table, integer } from '../../src/index'
describe('default values on insert', () => {
        it('declared default 0 with omitted column reads back 0', async () => {
                const t = table('def0', {
                        id: integer('id').primaryKey(),
                        v: integer('v').default(0),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(0)
        })
        it.each([[1], [7], [42], [99], [255]])('declared default %i with omitted column reads back the default', async (d) => {
                const t = table('defn', {
                        id: integer('id').primaryKey(),
                        v: integer('v').default(d),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(d)
        })
        it('explicit value overrides a declared default', async () => {
                const t = table('defovr', {
                        id: integer('id').primaryKey(),
                        v: integer('v').default(42),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v: 7 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(7)
        })
        it('explicit 0 is stored even when the default is non-zero', async () => {
                const t = table('defzero', {
                        id: integer('id').primaryKey(),
                        v: integer('v').default(99),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v: 0 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(0)
        })
        it('$defaultFn returning a constant applies on omitted column', async () => {
                const t = table('dfn', {
                        id: integer('id').primaryKey(),
                        seq: integer('seq').$defaultFn(() => 5),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].seq).toBe(5)
        })
        it('$defaultFn counter applies incrementing values per row', async () => {
                let n = 0
                const t = table('dfnctr', {
                        id: integer('id').primaryKey(),
                        seq: integer('seq').$defaultFn(() => ++n),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([{ id: 1 }, { id: 2 }])
                const rows = await db.select().from(db.tables.t)
                expect(rows.map((r: { seq: number }) => r.seq)).toEqual([1, 2])
        })
        it('defaultFn alias returning a constant applies on omitted column', async () => {
                const t = table('dfnalias', {
                        id: integer('id').primaryKey(),
                        seq: integer('seq').defaultFn(() => 8),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].seq).toBe(8)
        })
        it('explicit value overrides a $defaultFn', async () => {
                const t = table('dfnovr', {
                        id: integer('id').primaryKey(),
                        seq: integer('seq').$defaultFn(() => 5),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, seq: 77 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].seq).toBe(77)
        })
        it('a default column distinct from explicit 0 keeps the explicit 0', async () => {
                const t = table('def0vs', {
                        id: integer('id').primaryKey(),
                        v: integer('v').default(3),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([{ id: 1, v: 0 }, { id: 2 }])
                const rows = await db.select().from(db.tables.t)
                expect(rows.map((r: { v: number }) => r.v)).toEqual([0, 3])
        })
})

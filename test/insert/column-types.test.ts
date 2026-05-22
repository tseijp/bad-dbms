import { describe, it, expect } from 'vitest'
import { database, table, integer, uint, float, text } from '../../src/index'
describe('column types', () => {
        it.each([[0], [1], [-1], [-128], [127], [2147483647], [-2147483648]])('integer column stores and reads %i', async (v) => {
                const t = table('itype', {
                        id: integer('id').primaryKey(),
                        v: integer('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(v)
        })
        it.each([[0], [1], [255], [65535], [4294967295]])('uint column stores and reads %i', async (v) => {
                const t = table('utype', {
                        id: integer('id').primaryKey(),
                        v: uint('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(v)
        })
        // All chosen values are exactly representable in float32, so a
        // correct store returns them verbatim under strict equality.
        it.each([[0], [1], [0.5], [1.25], [-2.5], [100.125], [-0.75], [-1], [2], [0.125], [-0.5], [8.5], [1024.25]])('float column stores and reads %f', async (v) => {
                const t = table('ftype', {
                        id: integer('id').primaryKey(),
                        v: float('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(v)
        })
        // Correct spec: a text column stores and reads back string
        // values verbatim. bad-dbms is a numeric store and coerces text
        // through Number(); these expectations stay on the string spec.
        it.each([['hello'], ['a'], ['drizzle parity'], ['']])('text column stores and reads the string %j', async (v) => {
                const t = table('ttype', {
                        id: integer('id').primaryKey(),
                        v: text('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, v })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0].v).toBe(v)
        })
        it('integer column preserves negative values across a multi-row insert', async () => {
                const t = table('ineg', {
                        id: integer('id').primaryKey(),
                        v: integer('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, v: -10 },
                        { id: 2, v: -20 },
                        { id: 3, v: -30 },
                ])
                const rows = await db.select().from(db.tables.t)
                expect(rows.map((r: { v: number }) => r.v)).toEqual([-10, -20, -30])
        })
        it('float column preserves fractional values across a multi-row insert', async () => {
                const t = table('fmulti', {
                        id: integer('id').primaryKey(),
                        v: float('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, v: 0.25 },
                        { id: 2, v: 1.5 },
                ])
                const rows = await db.select().from(db.tables.t)
                expect(rows[1].v).toBe(1.5)
        })
        it('uint column preserves values across a multi-row insert', async () => {
                const t = table('umulti', {
                        id: integer('id').primaryKey(),
                        v: uint('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, v: 100 },
                        { id: 2, v: 200 },
                        { id: 3, v: 4294967295 },
                ])
                const rows = await db.select().from(db.tables.t)
                expect(rows.map((r: { v: number }) => r.v)).toEqual([100, 200, 4294967295])
        })
        it.each([
                ['integer column a', 'a', -5],
                ['uint column b', 'b', 9],
                ['float column c', 'c', 2.5],
        ])('mixed-type table reads %s back', async (_label, key, expected) => {
                const t = table('mixed', {
                        id: integer('id').primaryKey(),
                        a: integer('a'),
                        b: uint('b'),
                        c: float('c'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values({ id: 1, a: -5, b: 9, c: 2.5 })
                const rows = await db.select().from(db.tables.t)
                expect(rows[0][key]).toBe(expected)
        })
        it('text column preserves strings across a multi-row insert', async () => {
                const t = table('tmulti', {
                        id: integer('id').primaryKey(),
                        v: text('v'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, v: 'first' },
                        { id: 2, v: 'second' },
                ])
                const rows = await db.select().from(db.tables.t)
                expect(rows.map((r: { v: string }) => r.v)).toEqual(['first', 'second'])
        })
})

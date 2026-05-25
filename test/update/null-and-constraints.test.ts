import { describe, it, expect } from 'vitest'
import { database, eq } from '../../src/index'
import { makeTyped, makeUniqueBoard } from './helpers'
// Every expectation here is the Drizzle / SQL contract for what an update may
// and may not do: a nullable column can be set to NULL; a notNull column
// cannot; a unique column cannot be set to a value another row already holds;
// a text column stores the string given. bad-dbms is a numeric column store
// and is suspected of coercing NULL to 0, ignoring constraints, and coercing
// text through Number(); if so these tests fail honestly. They are written to
// the correct spec and never weakened.
const seededTyped = async () => {
        const t = makeTyped()
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, label: 'first', score: 10 },
                { id: 2, label: 'second', score: 20 },
                { id: 3, label: 'third', score: 30 },
        ])
        return { db, t: db.tables.t }
}
const seededUnique = async () => {
        const t = makeUniqueBoard()
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, code: 100, score: 1 },
                { id: 2, code: 200, score: 2 },
                { id: 3, code: 300, score: 3 },
        ])
        return { db, t: db.tables.t }
}
describe('updating a column to NULL', () => {
        // A reader clearing a nullable column sets it to null; the column
        // must then read back as null, not as the number zero.
        it('setting a nullable column to null stores a genuine null', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ score: null }).where(eq(t.id, 2))
                const rows = (await db.select().from(t)) as { id: number; score: number | null }[]
                const target = rows.find((r) => r.id === 2)
                expect(target?.score).toBeNull()
        })
        it('a column set to null is no longer equal to its old numeric value', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ score: null }).where(eq(t.id, 1))
                const rows = await db.select().from(t).where(eq(t.score, 10))
                // id 1 used to have score 10; after nulling it must not match score 10
                expect(rows).toEqual([])
        })
        it('a column set to null is not caught by an equality on zero', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ score: null }).where(eq(t.id, 3))
                const rows = await db.select().from(t).where(eq(t.score, 0))
                // NULL is not 0; the nulled row must not appear
                expect(rows).toEqual([])
        })
})
describe('an update that would break a constraint is rejected', () => {
        // A reader cannot use update to drive a table into an illegal state:
        // a notNull column cannot be set to NULL and a unique column cannot
        // be set to a value another row already holds.
        it('setting a notNull column to null rejects the update', async () => {
                const { db, t } = await seededTyped()
                await expect(db.update(t).set({ label: null }).where(eq(t.id, 1))).rejects.toBeDefined()
        })
        it('a rejected notNull update leaves the column at its original value', async () => {
                const { db, t } = await seededTyped()
                await db
                        .update(t)
                        .set({ label: null })
                        .where(eq(t.id, 1))
                        .catch(() => undefined)
                const rows = (await db.select().from(t)) as { id: number; label: string }[]
                expect(rows.find((r) => r.id === 1)?.label).toBe('first')
        })
        it('setting a unique column to a value another row holds rejects the update', async () => {
                const { db, t } = await seededUnique()
                // row 1 holds code 100; trying to give row 2 the same code must fail
                await expect(db.update(t).set({ code: 100 }).where(eq(t.id, 2))).rejects.toBeDefined()
        })
        it('a rejected unique update leaves both rows at their original codes', async () => {
                const { db, t } = await seededUnique()
                await db
                        .update(t)
                        .set({ code: 100 })
                        .where(eq(t.id, 2))
                        .catch(() => undefined)
                const rows = (await db.select().from(t)) as { id: number; code: number }[]
                const codes = [...rows].sort((a, b) => a.id - b.id).map((r) => r.code)
                expect(codes).toEqual([100, 200, 300])
        })
        it('setting a unique column to a value no row holds is allowed', async () => {
                const { db, t } = await seededUnique()
                await db.update(t).set({ code: 999 }).where(eq(t.id, 2))
                const rows = (await db.select().from(t)) as { id: number; code: number }[]
                expect(rows.find((r) => r.id === 2)?.code).toBe(999)
        })
})
describe('updating a text column stores the string given', () => {
        // A reader renaming a record sets a text column to a new string; the
        // column reads back as that exact string.
        it('setting a text column to a new string stores the string verbatim', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ label: 'renamed' }).where(eq(t.id, 2))
                const rows = (await db.select().from(t)) as { id: number; label: string }[]
                expect(rows.find((r) => r.id === 2)?.label).toBe('renamed')
        })
        it('a text update leaves the other rows strings untouched', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ label: 'renamed' }).where(eq(t.id, 2))
                const rows = (await db.select().from(t)) as { id: number; label: string }[]
                expect(rows.find((r) => r.id === 1)?.label).toBe('first')
        })
        it('a text column can be updated to an empty string distinct from null', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ label: '' }).where(eq(t.id, 3))
                const rows = (await db.select().from(t)) as { id: number; label: string }[]
                expect(rows.find((r) => r.id === 3)?.label).toBe('')
        })
})
describe('an update that collides the primary key is rejected', () => {
        // The primary key is unique across the table. An update that drives
        // one row's key onto a value another row already holds is a
        // constraint violation and must reject — Drizzle / SQL contract.
        it('updating a rows primary key to a value another row holds rejects', async () => {
                const { db, t } = await seededTyped()
                // row 1 holds id 1; trying to give row 2 the id 1 must fail
                await expect(db.update(t).set({ id: 1 }).where(eq(t.id, 2))).rejects.toBeDefined()
        })
        it('a rejected primary-key collision leaves both rows at their original ids', async () => {
                const { db, t } = await seededTyped()
                await db
                        .update(t)
                        .set({ id: 1 })
                        .where(eq(t.id, 2))
                        .catch(() => undefined)
                const rows = (await db.select().from(t)) as { id: number }[]
                expect([...rows].map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3])
        })
        it('moving a primary key to a value no row holds is allowed', async () => {
                const { db, t } = await seededTyped()
                await db.update(t).set({ id: 9 }).where(eq(t.id, 2))
                const rows = (await db.select().from(t)) as { id: number }[]
                expect([...rows].map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 3, 9])
        })
        it('a whole-table update that collapses every primary key onto one value rejects', async () => {
                const { db, t } = await seededTyped()
                // setting every row's id to the same constant violates uniqueness
                await expect(db.update(t).set({ id: 5 })).rejects.toBeDefined()
        })
})

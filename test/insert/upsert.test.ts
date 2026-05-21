import { describe, it, expect } from 'vitest'

// Roadmap: upsert (onConflictDoNothing / onConflictDoUpdate) is not yet
// exposed on the insert builder (makeInsert only has values/returning/then).
// These Drizzle-parity scenarios stay commented out until the API exists.
//
// import { database, table, integer } from '../../src/index'
//
// describe('upsert (Drizzle parity)', () => {
//         it('onConflictDoNothing keeps the original row on a key clash', async () => {
//                 const t = table('up', { id: integer('id').primaryKey(), v: integer('v') })
//                 const db = database({ t })
//                 await db.insert(db.tables.t).values({ id: 1, v: 10 })
//                 await db.insert(db.tables.t).values({ id: 1, v: 99 }).onConflictDoNothing()
//                 const rows = await db.select().from(db.tables.t)
//                 expect(rows[0].v).toBe(10)
//         })
//         it('onConflictDoUpdate overwrites the row on a key clash', async () => {
//                 const t = table('up', { id: integer('id').primaryKey(), v: integer('v') })
//                 const db = database({ t })
//                 await db.insert(db.tables.t).values({ id: 1, v: 10 })
//                 await db.insert(db.tables.t).values({ id: 1, v: 99 }).onConflictDoUpdate({ set: { v: 99 } })
//                 const rows = await db.select().from(db.tables.t)
//                 expect(rows[0].v).toBe(99)
//         })
//         it('onConflictDoNothing still inserts a non-conflicting row', async () => {
//                 const t = table('up', { id: integer('id').primaryKey(), v: integer('v') })
//                 const db = database({ t })
//                 await db.insert(db.tables.t).values({ id: 1, v: 10 })
//                 await db.insert(db.tables.t).values({ id: 2, v: 20 }).onConflictDoNothing()
//                 const rows = await db.select().from(db.tables.t)
//                 expect(rows.length).toBe(2)
//         })
// })

// Placeholder keeps this file a valid test module while upsert is unimplemented.
describe('upsert (Drizzle parity) — Roadmap', () => {
        it.skip('onConflictDoNothing / onConflictDoUpdate await insert-builder support', () => {
                expect(true).toBe(true)
        })
})

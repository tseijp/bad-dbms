import { database, table, integer, text } from '../../src/index'
import { makeUsers, makeEvents, USERS_SEED, EVENTS_SEED } from '../_helpers'

// shared select-test fixtures and Drizzle-correct result readers.
//
// select() resolves to an array of row objects. A projection keys each row by
// the projection ALIAS (the key passed to select({...})), never by the source
// column name. An omitted projection returns every declared column. Expected
// values follow the correct Drizzle spec, never bad-dbms behaviour.

export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])

export const valuesOf = (r: unknown, key: string): any[] => rowsOf(r).map((row) => row[key])

export const keysOf = (r: unknown): string[] => Object.keys(rowsOf(r)[0] ?? {}).sort()

// the canonical integer users fixture: ids 1/2/3, names 11/22/33, scores
// 10/20/30.
export const seedUsers = async () => {
        const users = makeUsers()
        const db = database({ users })
        await db.insert(users).values(USERS_SEED)
        return { db, users }
}

// the events fixture: kind is 0,0,1,1,2 — used to exercise selectDistinct.
export const seedEvents = async () => {
        const events = makeEvents()
        const db = database({ events })
        await db.insert(events).values(EVENTS_SEED)
        return { db, events }
}

// a table carrying a real text column, so projecting a string value can be
// attacked against the Drizzle spec (bad-dbms stores text internally as u32).
// rows: [id, label, qty].
export const seedLabels = async (rows: Array<[number, string, number]>) => {
        const items = table('items', {
                id: integer('id').primaryKey(),
                label: text('label'),
                qty: integer('qty'),
        })
        const db = database({ items })
        const data = rows.map(([id, label, qty]) => ({ id, label, qty }))
        if (data.length) await db.insert(items).values(data as any)
        return { db, items }
}

// the default label dataset used across text-projection scenarios.
export const LABELS: Array<[number, string, number]> = [
        [1, 'alpha', 10],
        [2, 'beta', 20],
        [3, 'gamma', 30],
]

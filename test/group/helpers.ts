import { database, table, integer, text } from '../../src/index'
// shared group-test fixtures and Drizzle-correct result readers.
//
// A grouped select() resolves to an array of row objects, one per distinct
// group key, each carrying the projected key column(s) and the per-group
// aggregate alias(es). Order of groups is unspecified, so readers sort by the
// group key before asserting.
export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])
// sorts grouped rows by a key column so assertions are order-independent.
export const byKey = (r: unknown, key: string): any[] =>
        rowsOf(r)
                .slice()
                .sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0))
// the group row whose key column equals the given value.
export const groupWith = (r: unknown, key: string, value: unknown): any => rowsOf(r).find((row) => row[key] === value)
// builds `t(id pk, g, v)` from triples [groupKey, value], one row each.
export const groupTable = async (pairs: Array<[number, number]>) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                g: integer('g'),
                v: integer('v'),
        })
        const db = database({ t })
        const rows = pairs.map(([g, v], i) => ({ id: i + 1, g, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
// builds `t(id pk, g)` with the given group keys, one row each (no value col).
export const keyTable = async (keys: number[]) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                g: integer('g'),
        })
        const db = database({ t })
        const rows = keys.map((g, i) => ({ id: i + 1, g }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
// builds `t(id pk, g, label)` where `label` is a text column, from triples
// [groupKey, label]. Used to attack per-group min/max over a string column,
// which must return the lexicographically smallest / largest string.
export const labelTable = async (pairs: Array<[number, string]>) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                g: integer('g'),
                label: text('label'),
        })
        const db = database({ t })
        const rows = pairs.map(([g, label], i) => ({ id: i + 1, g, label }))
        if (rows.length) await db.insert(t).values(rows as any)
        return { db, t }
}

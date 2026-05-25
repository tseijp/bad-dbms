import { database, table, integer, float } from '../../src/index'
import { makeUsers } from '../_helpers'
// shared aggregate-test fixtures and Drizzle-correct result readers.
//
// A select() result is always an array of row objects in Drizzle. A
// group-by-less aggregate query resolves to an array of exactly one row,
// e.g. `[{ n: 3 }]`. bad-dbms currently unwraps that to a bare object; these
// readers express the correct Drizzle shape so the divergence fails honestly.
export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? r : [])
export const aggRow = (r: unknown): any => rowsOf(r)[0]
export const scalar = (r: unknown, alias: string): unknown => {
        const row = aggRow(r)
        return row ? row[alias] : undefined
}
export const freshUsers = () => {
        const users = makeUsers()
        return { users, db: database({ users }) }
}
// builds `t(id pk, v)` holding the given values, one per row.
export const numTable = async (values: number[], type: 'integer' | 'float' = 'integer') => {
        const v = type === 'float' ? float('v') : integer('v')
        const t = table('t', { id: integer('id').primaryKey(), v })
        const db = database({ t })
        const rows = values.map((value, i) => ({ id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}

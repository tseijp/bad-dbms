import { database, table, integer, float } from '../../src/index'
import { makeUsers, USERS_SEED } from '../_helpers'
// shared expression-test fixtures and Drizzle-correct result readers.
//
// An expression is observed by placing it in a select projection and reading
// the per-row value back. select() resolves to an array of row objects, so a
// projected expression column `x` is read across rows as `column(rows, 'x')`.
// Expected values come from the correct Drizzle / SQL evaluation semantics,
// never from observing bad-dbms behaviour.
export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])
// the projected expression column read in row order.
export const column = (r: unknown, key: string): any[] => rowsOf(r).map((row) => row[key])
// seeds the canonical users table: ids 1/2/3, scores 10/20/30, names 11/22/33.
export const seedUsers = async () => {
        const users = makeUsers()
        const db = database({ users })
        await db.insert(users).values(USERS_SEED)
        return { db, users }
}
// builds `t(id pk, v)` over an integer column holding the given values.
export const intTable = async (values: number[]) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                v: integer('v'),
        })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
// builds `t(id pk, v)` over a float column holding the given values.
export const floatTable = async (values: number[]) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                v: float('v'),
        })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
// builds `t(id pk, a, b)` for two-column expression scenarios.
export const pairTable = async (pairs: Array<[number, number]>) => {
        const t = table('t', {
                id: integer('id').primaryKey(),
                a: integer('a'),
                b: integer('b'),
        })
        const db = database({ t })
        const rows = pairs.map(([a, b], i) => ({ id: i + 1, a, b }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}

import { database, table, integer, float } from '../../src/index'
export { seedUsers, valuesOf } from '../_helpers'
export const intTable = async (values: number[]) => {
        const t = table('t', { id: integer('id').primaryKey(), v: integer('v') })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}
export const floatTable = async (values: number[]) => {
        const t = table('t', { id: integer('id').primaryKey(), v: float('v') })
        const db = database({ t })
        const rows = values.map((v, i) => ({ id: i + 1, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}
export const pairTable = async (pairs: Array<[number, number]>) => {
        const t = table('t', { id: integer('id').primaryKey(), a: integer('a'), b: integer('b') })
        const db = database({ t })
        const rows = pairs.map(([a, b], i) => ({ id: i + 1, a, b }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}

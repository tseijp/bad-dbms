import { database, table, integer, text } from '../../src/index'
export const groupTable = async (pairs: Array<[number, number]>) => {
        const t = table('t', { id: integer('id').primaryKey(), g: integer('g'), v: integer('v') })
        const db = database({ t })
        const rows = pairs.map(([g, v], i) => ({ id: i + 1, g, v }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}
export const keyTable = async (keys: number[]) => {
        const t = table('t', { id: integer('id').primaryKey(), g: integer('g') })
        const db = database({ t })
        const rows = keys.map((g, i) => ({ id: i + 1, g }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}
export const labelTable = async (pairs: Array<[number, string]>) => {
        const t = table('t', { id: integer('id').primaryKey(), g: integer('g'), label: text('label') })
        const db = database({ t })
        const rows = pairs.map(([g, label], i) => ({ id: i + 1, g, label }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}

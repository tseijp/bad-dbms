import { database, table, integer, float } from '../../src/index'
export const numTable = async (values: number[], type: 'integer' | 'float' = 'integer') => {
        const v = type === 'float' ? float('v') : integer('v')
        const t = table('t', { id: integer('id').primaryKey(), v })
        const db = database({ t })
        const rows = values.map((value, i) => ({ id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t: db.tables.t }
}

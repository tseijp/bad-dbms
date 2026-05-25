import { database, table, integer, text } from '../../src/index'
export const LABELS: Array<[number, string, number]> = [
        [1, 'alpha', 10],
        [2, 'beta', 20],
        [3, 'gamma', 30],
]
export const seedLabels = async (rows: Array<[number, string, number]> = LABELS) => {
        const items = table('items', { id: integer('id').primaryKey(), label: text('label'), qty: integer('qty') })
        const db = database({ items })
        const data = rows.map(([id, label, qty]) => ({ id, label, qty }))
        if (data.length) await db.insert(items).values(data)
        return { db, items: db.tables.items }
}

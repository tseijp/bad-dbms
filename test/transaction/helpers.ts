import { table, integer } from '../../src/index'
import { fresh } from '../_helpers'
export const makeLedger = () =>
        table('ledger', {
                id: integer('id').primaryKey(),
                amount: integer('amount'),
        })
export const freshLedger = () => fresh(makeLedger)
export const seeded = async () => {
        const { db, t } = freshLedger()
        await db.insert(t).values([
                { id: 1, amount: 10 },
                { id: 2, amount: 20 },
                { id: 3, amount: 30 },
        ])
        return { db, t }
}
export const amountsById = (rows: { id: number; amount: number | null }[]) => [...rows].sort((a, b) => a.id - b.id).map((r) => r.amount)

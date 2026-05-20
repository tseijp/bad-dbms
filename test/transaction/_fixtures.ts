import { database, table, integer } from '../../src/index'

// Every expectation in the transaction tests is the Drizzle / SQL transaction
// contract, never an observation of bad-dbms behaviour. These fixtures only
// build schema and seed data; they encode no expectations.

// A tiny ledger table built fresh per test so nothing is shared.
export const makeLedger = () =>
        table('ledger', {
                id: integer('id').primaryKey(),
                amount: integer('amount'),
        })

// fresh builds an empty ledger database.
export const fresh = () => {
        const t = makeLedger()
        const db = database({ t })
        return { db, t: db.tables.t as ReturnType<typeof makeLedger> }
}

// seeded builds a ledger with three rows so a transaction has prior state to
// mutate and to roll back to.
export const seeded = async () => {
        const { db, t } = fresh()
        await db.insert(t).values([
                { id: 1, amount: 10 },
                { id: 2, amount: 20 },
                { id: 3, amount: 30 },
        ])
        return { db, t }
}

// idsOf reads surviving ids back, ascending.
export const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)

// amountsById reads amounts back keyed by id, so a mutation is observed
// independent of row order.
export const amountsById = (rows: Record<string, number>[]) =>
        [...rows].sort((a, b) => a.id - b.id).map((r) => r.amount)

import { database, table, integer, text } from '../../src/index'
// A small mutable table built fresh per test so no test shares state. The
// rows are a tiny user board: id, a name code, and a score.
export const makeBoard = () =>
        table('board', {
                id: integer('id').primaryKey(),
                name: integer('name'),
                score: integer('score'),
        })
// A board whose score column is nullable and whose name column is text and
// notNull. Used to attack updating a column to NULL and updating a text
// column — Drizzle contracts a numeric column store cannot meet.
export const makeTyped = () =>
        table('typed', {
                id: integer('id').primaryKey(),
                label: text('label').notNull(),
                score: integer('score'),
        })
// A board with a unique column, used to attack updates that would violate the
// uniqueness constraint.
export const makeUniqueBoard = () =>
        table('uniq', {
                id: integer('id').primaryKey(),
                code: integer('code').unique(),
                score: integer('score'),
        })
// fresh builds an empty board database and returns the handle.
export const fresh = () => {
        const t = makeBoard()
        const db = database({ t })
        return { db, t: db.tables.t as ReturnType<typeof makeBoard> }
}
// seeded builds a board pre-filled with a deliberate spread of scores so
// predicates have something to bite on.
export const seeded = async () => {
        const { db, t } = fresh()
        await db.insert(t).values([
                { id: 1, name: 100, score: 10 },
                { id: 2, name: 200, score: 20 },
                { id: 3, name: 300, score: 30 },
        ])
        return { db, t }
}
// rowById pulls a single row out of a read-back result by its id.
export const rowById = (rows: Record<string, unknown>[], id: number) => rows.find((r) => r.id === id) as Record<string, unknown> | undefined
// scoresInIdOrder reads scores back sorted by id so a mutation is observed
// independent of row iteration order.
export const scoresInIdOrder = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => (a.id as number) - (b.id as number)).map((r) => r.score)

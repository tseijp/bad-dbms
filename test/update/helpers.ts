import { table, integer, text } from '../../src/index'
import { fresh } from '../_helpers'
export const makeBoard = () =>
        table('board', {
                id: integer('id').primaryKey(),
                name: integer('name'),
                score: integer('score'),
        })
export const makeTyped = () =>
        table('typed', {
                id: integer('id').primaryKey(),
                label: text('label').notNull(),
                score: integer('score'),
        })
export const makeUniqueBoard = () =>
        table('uniq', {
                id: integer('id').primaryKey(),
                code: integer('code').unique(),
                score: integer('score'),
        })
export const freshBoard = () => fresh(makeBoard)
export const seeded = async () => {
        const { db, t } = freshBoard()
        await db.insert(t).values([
                { id: 1, name: 100, score: 10 },
                { id: 2, name: 200, score: 20 },
                { id: 3, name: 300, score: 30 },
        ])
        return { db, t }
}
export const rowById = (rows: Record<string, unknown>[], id: number) => rows.find((r) => r.id === id) as Record<string, unknown> | undefined
export const scoresInIdOrder = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => (a.id as number) - (b.id as number)).map((r) => r.score)

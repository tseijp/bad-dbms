import { database, table, integer, text } from '../../src/index'
import type { Table } from '../../src/index'
// Every expected value in the delete tests is derived from Drizzle /
// SQL-standard semantics, never from observing bad-dbms behaviour. These
// fixtures only build schemas and seed data; they encode no expectations.
// A parent table and a child table wired with a foreign key so cascade and
// referential-integrity behaviour can be attacked.
export const makeAuthors = () =>
        table('authors', {
                id: integer('id').primaryKey(),
                name: text('name'),
        })
export const makeBooks = (authors: ReturnType<typeof makeAuthors>) =>
        table('books', {
                id: integer('id').primaryKey(),
                authorId: integer('author_id').references(() => authors.id, { onDelete: 'cascade' }),
                title: text('title'),
        })
// A self-referential tree so multi-level cascade can be attacked.
export const makeNodes = (): Table<any> => {
        const nodes: Table<any> = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => nodes.id, { onDelete: 'cascade' }),
        })
        return nodes
}
// A plain board for the value-level scenarios.
export const makeBoard = () =>
        table('board', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
// freshBoard builds an empty board database and returns the handle.
export const freshBoard = () => {
        const t = makeBoard()
        const db = database({ t })
        return { db, t: db.tables.t as ReturnType<typeof makeBoard> }
}
// seededBoard builds a board with three rows of spread-out scores.
export const seededBoard = async () => {
        const { db, t } = freshBoard()
        await db.insert(t).values([
                { id: 1, score: 10 },
                { id: 2, score: 20 },
                { id: 3, score: 30 },
        ])
        return { db, t }
}
// idsOf reads the surviving ids back, ascending.
export const idsOf = (rows: any) => rows.map((r: any) => r.id).sort((a: any, b: any) => a - b)

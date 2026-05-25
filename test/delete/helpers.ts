import { table, integer, text } from '../../src/index'
import type { Table, TypedColumn } from '../../src/index'
import { fresh } from '../_helpers'
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
type NodesShape = { id: TypedColumn<number>; parentId: TypedColumn<number | null> }
export const makeNodes = (): Table<NodesShape> => {
        const nodes: Table<NodesShape> = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => nodes.id, { onDelete: 'cascade' }),
        })
        return nodes
}
export const makeBoard = () =>
        table('board', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
export const freshBoard = () => fresh(makeBoard)
export const seededBoard = async () => {
        const { db, t } = freshBoard()
        await db.insert(t).values([
                { id: 1, score: 10 },
                { id: 2, score: 20 },
                { id: 3, score: 30 },
        ])
        return { db, t }
}

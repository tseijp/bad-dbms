import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, count } from '../../src/index'
import { makeBoard, idsOf } from './_fixtures'
describe('a delete on one table leaves a sibling table intact', () => {
        // Two unrelated tables share a connection. A delete on one
        // must never reach the other.
        const twoTables = async () => {
                const board = makeBoard()
                const tag = table('tag', { id: integer('id').primaryKey(), weight: integer('weight') })
                const db = database({ board, tag })
                await db.insert(db.tables.board).values([
                        { id: 1, score: 10 },
                        { id: 2, score: 20 },
                ])
                await db.insert(db.tables.tag).values([
                        { id: 1, weight: 5 },
                        { id: 2, weight: 6 },
                ])
                return { db, board: db.tables.board, tag: db.tables.tag }
        }
        it('a full delete on one table leaves every row of the sibling table', async () => {
                const { db, board, tag } = await twoTables()
                await db.delete(board)
                const rows = await db.select().from(tag)
                expect(idsOf(rows)).toEqual([1, 2])
        })
        it('clearing one table does not touch the sibling table count', async () => {
                const { db, board, tag } = await twoTables()
                await db.delete(board)
                const result = await db.select({ n: count() }).from(tag)
                expect(result).toEqual([{ n: 2 }])
        })
        it('a row-level delete on one table leaves the sibling rows whole', async () => {
                const { db, board, tag } = await twoTables()
                await db.delete(board).where(eq(board.id, 1))
                const rows = (await db.select().from(tag)) as { id: number; weight: number }[]
                const first = rows.find((r) => r.id === 1)
                expect(first).toMatchObject({ id: 1, weight: 5 })
        })
        it('clearing both tables in turn empties each independently', async () => {
                const { db, board, tag } = await twoTables()
                await db.delete(board)
                const tagsAfterBoard = await db.select().from(tag)
                await db.delete(tag)
                const tagsNow = await db.select().from(tag)
                expect([tagsAfterBoard.length, tagsNow.length]).toEqual([2, 0])
        })
})

import { describe, it, expect } from 'vitest'
import { database, eq, count } from '../../src/index'
import { idsOf } from '../_helpers'
import { makeAuthors, makeBooks } from './helpers'
describe('foreign key ON DELETE CASCADE removes dependent rows', () => {
        // Drizzle declares onDelete: 'cascade' on the child FK. SQL
        // then removes every child row when its parent is deleted.
        // bad-dbms must honour the cascade it was told to enforce.
        const seededPair = async () => {
                const authors = makeAuthors()
                const books = makeBooks(authors)
                const db = database({ authors, books })
                await db.insert(db.tables.authors).values([
                        { id: 1, name: '1' },
                        { id: 2, name: '2' },
                ])
                await db.insert(db.tables.books).values([
                        { id: 10, authorId: 1, title: '1' },
                        { id: 11, authorId: 1, title: '2' },
                        { id: 12, authorId: 2, title: '3' },
                ])
                return { db, authors: db.tables.authors, books: db.tables.books }
        }
        it('deleting an author cascades to remove that authors books', async () => {
                const { db, authors, books } = await seededPair()
                await db.delete(authors).where(eq(authors.id, 1))
                const rows = await db.select().from(books)
                // author 1 owned books 10 and 11; only book 12 must survive
                expect(idsOf(rows)).toEqual([12])
        })
        it('a cascade leaves books of other authors untouched', async () => {
                const { db, authors, books } = await seededPair()
                await db.delete(authors).where(eq(authors.id, 1))
                const rows = await db.select().from(books)
                expect(rows[0]).toMatchObject({ id: 12, authorId: 2 })
        })
        it('deleting every author cascades the books table to empty', async () => {
                const { db, authors, books } = await seededPair()
                await db.delete(authors)
                const rows = await db.select().from(books)
                expect(rows).toEqual([])
        })
        it('the cascade count of removed children is reflected by a follow-up read', async () => {
                const { db, authors, books } = await seededPair()
                await db.delete(authors).where(eq(authors.id, 1))
                const result = await db.select({ n: count() }).from(books)
                expect(result).toEqual([{ n: 1 }])
        })
        it('a cascade triggered inside a transaction still removes the children', async () => {
                const { db, authors, books } = await seededPair()
                await db.transaction(async (tx) => {
                        await tx.delete(authors).where(eq(authors.id, 2))
                })
                const rows = await db.select().from(books)
                expect(idsOf(rows)).toEqual([10, 11])
        })
})

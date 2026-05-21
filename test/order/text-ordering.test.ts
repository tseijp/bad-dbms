import { describe, it, expect } from 'vitest'
import { asc, desc } from '../../src/index'
import { makeNamed, fresh, seqOf } from './_fixtures'

// Every expectation here is the SQL / Drizzle contract for ordering a text
// column: strings sort lexicographically by their characters. bad-dbms is a
// numeric column store suspected of coercing text through Number(); if so a
// text orderBy cannot sort at all and these tests fail honestly. They are
// written to the correct string spec and never weakened to a numeric one.

const seededNames = async () => {
        const { db, t } = fresh(makeNamed)
        // inserted in a deliberately scrambled order
        await db.insert(t).values([
                { id: 1, name: 'cherry' },
                { id: 2, name: 'apple' },
                { id: 3, name: 'banana' },
                { id: 4, name: 'date' },
        ])
        return { db, t }
}

describe('orderBy sorts a text column lexicographically', () => {
        // A reader sorting a list of names expects alphabetical order, the
        // SQL rule for text, not insertion order and not a numeric coercion.
        it('an ascending sort of a text column orders the names alphabetically', async () => {
                const { db, t } = await seededNames()
                const rows = await db.select().from(t).orderBy(asc(t.name))
                expect(seqOf(rows, 'name')).toEqual(['apple', 'banana', 'cherry', 'date'])
        })

        it('a descending sort of a text column orders the names reverse-alphabetically', async () => {
                const { db, t } = await seededNames()
                const rows = await db.select().from(t).orderBy(desc(t.name))
                expect(seqOf(rows, 'name')).toEqual(['date', 'cherry', 'banana', 'apple'])
        })

        it('an ascending text sort carries each whole row, so the ids follow their names', async () => {
                const { db, t } = await seededNames()
                const rows = await db.select().from(t).orderBy(asc(t.name))
                expect(seqOf(rows, 'id')).toEqual([2, 3, 1, 4])
        })

        it('strings sharing a prefix sort by their first differing character', async () => {
                const { db, t } = fresh(makeNamed)
                await db.insert(t).values([
                        { id: 1, name: 'apricot' },
                        { id: 2, name: 'apple' },
                        { id: 3, name: 'apex' },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.name))
                expect(seqOf(rows, 'name')).toEqual(['apex', 'apple', 'apricot'])
        })

        it('a shorter string sorts before a longer string that extends it', async () => {
                const { db, t } = fresh(makeNamed)
                await db.insert(t).values([
                        { id: 1, name: 'apples' },
                        { id: 2, name: 'apple' },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.name))
                expect(seqOf(rows, 'name')).toEqual(['apple', 'apples'])
        })

        it('an empty string sorts before any non-empty string', async () => {
                const { db, t } = fresh(makeNamed)
                await db.insert(t).values([
                        { id: 1, name: 'a' },
                        { id: 2, name: '' },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.name))
                expect(seqOf(rows, 'id')).toEqual([2, 1])
        })

        it('a descending text sort is the exact reverse of the ascending one', async () => {
                const { db, t } = await seededNames()
                const up = await db.select().from(t).orderBy(asc(t.name))
                const down = await db.select().from(t).orderBy(desc(t.name))
                expect(seqOf(down, 'id')).toEqual([...(seqOf(up, 'id') as number[])].reverse())
        })
})

import { describe, it, expect } from 'vitest'
import { database, table, integer, text, eq, ne, inArray, notInArray, like, notLike, ilike } from '../../src/index'
import { idsOf } from '../_helpers'
// Every expectation here is the Drizzle contract for text columns: a text
// column holds string values verbatim and string predicates match on the
// actual characters. bad-dbms is a numeric column store and is suspected of
// coercing text through Number(); if so these tests fail honestly. They are
// written to the correct string spec and never weakened to a numeric one.
// A directory of people with string names, mixed case so case-sensitive and
// case-insensitive predicates can both be attacked.
const seededPeople = async () => {
        const t = table('people', {
                id: integer('id').primaryKey(),
                name: text('name'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, name: 'alice' },
                { id: 2, name: 'Bob' },
                { id: 3, name: 'amir' },
                { id: 4, name: 'Carol' },
                { id: 5, name: 'alice' },
        ])
        return { db, t: db.tables.t }
}
describe('text column predicates in a where clause', () => {
        // A reader filtering a directory by name expects string equality,
        // LIKE patterns, and case rules to behave exactly as SQL defines.
        it('an exact-string equality keeps every row carrying that name', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(eq(t.name, 'alice'))
                // two people are named alice
                expect(idsOf(rows)).toEqual([1, 5])
        })
        it('a string equality is case-sensitive, so a wrong-case name matches nothing', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(eq(t.name, 'ALICE'))
                expect(rows).toEqual([])
        })
        it('a string inequality keeps every row whose name differs', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(ne(t.name, 'alice'))
                expect(idsOf(rows)).toEqual([2, 3, 4])
        })
        it('a LIKE prefix pattern keeps the rows whose name starts with the literal', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(like(t.name, 'a%'))
                // alice, amir, alice all start with lowercase a
                expect(idsOf(rows)).toEqual([1, 3, 5])
        })
        it('a LIKE suffix pattern keeps the rows whose name ends with the literal', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(like(t.name, '%ice'))
                expect(idsOf(rows)).toEqual([1, 5])
        })
        it('a LIKE single-character wildcard matches exactly one position', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(like(t.name, 'amir'))
                expect(idsOf(rows)).toEqual([3])
        })
        it('LIKE is case-sensitive, so a lowercase pattern misses a capitalised name', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(like(t.name, 'b%'))
                // Bob is capitalised; a lowercase b% must not match it
                expect(rows).toEqual([])
        })
        it('ilike matches case-insensitively, so a lowercase pattern catches a capitalised name', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(ilike(t.name, 'b%'))
                expect(idsOf(rows)).toEqual([2])
        })
        it('notLike keeps every row whose name does not match the pattern', async () => {
                const { db, t } = await seededPeople()
                const rows = await db.select().from(t).where(notLike(t.name, 'a%'))
                expect(idsOf(rows)).toEqual([2, 4])
        })
        it('inArray over a list of strings keeps the rows whose name is in the list', async () => {
                const { db, t } = await seededPeople()
                const rows = await db
                        .select()
                        .from(t)
                        .where(inArray(t.name, ['amir', 'Carol']))
                expect(idsOf(rows)).toEqual([3, 4])
        })
        it('notInArray over a list of strings keeps the rows whose name is absent from it', async () => {
                const { db, t } = await seededPeople()
                const rows = await db
                        .select()
                        .from(t)
                        .where(notInArray(t.name, ['alice']))
                expect(idsOf(rows)).toEqual([2, 3, 4])
        })
        it('a text filter reads the surviving names back as their original strings', async () => {
                const { db, t } = await seededPeople()
                const rows = (await db.select().from(t).where(eq(t.name, 'Bob'))) as { id: number; name: string }[]
                expect(rows[0].name).toBe('Bob')
        })
        it('an empty-string name is a real value distinct from a missing one', async () => {
                const t = table('labels', {
                        id: integer('id').primaryKey(),
                        tag: text('tag'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, tag: '' },
                        { id: 2, tag: 'x' },
                ])
                const rows = await db.select().from(db.tables.t).where(eq(db.tables.t.tag, ''))
                expect(idsOf(rows)).toEqual([1])
        })
})

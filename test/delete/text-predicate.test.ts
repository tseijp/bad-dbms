import { describe, it, expect } from 'vitest'
import { database, table, integer, text, eq, like } from '../../src/index'
import { idsOf } from '../_helpers'
describe('deleting rows selected by a text predicate', () => {
        // A text column holds string values. A delete driven by a
        // string equality or LIKE pattern must match on the actual
        // string content.
        const seededText = async () => {
                const t = table('people', {
                        id: integer('id').primaryKey(),
                        name: text('name'),
                })
                const db = database({ t })
                await db.insert(db.tables.t).values([
                        { id: 1, name: 'alice' },
                        { id: 2, name: 'bob' },
                        { id: 3, name: 'amir' },
                ])
                return { db, t: db.tables.t }
        }
        it('deleting by an exact name removes the row carrying that string', async () => {
                const { db, t } = await seededText()
                await db.delete(t).where(eq(t.name, 'bob'))
                const rows = await db.select().from(t)
                expect(idsOf(rows)).toEqual([1, 3])
        })
        it('deleting by a LIKE prefix removes every row whose name matches the pattern', async () => {
                const { db, t } = await seededText()
                await db.delete(t).where(like(t.name, 'a%'))
                const rows = await db.select().from(t)
                // alice and amir both start with 'a'; only bob survives
                expect(idsOf(rows)).toEqual([2])
        })
        it('a text delete reads the surviving names back as their original strings', async () => {
                const { db, t } = await seededText()
                await db.delete(t).where(eq(t.name, 'alice'))
                const rows = (await db.select().from(t)) as { id: number; name: string }[]
                const survivor = rows.find((r) => r.id === 2)
                expect(survivor?.name).toBe('bob')
        })
})

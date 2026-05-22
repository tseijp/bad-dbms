import { describe, it, expect } from 'vitest'
import { count } from '../../src/index'
import { seedUsers } from '../_helpers'
import { rowsOf, aggRow, freshUsers } from './helpers'
// aggregate feature: the result shape of a count projection. Drizzle's
// select() always resolves to an array of row objects, even for a single
// aggregate. bad-dbms unwraps it to a bare object, so these fail honestly.
describe('count result shape', () => {
        it('resolves a count projection to an array of one row', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(Array.isArray(result)).toBe(true)
        })
        it('places the count alias on the single row of the result array', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(Object.keys(aggRow(result))).toEqual(['n'])
        })
        it('resolves an un-seeded count projection to an array of one row', async () => {
                const { db } = freshUsers()
                const result = await db.select({ n: count() }).from(db.tables.users)
                expect(rowsOf(result)).toHaveLength(1)
        })
        it('keeps the count value on row index zero of the array', async () => {
                const { db, users } = await seedUsers()
                const result = await db.select({ n: count() }).from(users)
                expect(rowsOf(result)[0]).toEqual({ n: 3 })
        })
})

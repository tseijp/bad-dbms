import { describe, it, expect } from 'vitest'
import { gt } from '../../src/index'
import { seedUsers } from '../_helpers'
import { freshUsers } from './helpers'
// aggregate feature: the $count shortcut (Drizzle parity). db.$count(table)
// is a Drizzle convenience resolving directly to a number, optionally taking
// a predicate. bad-dbms exposes no $count method, so these fail honestly via
// a runtime error; they are never weakened to pass.
describe('$count shortcut (Drizzle parity)', () => {
        it('resolves db.$count(users) to the seeded row count', async () => {
                const { db, users } = await seedUsers()
                const n = await db.$count(users)
                expect(n).toBe(3)
        })
        it('resolves db.$count with a predicate to the filtered count', async () => {
                const { db, users } = await seedUsers()
                const n = await db.$count(users, gt(users.score, 15))
                expect(n).toBe(2)
        })
        it('resolves db.$count to zero on an un-seeded table', async () => {
                const { db } = freshUsers()
                const n = await db.$count(db.tables.users)
                expect(n).toBe(0)
        })
        it('seeds, deletes a row, then re-reads db.$count to the new total', async () => {
                const { db, users } = await seedUsers()
                const before = await db.$count(users)
                await db.delete(users).where(gt(users.id, 2))
                const after = await db.$count(users)
                expect([before, after]).toEqual([3, 2])
        })
})

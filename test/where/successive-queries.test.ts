import { describe, it, expect } from 'vitest'
import { eq, gt, gte, lt, and, between } from '../../src/index'
import { seedUsers } from '../_helpers'
import { idsOf } from './_fixtures'

describe('refining a filter across successive queries', () => {
        // A realistic exploratory flow: a reader runs one query, looks at
        // the result, then re-filters the same seed to drill down or back
        // out. Every step builds a fresh predicate on the same db, and
        // the scenarios verify the result set evolves coherently.
        it('a reader tightening the score cutoff in three passes watches the result shrink', async () => {
                const { db, users } = await seedUsers()
                const broad = await db.select().from(users).where(gt(users.score, 0))
                const strict = await db.select().from(users).where(gt(users.score, 15))
                const strictest = await db.select().from(users).where(gt(users.score, 25))
                expect([idsOf(broad), idsOf(strict), idsOf(strictest)]).toEqual([[1, 2, 3], [2, 3], [3]])
        })

        it('adding a second bound to drill down keeps only a subset of the first result', async () => {
                const { db, users } = await seedUsers()
                const first = await db.select().from(users).where(gt(users.score, 5))
                const second = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 5), lt(users.score, 25)))
                const firstIds = idsOf(first)
                const secondIds = idsOf(second)
                expect(secondIds.every((id) => firstIds.includes(id))).toBe(true)
        })

        it('a reader splitting the table by a cutoff and then merging the halves recovers everything', async () => {
                const { db, users } = await seedUsers()
                const matched = await db.select().from(users).where(gte(users.score, 20))
                const rest = await db.select().from(users).where(lt(users.score, 20))
                expect(idsOf([...matched, ...rest])).toEqual([1, 2, 3])
        })

        it('switching to a wider predicate after a narrow one does not leak the narrow filter', async () => {
                const { db, users } = await seedUsers()
                const narrow = await db.select().from(users).where(eq(users.id, 1))
                expect(idsOf(narrow)).toEqual([1])
                const wide = await db.select().from(users).where(gt(users.score, 0))
                expect(idsOf(wide)).toEqual([1, 2, 3])
        })

        it('an unfiltered read after a filtered read still returns the whole table', async () => {
                const { db, users } = await seedUsers()
                const filtered = await db.select().from(users).where(eq(users.id, 2))
                expect(idsOf(filtered)).toEqual([2])
                const all = await db.select().from(users)
                expect(idsOf(all)).toEqual([1, 2, 3])
        })

        it('three independent equality probes in scrambled order each return their own row', async () => {
                const { db, users } = await seedUsers()
                const third = await db.select().from(users).where(eq(users.id, 3))
                const first = await db.select().from(users).where(eq(users.id, 1))
                const second = await db.select().from(users).where(eq(users.id, 2))
                expect([idsOf(third), idsOf(first), idsOf(second)]).toEqual([[3], [1], [2]])
        })

        it('re-running the identical range predicate twice yields identical surviving sets', async () => {
                const { db, users } = await seedUsers()
                const once = await db
                        .select()
                        .from(users)
                        .where(between(users.score, 10, 20))
                const twice = await db
                        .select()
                        .from(users)
                        .where(between(users.score, 10, 20))
                expect(idsOf(once)).toEqual(idsOf(twice))
        })

        it('a reader who over-narrows then backs off one bound recovers the dropped row', async () => {
                const { db, users } = await seedUsers()
                const overNarrow = await db
                        .select()
                        .from(users)
                        .where(and(gt(users.score, 15), lt(users.score, 25)))
                expect(idsOf(overNarrow)).toEqual([2])
                const backedOff = await db.select().from(users).where(gt(users.score, 15))
                expect(idsOf(backedOff)).toEqual([2, 3])
        })
})

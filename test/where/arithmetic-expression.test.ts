import { describe, it, expect } from 'vitest'
import { database, table, integer, eq, gt, lt, between } from '../../src/index'
import { seedUsers, seedPosts } from '../_helpers'
import { idsOf } from './_fixtures'

// A table with a nullable score: id 2 holds genuine NULL. Used to attack
// arithmetic over a NULL operand, which yields NULL in SQL.
const seededNullableScore = async () => {
        const t = table('calc', {
                id: integer('id').primaryKey(),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, score: 10 },
                { id: 2 },
                { id: 3, score: 30 },
        ])
        return { db, t: db.tables.t }
}

describe('predicates over an arithmetic expression', () => {
        // A reader can filter on a computed value — score shifted,
        // scaled, divided, or mixed with another column — instead of the
        // stored value itself. Each scenario builds the expression
        // predicate and cross-checks it against an equivalent filter.
        it('awarding a flat bonus before the cutoff is the same as lowering the cutoff', async () => {
                const { db, users } = await seedUsers()
                // scores+5 are 15/25/35; >20 keeps ids 2 and 3
                const bonused = await db.select().from(users).where(gt(users.score.add(5), 20))
                expect(idsOf(bonused)).toEqual([2, 3])
                // the same survivors come from comparing the raw score to 15
                const lowered = await db.select().from(users).where(gt(users.score, 15))
                expect(idsOf(lowered)).toEqual(idsOf(bonused))
        })

        it('a per-row computed equality between score-over-ten and id matches the whole seed', async () => {
                const { db, users } = await seedUsers()
                // score/10 is 1/2/3, exactly each row's id
                const aligned = await db.select().from(users).where(eq(users.score.div(10), users.id))
                expect(idsOf(aligned)).toEqual([1, 2, 3])
        })

        it('scaling a post score before a literal cutoff keeps the quiet posts', async () => {
                const { db, posts } = await seedPosts()
                // score*2 is 10/14/18/8; <12 keeps ids 1 and 4
                const quiet = await db.select().from(posts).where(lt(posts.score.mul(2), 12))
                expect(idsOf(quiet)).toEqual([1, 4])
        })

        it('chaining a bonus then a doubling before the cutoff isolates the top row', async () => {
                const { db, users } = await seedUsers()
                // (score+5)*2 is 30/50/70; >50 keeps only id 3
                const top = await db.select().from(users).where(gt(users.score.add(5).mul(2), 50))
                expect(idsOf(top)).toEqual([3])
        })

        it('docking a penalty from the score brings the high rows back under a cutoff', async () => {
                const { db, users } = await seedUsers()
                // score-5 is 5/15/25; <20 keeps ids 1 and 2
                const penalised = await db.select().from(users).where(lt(users.score.sub(5), 20))
                expect(idsOf(penalised)).toEqual([1, 2])
        })

        it('a between over a doubled column ranges on the computed value, not the stored one', async () => {
                const { db, users } = await seedUsers()
                // score*2 is 20/40/60; the band 30..50 catches only id 2
                const ranged = await db.select().from(users).where(between(users.score.mul(2), 30, 50))
                expect(idsOf(ranged)).toEqual([2])
        })

        it('an expression mixing two columns of a post row drives the filter', async () => {
                const { db, posts } = await seedPosts()
                // score+userId is 6/8/11/7 for ids 1..4; only id 3 exceeds 8
                const rows = await db.select().from(posts).where(gt(posts.score.add(posts.userId), 8))
                expect(idsOf(rows)).toEqual([3])
        })

        it('the same survivors come from a shifted expression and a shifted literal', async () => {
                const { db, users } = await seedUsers()
                const viaExpr = await db.select().from(users).where(gt(users.score.add(10), 25))
                const viaLiteral = await db.select().from(users).where(gt(users.score, 15))
                expect(idsOf(viaExpr)).toEqual(idsOf(viaLiteral))
        })

        // Arithmetic that touches a NULL operand produces NULL in SQL, and a
        // comparison against that NULL result is UNKNOWN. The null row must
        // drop out — it must not be treated as if its score were zero.
        it('adding a constant to a null column yields null, so the comparison drops the row', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(gt(t.score.add(5), 0))
                // id 2: NULL + 5 = NULL; NULL > 0 is unknown -> excluded
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('multiplying a null column by zero still yields null, not zero', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(eq(t.score.mul(0), 0))
                // for ids 1 and 3, score*0 = 0; for id 2, NULL*0 = NULL != 0
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('a between over a null-bearing arithmetic expression drops the null row', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(between(t.score.add(1), 0, 1000))
                expect(idsOf(rows)).toEqual([1, 3])
        })

        it('a less-than over a null arithmetic result excludes the null row rather than counting it as zero', async () => {
                const { db, t } = await seededNullableScore()
                const rows = await db.select().from(t).where(lt(t.score.sub(100), 0))
                // if NULL were treated as 0, id 2 would pass (0-100 < 0); under SQL it must not
                expect(idsOf(rows)).toEqual([1, 3])
        })
})

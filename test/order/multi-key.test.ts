import { describe, it, expect } from 'vitest'
import { database, table, integer, asc, desc } from '../../src/index'
import { fresh } from '../_helpers'
import { makeRanked, seqOf } from './helpers'
// A two-key table whose secondary key is nullable, so the placement of NULL
// inside a tie group can be attacked. rank groups rows; score, when present,
// orders within a group; some rows leave score NULL.
const seededNullableSecondary = async () => {
        const t = table('partial', {
                id: integer('id').primaryKey(),
                rank: integer('rank'),
                score: integer('score'),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values([
                { id: 1, rank: 1, score: 50 },
                { id: 2, rank: 1 },
                { id: 3, rank: 1, score: 20 },
                { id: 4, rank: 2, score: 5 },
        ])
        return { db, t: db.tables.t }
}
describe('multi-key ordering breaks ties with a secondary key', () => {
        // A reader sorts a ranked board by rank, then settles rows of
        // equal rank by score. The secondary key only matters inside a
        // tie of the primary key.
        const board = [
                { id: 1, rank: 2, score: 50 },
                { id: 2, rank: 1, score: 30 },
                { id: 3, rank: 2, score: 10 },
                { id: 4, rank: 1, score: 80 },
                { id: 5, rank: 3, score: 40 },
        ]
        it('sorting by rank ascending then score ascending orders within each rank', async () => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.rank), asc(t.score))
                expect(seqOf(rows, 'id')).toEqual([2, 4, 3, 1, 5])
        })
        it('sorting by rank ascending then score descending flips only the in-rank order', async () => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.rank), desc(t.score))
                expect(seqOf(rows, 'id')).toEqual([4, 2, 1, 3, 5])
        })
        it('sorting by rank descending then score ascending reverses ranks but not in-rank order', async () => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(desc(t.rank), asc(t.score))
                expect(seqOf(rows, 'id')).toEqual([5, 3, 1, 2, 4])
        })
        it('the secondary key is consulted only when the primary key ties', async () => {
                const { db, t } = fresh(makeRanked)
                // every rank distinct: the score key can never come into play
                await db.insert(t).values([
                        { id: 1, rank: 3, score: 99 },
                        { id: 2, rank: 1, score: 1 },
                        { id: 3, rank: 2, score: 50 },
                ])
                const rows = await db.select().from(t).orderBy(asc(t.rank), desc(t.score))
                expect(seqOf(rows, 'id')).toEqual([2, 3, 1])
        })
        it('a two-key sort yields the primary key in non-decreasing order throughout', async () => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(asc(t.rank), asc(t.score))
                const ranks = seqOf(rows, 'rank') as number[]
                const sorted = [...ranks].sort((a, b) => a - b)
                expect(ranks).toEqual(sorted)
        })
        it.each([
                ['rank asc, score asc', asc, asc, [2, 4, 3, 1, 5]],
                ['rank asc, score desc', asc, desc, [4, 2, 1, 3, 5]],
                ['rank desc, score asc', desc, asc, [5, 3, 1, 2, 4]],
                ['rank desc, score desc', desc, desc, [5, 1, 3, 4, 2]],
        ] as const)('the ranked board under %s produces the documented id order', async (_label, rankDir, scoreDir, expected) => {
                const { db, t } = fresh(makeRanked)
                await db.insert(t).values(board)
                const rows = await db.select().from(t).orderBy(rankDir(t.rank), scoreDir(t.score))
                expect(seqOf(rows, 'id')).toEqual(expected)
        })
        // The scenarios below attack NULL placement inside a tie group: when
        // the primary key ties, the secondary key orders the group, and a
        // NULL secondary value goes to the SQL-defined end of that group.
        it('inside a tied rank group an ascending secondary key puts the NULL-scored row first', async () => {
                const { db, t } = await seededNullableSecondary()
                const rows = await db.select().from(t).orderBy(asc(t.rank), asc(t.score))
                // rank-1 group: NULL (id 2) first, then 20 (id 3), 50 (id 1); rank-2: id 4
                expect(seqOf(rows, 'id')).toEqual([2, 3, 1, 4])
        })
        it('inside a tied rank group a descending secondary key puts the NULL-scored row last', async () => {
                const { db, t } = await seededNullableSecondary()
                const rows = await db.select().from(t).orderBy(asc(t.rank), desc(t.score))
                // rank-1 group: 50 (id 1), 20 (id 3), NULL (id 2) last; rank-2: id 4
                expect(seqOf(rows, 'id')).toEqual([1, 3, 2, 4])
        })
        it('the non-null secondary values still order correctly around the NULL', async () => {
                const { db, t } = await seededNullableSecondary()
                const rows = await db.select().from(t).orderBy(asc(t.rank), asc(t.score))
                const rankOne = rows.filter((r: { rank: number | null }) => r.rank === 1)
                const nonNull = (seqOf(rankOne, 'score') as (number | null)[]).filter((s) => s != null)
                expect(nonNull).toEqual([20, 50])
        })
})

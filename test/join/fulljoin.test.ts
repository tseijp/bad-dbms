import { describe, it, expect } from 'vitest'
import { eq } from '../../src/index'
import { rowsOf, fullJoin, seedPair } from './helpers'
// join feature: fullJoin keeps every row from both tables, null-filling
// whichever side has no match. Expectations follow the correct Drizzle spec;
// a missing builder fails honestly at runtime.
describe('fullJoin keeps unmatched rows from both sides', () => {
        it('returns matched pairs plus orphans from both tables', async () => {
                const { db, l, r } = await seedPair(
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [
                                [1, 1, 100],
                                [2, 9, 200],
                        ],
                )
                const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(3)
        })
        it('null-fills the right side for a left-only row in a full join', async () => {
                const { db, l, r } = await seedPair(
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [[1, 1, 100]],
                )
                const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result).find((row) => row.id === 2).rv).toBeNull()
        })
        it('null-fills the left side for a right-only row in a full join', async () => {
                const { db, l, r } = await seedPair(
                        [[1, 10]],
                        [
                                [1, 1, 100],
                                [2, 9, 200],
                        ],
                )
                const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result).find((row) => row.rv === 200).id).toBeNull()
        })
        it('agrees with the inner join when both tables fully match', async () => {
                const { db, l, r } = await seedPair(
                        [
                                [1, 10],
                                [2, 20],
                        ],
                        [
                                [1, 1, 100],
                                [2, 2, 200],
                        ],
                )
                const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(2)
        })
        // dense matrix: a fixed left pair full-joined to a varying right table.
        // The full-join row count is the matched pairs, plus left orphans,
        // plus right orphans.
        const leftPair: Array<[number, number]> = [
                [1, 10],
                [2, 20],
        ]
        it.each([
                ['no right rows', [] as Array<[number, number, number]>, 2],
                [
                        'both matched',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                        ] as Array<[number, number, number]>,
                        2,
                ],
                ['one matched one left orphan', [[1, 1, 1]] as Array<[number, number, number]>, 2],
                [
                        'one matched one right orphan',
                        [
                                [1, 1, 1],
                                [2, 9, 2],
                        ] as Array<[number, number, number]>,
                        3,
                ],
                [
                        'all orphan both sides',
                        [
                                [1, 8, 1],
                                [2, 9, 2],
                        ] as Array<[number, number, number]>,
                        4,
                ],
                [
                        'fan-out plus right orphan',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 9, 3],
                        ] as Array<[number, number, number]>,
                        4,
                ],
        ])('full-joins the %s right table to a fixed left pair', async (_label, right, expected) => {
                const { db, l, r } = await seedPair(leftPair, right)
                const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
})

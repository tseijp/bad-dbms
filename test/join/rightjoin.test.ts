import { describe, it, expect } from 'vitest'
import { rowsOf } from '../_helpers'
import { seedPair } from './helpers'
import { eq } from '../../src/index'
// join feature: rightJoin keeps every right row and null-fills the unmatched
// left side. It is the mirror of leftJoin. Expectations follow the correct
// Drizzle spec; a missing builder fails honestly at runtime.
describe('rightJoin keeps every right row', () => {
        it('keeps an unmatched right row with a null-filled left side', async () => {
                const { db, l, r } = await seedPair(
                        [[1, 10]],
                        [
                                [1, 1, 100],
                                [2, 9, 200],
                        ],
                )
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).rightJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('null-fills the left valuesOf for the unmatched right row', async () => {
                const { db, l, r } = await seedPair(
                        [[1, 10]],
                        [
                                [1, 1, 100],
                                [2, 9, 200],
                        ],
                )
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).rightJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result).find((row) => row.rv === 200)!.id).toBeNull()
        })
        it('agrees with the inner join when every right row matches', async () => {
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
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).rightJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('keeps all right rows present for a one-to-many fan-out', async () => {
                const { db, l, r } = await seedPair(
                        [[1, 10]],
                        [
                                [1, 1, 100],
                                [2, 1, 200],
                                [3, 1, 300],
                        ],
                )
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).rightJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(3)
        })
        // dense matrix: a fixed left pair right-joined to a varying right
        // table. The right-join row count equals the number of right rows.
        const leftPair = [
                [1, 10],
                [2, 20],
        ]
        it.each([
                ['one right row matched', [[1, 1, 100]], 1],
                ['one right row orphan', [[1, 9, 100]], 1],
                [
                        'two matched',
                        [
                                [1, 1, 1],
                                [2, 2, 2],
                        ],
                        2,
                ],
                [
                        'two orphan',
                        [
                                [1, 8, 1],
                                [2, 9, 2],
                        ],
                        2,
                ],
                [
                        'three mixed',
                        [
                                [1, 1, 1],
                                [2, 9, 2],
                                [3, 2, 3],
                        ],
                        3,
                ],
                [
                        'fan-out then orphan',
                        [
                                [1, 1, 1],
                                [2, 1, 2],
                                [3, 9, 3],
                        ],
                        3,
                ],
        ])('right-joins the %s right table to a fixed left pair', async (_label, right, expected) => {
                const { db, l, r } = await seedPair(leftPair, right)
                const result = await db.select({ id: l.id, rv: r.rv }).from(l).rightJoin(r, eq(r.fk, l.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
})

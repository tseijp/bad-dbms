import { describe, it, expect } from 'vitest'
import { rowsOf, valuesOf } from '../_helpers'
import { seedNodeChain, seedPair } from './helpers'
import { eq } from '../../src/index'
// join feature: a self join matches a table against itself, pairing a child
// row to its parent row in the same table. Expectations follow the correct
// Drizzle spec; a missing builder fails honestly at runtime.
describe('self join pairs a table with itself', () => {
        it('pairs each non-root node with its parent', async () => {
                const { db, nodes } = await seedNodeChain()
                const result = await db.select({ child: nodes.id, parent: nodes.id }).from(nodes).innerJoin(nodes, eq(nodes.parentId, nodes.id))
                expect(rowsOf(result)).toHaveLength(2)
        })
        it('matches child 2 to parent 1 in the node chain', async () => {
                const { db, nodes } = await seedNodeChain()
                const result = await db.select({ child: nodes.id, parentId: nodes.parentId }).from(nodes).innerJoin(nodes, eq(nodes.parentId, nodes.id))
                expect(
                        rowsOf(result)
                                .map((row) => row.child)
                                .slice()
                                .sort(),
                ).toEqual([2, 3])
        })
        it('produces no self-join row for the root node', async () => {
                const { db, nodes } = await seedNodeChain()
                const result = await db.select({ child: nodes.id }).from(nodes).innerJoin(nodes, eq(nodes.parentId, nodes.id))
                expect(valuesOf(result, 'child').includes(1)).toBe(false)
        })
        // dense matrix: a generic table self-joined on fk -> id. With a fixed
        // set of rows, the self-join pairs each row whose fk points at an
        // existing id in the same table.
        it.each([
                [
                        'three-row chain',
                        [
                                [1, 0, 10],
                                [2, 1, 20],
                                [3, 2, 30],
                        ],
                        2,
                ],
                [
                        'flat fan to root',
                        [
                                [1, 0, 10],
                                [2, 1, 20],
                                [3, 1, 30],
                                [4, 1, 40],
                        ],
                        3,
                ],
                [
                        'no parents',
                        [
                                [1, 0, 10],
                                [2, 0, 20],
                                [3, 0, 30],
                        ],
                        0,
                ],
                [
                        'single child',
                        [
                                [1, 0, 10],
                                [2, 1, 20],
                        ],
                        1,
                ],
                [
                        'dangling parent ids',
                        [
                                [1, 9, 10],
                                [2, 9, 20],
                        ],
                        0,
                ],
        ])('self-joins the %s into the right pair count', async (_label, rows, expected) => {
                const { db, r } = await seedPair([], rows)
                const result = await db.select({ child: r.id, parentId: r.fk }).from(r).innerJoin(r, eq(r.fk, r.id))
                expect(rowsOf(result)).toHaveLength(expected)
        })
        it('seeds a chain, adds a node, then re-counts the self-join pairs', async () => {
                const { db, nodes } = await seedNodeChain()
                const before = await db.select({ child: nodes.id }).from(nodes).innerJoin(nodes, eq(nodes.parentId, nodes.id))
                await db.insert(nodes).values({ id: 4, parentId: 3 })
                const after = await db.select({ child: nodes.id }).from(nodes).innerJoin(nodes, eq(nodes.parentId, nodes.id))
                expect([rowsOf(before).length, rowsOf(after).length]).toEqual([2, 3])
        })
})

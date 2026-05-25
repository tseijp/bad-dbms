import { describe, it, expect } from 'vitest'
import { database, eq } from '../../src/index'
import { makeNodes, idsOf } from './_fixtures'
describe('multi-level cascade through a self-referential tree', () => {
        // A node tree 1 -> 2 -> 3 -> 4 wired parent-to-child. Deleting
        // the root must, under cascading referential integrity, remove
        // the entire subtree, not just the direct child.
        const seededTree = async () => {
                const nodes = makeNodes()
                const db = database({ nodes })
                await db.insert(db.tables.nodes).values([
                        { id: 1, parentId: 0 },
                        { id: 2, parentId: 1 },
                        { id: 3, parentId: 2 },
                        { id: 4, parentId: 3 },
                ])
                return { db, nodes }
        }
        it('deleting a parent removes its direct children', async () => {
                const { db, nodes } = await seededTree()
                await db.delete(nodes).where(eq(nodes.id, 3))
                // node 4 hangs off node 3 and must go with it
                const rows = await db.select().from(nodes)
                expect(idsOf(rows)).toEqual([1, 2])
        })
        it('deleting the root collapses the entire subtree beneath it', async () => {
                const { db, nodes } = await seededTree()
                await db.delete(nodes).where(eq(nodes.id, 1))
                const rows = await db.select().from(nodes)
                expect(rows).toEqual([])
        })
        it('deleting a mid-tree node removes only that node and its descendants', async () => {
                const { db, nodes } = await seededTree()
                await db.delete(nodes).where(eq(nodes.id, 2))
                const rows = await db.select().from(nodes)
                expect(idsOf(rows)).toEqual([1])
        })
})

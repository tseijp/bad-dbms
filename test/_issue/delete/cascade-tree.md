# Issue: delete/cascade-tree — multi-level cascade through self-referential FK not applied

Test file: `test/delete/cascade-tree.test.ts`
Result: 3 failed / 3 total

## Summary

Deleting a node in a self-referential tree table (FK `parent_id` declared with
`onDelete: 'cascade'`) does not remove its descendants. No level of cascade is observed.

## Observed failures

### deleting a parent removes its direct children
- Action: delete a node, then `db.select().from(nodes)`.
- Expected remaining ids: `[1, 2]`
- Observed remaining ids: `[1, 2, 4]` (child node 4 still present)

### deleting the root collapses the entire subtree beneath it
- Action: `db.delete(nodes).where(eq(nodes.id, 1))` (root), then read `nodes`.
- Expected: `[]`
- Observed: nodes with ids 2, 3, 4 still present.

### deleting a mid-tree node removes only that node and its descendants
- Action: `db.delete(nodes).where(eq(nodes.id, 2))`, then read `nodes`.
- Expected remaining ids: `[1]`
- Observed remaining ids: `[1, 3, 4]`

## Observed capability gap

For a self-referential foreign key with `onDelete: 'cascade'`, deleting a node leaves
its direct children and deeper descendants in the table. Neither single-level nor
multi-level cascades are observed.

## Side observation

Read-back rows expose the column under the key `parent_id` and report `parent_id` as `0`
rather than the seeded parent reference values.

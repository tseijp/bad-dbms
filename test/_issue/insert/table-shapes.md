# insert/table-shapes — observed failures

Run: `npx vitest run --no-coverage test/insert/table-shapes.test.ts`
Result: 13 tests, 2 failed, 11 passed.

## summary

- A column inserted under its camelCase property name is read back as `0` under its renamed (snake_case) column name.

## failures

### posts row reads back its renamed user_id column
- 操作: `db.insert(posts).values({ id: 1, userId: 5, score: ... })`, then `db.select().from(posts)`.
- 期待: `rows[0].user_id` is `5`.
- 観測: `rows[0].user_id` is `0`.

### nodes table accepts a self-reference shaped row
- 操作: `db.insert(nodes).values({ id: 2, parentId: 1 })`, then `db.select().from(nodes)`.
- 期待: `rows[0].parent_id` is `1`.
- 観測: `rows[0].parent_id` is `0`.

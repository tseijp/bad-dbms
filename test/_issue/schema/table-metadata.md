# schema/table-metadata — observed failures

Test run: `npx vitest run --no-coverage test/schema/table-metadata.test.ts`
Result: 9 failed / 8 passed (17 total)

## summary

Observed from the `getTableColumns` and `getTableConfig` introspection helpers:

- Neither `getTableColumns` nor `getTableConfig` is exported from `src/index`; calling them throws `TypeError: getTableColumns is not a function` / `TypeError: getTableConfig is not a function`.
- All 9 introspection-parity tests fail with these `TypeError`s.

The 8 passing tests cover the non-introspection table structure: `node.name`, `$meta.name`, `$meta.columns` is an array, two declarations are independent, and a 12-column table reports length 12.

## failures

### returns the column keys from getTableColumns
- 操作: `table('t', { id: integer('id'), name: text('name') })`, then call `getTableColumns(t)`.
- 期待: keys `['id', 'name']`.
- 観測: `TypeError: getTableColumns is not a function`.

### returns the identical column object from getTableColumns
- 操作: same table, then compare `getTableColumns(t).id` with `t.id`.
- 期待: same object reference.
- 観測: `TypeError: getTableColumns is not a function`.

### returns one entry per declared column from getTableColumns
- 操作: a 3-column table, then call `getTableColumns(t)`.
- 期待: 3 keys.
- 観測: `TypeError: getTableColumns is not a function`.

### returns the table name from getTableConfig
- 操作: `table('users', {...})`, then call `getTableConfig(t)`.
- 期待: `config.name` is `'users'`.
- 観測: `TypeError: getTableConfig is not a function`.

### returns the column list length from getTableConfig
- 操作: a 3-column table, then call `getTableConfig(t)`.
- 期待: `config.columns` has length 3.
- 観測: `TypeError: getTableConfig is not a function`.

### lists the primary-key column from getTableConfig
- 操作: a table with `id: integer('id').primaryKey()`, then call `getTableConfig(t)`.
- 期待: `config.primaryKeys` column names contain `'id'`.
- 観測: `TypeError: getTableConfig is not a function`.

### lists a foreign key from getTableConfig
- 操作: `posts` referencing `users`, then call `getTableConfig(posts)`.
- 期待: `config.foreignKeys.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### lists a unique constraint from getTableConfig
- 操作: a table with `email: text('email').unique()`, then call `getTableConfig(t)`.
- 期待: `config.uniqueConstraints.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### reports empty primary-key, foreign-key and unique lists for a bare table
- 操作: `table('t', { a: integer('a'), b: integer('b') })`, then call `getTableConfig(t)`.
- 期待: `[primaryKeys, foreignKeys, uniqueConstraints]` equals `[[], [], []]`.
- 観測: `TypeError: getTableConfig is not a function`.

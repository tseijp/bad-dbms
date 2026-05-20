# schema/table — observed failures

Test run: `npx vitest run --no-coverage test/schema/table.test.ts`
Result: 11 failed / 12 passed (23 total)

## summary

Observed from `table()` declarations and the `getTableColumns` introspection helper:

- `getTableColumns` is not exported from `src/index`; calling it throws `TypeError: getTableColumns is not a function`.
- A column exposes no `name` property; `column.name` returns `undefined`.

The 12 passing tests cover non-introspection table structure: table name preservation via `$meta.name`, distinct table references, and a declared column appearing as a table property.

## failures

### keeps declared column order through getTableColumns
- 操作: a 3-column table, then `Object.values(getTableColumns(t)).map(c => c.name)`.
- 期待: `['id', 'name', 'score']`.
- 観測: `TypeError: getTableColumns is not a function`.

### reports three columns through getTableColumns
- 操作: a 3-column table, then `Object.keys(getTableColumns(t))`.
- 期待: length 3.
- 観測: `TypeError: getTableColumns is not a function`.

### declares a table with 1 / 2 / 3 / 5 columns
- 操作: tables of 1, 2, 3, 5 columns, then `Object.keys(getTableColumns(t))`.
- 期待: the matching column count.
- 観測: `TypeError: getTableColumns is not a function`.

### keeps two same-named tables independent in their column sets
- 操作: declare `table('t', { id })` and another `table('t', { id, extra })`, then `getTableColumns` on the first.
- 期待: 1 key.
- 観測: `TypeError: getTableColumns is not a function`.

### reports a one-column table through getTableColumns
- 操作: `table('solo', { only: integer('only') })`, then `Object.keys(getTableColumns(solo))`.
- 期待: length 1.
- 観測: `TypeError: getTableColumns is not a function`.

### reports the single column name of a one-column table
- 操作: same table, then `columnNames(solo)` via `getTableColumns`.
- 期待: `['only']`.
- 観測: `TypeError: getTableColumns is not a function`.

### exposes the same column object on the property and via getTableColumns
- 操作: `table('users', { id: integer('id') })`, then compare `getTableColumns(users).id` with `users.id`.
- 期待: same object reference.
- 観測: `TypeError: getTableColumns is not a function`.

### keeps the column name on the public column property
- 操作: `table('users', { id: integer('id') })`, then read `users.id.name`.
- 期待: `'id'`.
- 観測: `undefined`.

# schema/column-factory — observed failures

Test run: `npx vitest run --no-coverage test/schema/column-factory.test.ts`
Result: 20 failed / 11 passed (31 total)

## summary

Observed from the column factories (`integer`, `uint`, `float`, `text`) and the `table()` helper:

- A column built by a factory exposes no `name` property; reading `column.name` returns `undefined` even when the factory was given an explicit name.
- A column exposes no `dataType` property; reading `column.dataType` returns `undefined`.
- A column exposes no `columnType` property; reading `column.columnType` returns `undefined`.
- The `getTableColumns` introspection symbol is not exported from `src/index`; calling it throws `TypeError: getTableColumns is not a function`.

The 11 passing tests cover: a factory column appears as a table property, two factory columns of the same name are distinct objects, and same-named columns across two tables are distinct.

## failures

### keeps the explicit factory name for integer / uint / float / text
- 操作: `table('t', { c: <factory>('given_name') })`, then read `t.c.name`.
- 期待: `'given_name'`.
- 観測: `undefined`.

### reports a semantic data type for the integer / uint / float / text factory
- 操作: `table('t', { c: <factory>('c') })`, then read `t.c.dataType`. Expected category per factory: integer→`'integer'`, uint→`'integer'`, float→`'float'`, text→`'text'`.
- 期待: the semantic data type string.
- 観測: `undefined`.

### reports an integer data type for an integer column
- 操作: `table('t', { c: integer('c') })`, then read `t.c.dataType`.
- 期待: `'integer'`.
- 観測: `undefined`.

### reports an integer data type for a uint column
- 操作: `table('t', { c: uint('c') })`, then read `t.c.dataType`.
- 期待: `'integer'`.
- 観測: `undefined`.

### reports a float data type for a float column
- 操作: `table('t', { c: float('c') })`, then read `t.c.dataType`.
- 期待: `'float'`.
- 観測: `undefined`.

### reports a text data type for a text column
- 操作: `table('t', { c: text('c') })`, then read `t.c.dataType`.
- 期待: `'text'`.
- 観測: `undefined`.

### distinguishes an integer column from a text column by columnType
- 操作: `table('t', { n: integer('n'), s: text('s') })`, then compare `t.n.columnType` with `t.s.columnType`.
- 期待: the two values differ.
- 観測: both are `undefined`, so they are equal.

### tags an integer column with an integer columnType
- 操作: `table('t', { c: integer('c') })`, then check `String(t.c.columnType).toLowerCase()`.
- 期待: contains `'int'`.
- 観測: `String(undefined)` = `'undefined'`, does not contain `'int'`.

### tags a text column with a text columnType
- 操作: `table('t', { c: text('c') })`, then check `String(t.c.columnType).toLowerCase()`.
- 期待: contains `'text'`.
- 観測: `String(undefined)` = `'undefined'`, does not contain `'text'`.

### returns every declared column from getTableColumns
- 操作: `table('t', { id: integer('id'), label: text('label') })`, then call `getTableColumns(t)` (read off the namespace import).
- 期待: keys `['id', 'label']`.
- 観測: `TypeError: getTableColumns is not a function`.

### exposes the integer / uint / float / text column through getTableColumns
- 操作: `table('t', { c: <factory>('c') })`, then call `getTableColumns(t)`.
- 期待: `cols.c` is defined.
- 観測: `TypeError: getTableColumns is not a function`.

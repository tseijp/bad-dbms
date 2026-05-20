# schema/text-column — observed failures

Test run: `npx vitest run --no-coverage test/schema/text-column.test.ts`
Result: 13 failed / 3 passed (16 total)

## summary

Observed from the `text` column factory:

- A text column reports no `dataType` property; `column.dataType` returns `undefined`. On the underlying node, `column.node.dataType` reads `'u32'`.
- A text column exposes no `columnType` property; `column.columnType` returns `undefined`.
- A text column exposes no `name` property; `column.name` returns `undefined`.
- `column.default` is a `function` (chain method), not the stored default string. `column.hasDefault` reads `undefined`.
- `column.notNull` and `column.isUnique` are `function`s, not boolean flags. `column.primary` reads `undefined`.
- `column.defaultFn()` returns a SQL-like object `{ kind: 'sql', node: {...}, ... }`, not the generator's return value.

The 3 passing tests confirm `column.dataType` is not the numeric codes `'i32'` and `'f32'`, and `column.node.dataType` is not `'i32'` — observed values were `undefined` / `'u32'`.

## failures

### reports a string-denoting data type for a text column
- 操作: `table('t', { c: text('c') })`, then read `t.c.dataType`.
- 期待: `'text'`.
- 観測: `undefined`.

### tags a text column with a text columnType
- 操作: `table('t', { c: text('c') })`, then check `String(t.c.columnType).toLowerCase()`.
- 期待: contains `'text'`.
- 観測: `String(undefined)` = `'undefined'`, does not contain `'text'`.

### records a string-denoting dataType on the text column node
- 操作: `table('t', { c: text('c') })`, then read `t.c.node.dataType`.
- 期待: `'text'`.
- 観測: `'u32'`.

### does not record a numeric u32 dataType on the text column node
- 操作: `table('t', { c: text('c') })`, then read `t.c.node.dataType`.
- 期待: not `'u32'`.
- 観測: `'u32'`.

### keeps the explicit factory name on a text column
- 操作: `table('t', { c: text('given_name') })`, then read `t.c.name`.
- 期待: `'given_name'`.
- 観測: `undefined`.

### records a string default value on a text column
- 操作: `text('c').default('hello')`, then read `t.c.default`.
- 期待: `'hello'`.
- 観測: a `function`.

### records an empty-string default on a text column
- 操作: `text('c').default('')`, then read `t.c.default`.
- 期待: `''`.
- 観測: a `function`.

### marks hasDefault true on a text column with a string default
- 操作: `text('c').default('x')`, then read `t.c.hasDefault`.
- 期待: `true`.
- 観測: `undefined`.

### marks a notNull text column not-null on the public flag
- 操作: `text('c').notNull()`, then read `t.c.notNull`.
- 期待: `true`.
- 観測: a `function`.

### reports a plain text column as strictly nullable
- 操作: `table('t', { c: text('c') })`, then read `t.c.notNull`.
- 期待: `false`.
- 観測: a `function`.

### marks a primaryKey text column primary on the public flag
- 操作: `text('c').primaryKey()`, then read `t.c.primary`.
- 期待: `true`.
- 観測: `undefined`.

### marks a unique text column unique on the public flag
- 操作: `text('c').unique()`, then read `t.c.isUnique`.
- 期待: `true`.
- 観測: a `function`.

### records a string-producing $defaultFn on a text column
- 操作: `text('c').$defaultFn(() => 'uuid')`, then call `t.c.defaultFn()`.
- 期待: `'uuid'`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

# schema/primary-key — observed failures

Test run: `npx vitest run --no-coverage test/schema/primary-key.test.ts`
Result: 20 failed / 1 passed (21 total)

## summary

Observed from `.primaryKey()` on column factories and the `getTableConfig` introspection helper:

- `column.primary` is not a boolean state flag. After `.primaryKey()` it reads `undefined`; on a plain column it reads `undefined`.
- A primary-key column does not report `notNull` as `true`; it reads as a `function`.
- The `getTableConfig` symbol is not exported from `src/index`; calling it throws `TypeError: getTableConfig is not a function`.
- Composite-key behaviour cannot be observed because both `getTableConfig` and the `primary` flag are unavailable.

The 1 passing test confirms `.primaryKey()` returns a chainable column (typeof `notNull` is `'function'`).

## failures

### marks the integer / uint / float / text column primary on the public flag
- 操作: `<factory>('id').primaryKey()` inside a table, then read `t.id.primary`.
- 期待: `true`.
- 観測: `undefined`.

### reports a plain integer / uint / float / text column as strictly not primary
- 操作: `table('t', { id: <factory>('id') })`, then read `t.id.primary`.
- 期待: `false`.
- 観測: `undefined`.

### a primary-key column is implicitly not null
- 操作: `integer('id').primaryKey()` inside a table, then read `t.id.notNull`.
- 期待: `true`.
- 観測: a `function`.

### allows notNull chained after primaryKey
- 操作: `integer('id').primaryKey().notNull()`, then read `t.id.primary`.
- 期待: `true`.
- 観測: `undefined`.

### lists the primary-key column in getTableConfig
- 操作: `table('users', { id: integer('id').primaryKey(), name: text('name') })`, then call `getTableConfig(t)`.
- 期待: `config.primaryKeys.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### names the declared column as the primary key in getTableConfig
- 操作: same table, then read `config.primaryKeys[].columns[].name`.
- 期待: contains `'id'`.
- 観測: `TypeError: getTableConfig is not a function`.

### reports no primary key in getTableConfig when none is declared
- 操作: `table('t', { id: integer('id'), name: text('name') })`, then call `getTableConfig(t)`.
- 期待: `config.primaryKeys` equals `[]`.
- 観測: `TypeError: getTableConfig is not a function`.

### treats two .primaryKey() columns as a single composite key
- 操作: `table('t', { a: integer('a').primaryKey(), b: integer('b').primaryKey() })`, then read primary-key column names from `getTableConfig(t)`.
- 期待: `['a', 'b']`.
- 観測: `TypeError: getTableConfig is not a function`.

### marks both columns of a composite key primary on the public flag
- 操作: `table('t', { a: integer('a').primaryKey(), b: integer('b').primaryKey() })`, then read `[t.a.primary, t.b.primary]`.
- 期待: `[true, true]`.
- 観測: `[undefined, undefined]`.

### keeps a primary-key column primary alongside a default value
- 操作: `integer('id').primaryKey().default(1)`, then read `t.id.primary`.
- 期待: `true`.
- 観測: `undefined`.

### lists a integer / uint / float / text primary-key column through getTableConfig
- 操作: `<factory>('id').primaryKey()` inside a table, then call `getTableConfig(t)`.
- 期待: `config.primaryKeys.length` greater than `0`.
- 観測: `TypeError: getTableConfig is not a function`.

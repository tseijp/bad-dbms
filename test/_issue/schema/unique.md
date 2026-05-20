# schema/unique — observed failures

Test run: `npx vitest run --no-coverage test/schema/unique.test.ts`
Result: 19 failed / 0 passed (19 total)

## summary

Observed from `.unique()` on column factories and the `getTableConfig` introspection helper:

- `column.isUnique` is not a boolean state flag. After `.unique()` it reads `undefined`; on a plain column it reads `undefined`. `typeof column.isUnique` is `'undefined'`, not `'boolean'`.
- `column.primary` after `.unique().primaryKey()` reads `undefined`, not `true`.
- The `getTableConfig` symbol is not exported from `src/index`; calling it throws `TypeError: getTableConfig is not a function`.

All 19 tests in the file fail.

## failures

### marks the integer / uint / float / text column unique on the public flag
- 操作: `<factory>('email').unique()` inside a table, then read `t.email.isUnique`.
- 期待: `true`.
- 観測: `undefined`.

### reports a plain integer / uint / float / text column as strictly not unique
- 操作: `table('t', { email: <factory>('email') })`, then read `t.email.isUnique`.
- 期待: `false`.
- 観測: `undefined`.

### reports an unset unique flag as a real boolean, not undefined
- 操作: `table('t', { email: integer('email') })`, then check `typeof t.email.isUnique`.
- 期待: `'boolean'`.
- 観測: `'undefined'`.

### marks a column unique with unique().primaryKey()
- 操作: `integer('email').unique().primaryKey()`, then read `t.email.isUnique`.
- 期待: `true`.
- 観測: `undefined`.

### marks a column primary with unique().primaryKey()
- 操作: `integer('email').unique().primaryKey()`, then read `t.email.primary`.
- 期待: `true`.
- 観測: `undefined`.

### marks a column unique regardless of chain order with primaryKey
- 操作: `integer('email').primaryKey().unique()`, then read `t.email.isUnique`.
- 期待: `true`.
- 観測: `undefined`.

### marks a column unique with unique().notNull()
- 操作: `integer('email').unique().notNull()`, then read `t.email.isUnique`.
- 期待: `true`.
- 観測: `undefined`.

### marks both columns chaining unique
- 操作: `table('t', { a: integer('a').unique(), b: integer('b').unique() })`, then read `[t.a.isUnique, t.b.isUnique]`.
- 期待: `[true, true]`.
- 観測: `[undefined, undefined]`.

### keeps a plain column non-unique beside a unique sibling
- 操作: `table('t', { a: integer('a').unique(), b: integer('b') })`, then read `[t.a.isUnique, t.b.isUnique]`.
- 期待: `[true, false]`.
- 観測: `[undefined, undefined]`.

### lists the unique column in getTableConfig
- 操作: a table with `email: text('email').unique()`, then call `getTableConfig(t)`.
- 期待: `config.uniqueConstraints.length` is `1`.
- 観測: `TypeError: getTableConfig is not a function`.

### names the declared unique column in getTableConfig
- 操作: same table, then read unique-constraint column names from `getTableConfig(t)`.
- 期待: contains `'email'`.
- 観測: `TypeError: getTableConfig is not a function`.

### reports no unique constraints in getTableConfig when none is declared
- 操作: a table with no `.unique()`, then call `getTableConfig(t)`.
- 期待: `config.uniqueConstraints` equals `[]`.
- 観測: `TypeError: getTableConfig is not a function`.

### lists two unique columns separately in getTableConfig
- 操作: `table('t', { a: integer('a').unique(), b: integer('b').unique() })`, then call `getTableConfig(t)`.
- 期待: `config.uniqueConstraints.length` is `2`.
- 観測: `TypeError: getTableConfig is not a function`.

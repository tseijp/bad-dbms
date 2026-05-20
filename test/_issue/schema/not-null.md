# schema/not-null — observed failures

Test run: `npx vitest run --no-coverage test/schema/not-null.test.ts`
Result: 17 failed / 0 passed (17 total)

## summary

Observed from `.notNull()` and related chains on column factories:

- `column.notNull` is a `function` (the chain method), not a boolean state flag. Reading it after `.notNull()` yields the method, never `true`. Reading it on a plain column yields the method, never `false`.
- `typeof column.notNull` is `'function'`, not `'boolean'`.
- A primary-key column does not report `notNull` as `true` (it reads as a `function`).

All 17 tests in the file fail.

## failures

### marks the integer / uint / float / text column not-null on the public flag
- 操作: `<factory>('name').notNull()` inside a table, then read `t.name.notNull`.
- 期待: `true`.
- 観測: a `function`.

### reports a plain integer / uint / float / text column as strictly nullable
- 操作: `table('t', { name: <factory>('name') })`, then read `t.name.notNull`.
- 期待: `false`.
- 観測: a `function`.

### reports an unset not-null flag as a real boolean, not undefined
- 操作: `table('t', { name: integer('name') })`, then check `typeof t.name.notNull`.
- 期待: `'boolean'`.
- 観測: `'function'`.

### treats a primary-key column as implicitly not null
- 操作: `integer('id').primaryKey()` inside a table, then read `t.id.notNull`.
- 期待: `true`.
- 観測: a `function`.

### keeps a primary-key column not null with explicit notNull()
- 操作: `integer('id').primaryKey().notNull()`, then read `t.id.notNull`.
- 期待: `true`.
- 観測: a `function`.

### sets not-null regardless of chain order with primaryKey
- 操作: `integer('id').notNull().primaryKey()`, then read `t.id.notNull`.
- 期待: `true`.
- 観測: a `function`.

### sets not-null with notNull().unique()
- 操作: `integer('id').notNull().unique()`, then read `t.id.notNull`.
- 期待: `true`.
- 観測: a `function`.

### keeps a unique column nullable when notNull is not declared
- 操作: `integer('id').unique()`, then read `t.id.notNull`.
- 期待: `false`.
- 観測: a `function`.

### sets not-null with notNull().default()
- 操作: `integer('score').notNull().default(3)`, then read `t.score.notNull`.
- 期待: `true`.
- 観測: a `function`.

### marks both columns chaining notNull
- 操作: `table('t', { a: integer('a').notNull(), b: integer('b').notNull() })`, then read `[t.a.notNull, t.b.notNull]`.
- 期待: `[true, true]`.
- 観測: `[Function, Function]`.

### keeps a nullable column nullable beside a not-null sibling
- 操作: `table('t', { a: integer('a').notNull(), b: integer('b') })`, then read `[t.a.notNull, t.b.notNull]`.
- 期待: `[true, false]`.
- 観測: `[Function, Function]`.

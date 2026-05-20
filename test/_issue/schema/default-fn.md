# schema/default-fn — observed failures

Test run: `npx vitest run --no-coverage test/schema/default-fn.test.ts`
Result: 16 failed / 1 passed (17 total)

## summary

Observed from `.$defaultFn()` / `.defaultFn()` on column factories:

- `column.defaultFn` is callable, but invoking `column.defaultFn()` does not return the value produced by the registered generator function. It returns a SQL-like object of shape `{ kind: 'sql', node: {...}, ... }` instead of the generator's return value.
- A column declared with `.$defaultFn()` does not report `hasDefault` as `true`; it reads `undefined`.
- A plain column does not report `hasDefault` as `false`; it reads `undefined`.

The 1 passing test confirms `column.defaultFn` and `column.$defaultFn` are the same method reference.

## failures

### records a $defaultFn returning 42 on the public defaultFn property
- 操作: `table('t', { seq: integer('seq').$defaultFn(() => 42) })`, then call `t.seq.defaultFn()`.
- 期待: `42`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### marks hasDefault true on a column with a $defaultFn
- 操作: `integer('seq').$defaultFn(() => 1)` inside a table, then read `t.seq.hasDefault`.
- 期待: `true`.
- 観測: `undefined`.

### records a $defaultFn whose first call returns 1
- 操作: `$defaultFn(() => ++n)` (n starts at 0), then call `t.seq.defaultFn()` once.
- 期待: `1`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### records a $defaultFn whose second call returns 2
- 操作: `$defaultFn(() => ++n)`, capture `fn = t.seq.defaultFn`, call `fn()` then `fn()` again.
- 期待: second call returns `2`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### records a defaultFn alias returning 9
- 操作: `integer('seq').defaultFn(() => 9)`, then call `t.seq.defaultFn()`.
- 期待: `9`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### records a $defaultFn on a integer / uint / float / text column
- 操作: `<factory>('seq').$defaultFn(() => 5)`, then call `t.seq.defaultFn()`.
- 期待: `5`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### marks hasDefault strictly false on a plain integer / uint / float / text column
- 操作: `table('t', { seq: <factory>('seq') })`, then read `t.seq.hasDefault`.
- 期待: `false`.
- 観測: `undefined`.

### records a $defaultFn alongside notNull
- 操作: `integer('seq').notNull().$defaultFn(() => 3)`, then call `t.seq.defaultFn()`.
- 期待: `3`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### records a $defaultFn alongside primaryKey
- 操作: `integer('seq').primaryKey().$defaultFn(() => 8)`, then call `t.seq.defaultFn()`.
- 期待: `8`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

### records a string-producing $defaultFn on a text column
- 操作: `text('id').$defaultFn(() => 'uuid-x')`, then call `t.id.defaultFn()`.
- 期待: `'uuid-x'`.
- 観測: `{ kind: 'sql', node: {...}, ... }`.

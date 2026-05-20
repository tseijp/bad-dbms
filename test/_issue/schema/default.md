# schema/default — observed failures

Test run: `npx vitest run --no-coverage test/schema/default.test.ts`
Result: 33 failed / 0 passed (33 total)

## summary

Observed from `.default()` on column factories:

- `column.default` is a `function` (the chain method), not the stored default value. Reading `column.default` after `.default(v)` yields the method, never `v`.
- A column declared with `.default()` does not report `hasDefault` as `true`; it reads `undefined`.
- A plain column does not report `hasDefault` as `false`; it reads `undefined`. `typeof column.hasDefault` is `'undefined'`, not `'boolean'`.
- `column.notNull` after `.notNull().default()` is also a `function`, not `true`.

All 33 tests in the file fail.

## failures

### records a <positive|zero|one|negative|large|negative large> default on the public default property
- 操作: `integer('score').default(v)` for `v` in `[7, 0, 1, -5, 1000000, -999999]`, then read `t.score.default`.
- 期待: the value `v`.
- 観測: a `function`.

### records a <...> default on a uint column
- 操作: `uint('score').default(v)` for the same `v` set, then read `t.score.default`.
- 期待: the value `v`.
- 観測: a `function`.

### records a <zero|fraction|negative fraction|pi-ish|large fraction> default on a float column
- 操作: `float('score').default(v)` for `v` in `[0, 0.5, -1.25, 3.14159, 12345.678]`, then read `t.score.default`.
- 期待: the value `v`.
- 観測: a `function`.

### marks hasDefault true on a integer / uint / float / text column with a default
- 操作: `<factory>('score').default(1)` inside a table, then read `t.score.hasDefault`.
- 期待: `true`.
- 観測: `undefined`.

### marks hasDefault true even when the default value is the falsy 0
- 操作: `integer('score').default(0)`, then read `t.score.hasDefault`.
- 期待: `true`.
- 観測: `undefined`.

### marks hasDefault strictly false on a plain integer / uint / float / text column
- 操作: `table('t', { score: <factory>('score') })`, then read `t.score.hasDefault`.
- 期待: `false`.
- 観測: `undefined`.

### reports hasDefault as a real boolean, not undefined
- 操作: `table('t', { score: integer('score') })`, then check `typeof t.score.hasDefault`.
- 期待: `'boolean'`.
- 観測: `'undefined'`.

### records the not-null flag with notNull().default()
- 操作: `integer('score').notNull().default(3)`, then read `t.score.notNull`.
- 期待: `true`.
- 観測: a `function`.

### records the default value with notNull().default()
- 操作: `integer('score').notNull().default(3)`, then read `t.score.default`.
- 期待: `3`.
- 観測: a `function`.

### records the default value with default().notNull()
- 操作: `integer('score').default(9).notNull()`, then read `t.score.default`.
- 期待: `9`.
- 観測: a `function`.

### records the default value alongside primaryKey
- 操作: `integer('score').primaryKey().default(2)`, then read `t.score.default`.
- 期待: `2`.
- 観測: a `function`.

### records the default value with unique().default()
- 操作: `integer('score').unique().default(4)`, then read `t.score.default`.
- 期待: `4`.
- 観測: a `function`.

### records a string default on a text column
- 操作: `text('label').default('none')`, then read `t.label.default`.
- 期待: `'none'`.
- 観測: a `function`.

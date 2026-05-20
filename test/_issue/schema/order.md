# schema/order — observed failures

Test run: `npx vitest run --no-coverage test/schema/order.test.ts`
Result: 8 failed / 5 passed (13 total)

## summary

Observed from the bad-dbms-specific `.order(min, max)` column extension:

- After `.order(...).notNull()`, the column's `notNull` reads as a `function`, not `true`.
- A column declared with `.order(...)` only does not report constraint flags as strict `false`: `notNull` and `isUnique` read as a `function`, and `primary` reads as `undefined`.

The 5 passing tests cover: `.order()` returns a chainable column (typeof `notNull` is `'function'`), and an `.order()` column of each factory type is declarable inside a table.

## failures

### keeps order(0,1) / order(0,16) / order(1,256) / order(-8,8) / order(10,1000) chainable into a constraint
- 操作: `integer('x').order(min, max).notNull()` inside a table, then read `t.x.notNull`.
- 期待: `true`.
- 観測: a `function`.

### does not make an order column not-null as a side effect
- 操作: `integer('x').order(0, 16)` inside a table, then read `t.x.notNull`.
- 期待: `false`.
- 観測: a `function`.

### does not make an order column unique as a side effect
- 操作: `integer('x').order(0, 16)` inside a table, then read `t.x.isUnique`.
- 期待: `false`.
- 観測: a `function`.

### does not make an order column primary as a side effect
- 操作: `integer('x').order(0, 16)` inside a table, then read `t.x.primary`.
- 期待: `false`.
- 観測: `undefined`.

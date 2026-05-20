# Issue: per-row-tick.test.ts

Test file: `test/transaction/per-row-tick.test.ts`
Result: 3 failed / 7 passed (10 tests)

## Context

The two-argument `db.transaction((tx, c) => ...)` builds a per-row "tick"
runner: the callback is meant to run once per row of the primary table with
`c` bound to the current row. `runner.run(ctx)` drives the iteration.

## Observed failures

### `the current-row proxy exposes each rows id in turn`

Steps:
1. `db.transaction((_tx, c) => seen.push(c.id))`
2. `runner.run({})`
3. assert sorted `seen` equals `[1, 2, 3]`

Expected: `[1, 2, 3]`

Actual: an array of 3 objects, not numbers. Each pushed value is an object with
`kind: 'sql'`, a `node` of `{ col: 'id', tableName: 'ledger', type: 'currentTuple' }`,
and function properties (`add`, `eq`, `gt`, `toInt`, etc.).

Observed: `c.id` yields an SQL-expression / column-reference object rather than
the current row's numeric `id` value.

### `a tick that deletes rows over a cutoff leaves only the rows below it`

Steps (table seeded with amounts `[10, 20, 30]`):
1. `db.transaction((tx, c) => { if (c.amount > 15) return tx.delete(t).where(eq(t.id, c.id)); return undefined })`
2. `runner.run({})`
3. `idsOf(db.select().from(t))`

Expected: `[1]` (rows with amount > 15 deleted)

Actual: `[1, 2, 3]`

Observed: no rows were deleted; the `c.amount > 15` cutoff did not select any
row for deletion.

### `a tick reading the current rows amount can accumulate a total into the context`

Steps (table seeded with amounts `[10, 20, 30]`):
1. `ctx = { total: 0 }`
2. `db.transaction((_tx, c) => { ctx.total += c.amount })`
3. `runner.run(ctx)`
4. assert `ctx.total` equals `60`

Expected: `60`

Actual: `"0[object Object][object Object][object Object]"` (a string)

Observed: `c.amount` yields an object, not a number; `+=` therefore performed
string concatenation rather than numeric addition.

## Summary

The per-row tick callback is invoked the correct number of times (the count
tests pass), but the current-row binding `c` does not expose row values —
`c.id` and `c.amount` return SQL-expression/column objects instead of the
actual scalar values of the current row.

## Notes

The 7 passing tests assert only callback invocation counts, empty-table
behavior, and `run` returning its context object — none of them read a value
off `c`.

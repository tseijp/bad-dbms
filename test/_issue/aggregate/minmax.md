# Issue: min and max over varying datasets (minmax.test.ts)

Test file: `test/aggregate/minmax.test.ts`
Result: 4 failed / 49 passed (53 total)

## Observed failures

### 1. `min()` over an empty table returns `Infinity` instead of `null`

- Test: "returns NULL for min over an empty table"
- Operation: `numTable([])`, then `db.select({ lo: min(t.v) }).from(t)`.
- Expected: scalar `lo` is `null`.
- Actual: scalar `lo` is `Infinity`.

### 2. `max()` over an empty table returns `-Infinity` instead of `null`

- Test: "returns NULL for max over an empty table"
- Operation: `numTable([])`, then `db.select({ hi: max(t.v) }).from(t)`.
- Expected: scalar `hi` is `null`.
- Actual: scalar `hi` is `-Infinity`.

### 3. `max()` over a predicate-emptied set returns `-Infinity` instead of `null`

- Test: "returns NULL for max when a predicate matches nothing"
- Operation: seeded users, `db.select({ hi: max(users.score) })` with a predicate matching no rows.
- Expected: scalar `hi` is `null`.
- Actual: scalar `hi` is `-Infinity`.

### 4. `min()` over a predicate-emptied set returns `Infinity` instead of `null`

- Test: "finds the min of the run 1..10 kept by gte(v, 11) is null"
- Operation: `numTable([1..10])`, `db.select({ lo: min(t.v) })` with a predicate keeping no rows.
- Expected: scalar `lo` is `null`.
- Actual: scalar `lo` is `Infinity`.

## Summary of observed behavior

- `min()` over a table with no matching rows yields `Infinity`, while the tests expect `null`.
- `max()` over a table with no matching rows yields `-Infinity`, while the tests expect `null`.

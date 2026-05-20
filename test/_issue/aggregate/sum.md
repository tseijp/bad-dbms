# Issue: sum over varying datasets (sum.test.ts)

Test file: `test/aggregate/sum.test.ts`
Result: 8 failed / 34 passed (42 total)

## Observed failures

### 1. `sum()` over an empty table returns `0` instead of `null`

- Test: "sums an empty table to NULL, never zero"
- Operation: `numTable([])`, then `db.select({ s: sum(t.v) }).from(t)`.
- Expected: scalar `s` is `null`.
- Actual: scalar `s` is `0`.

### 2. `sum()` over a predicate-emptied table returns `0` instead of `null`

- Test: "sums to NULL when a predicate matches no row"
- Operation: seeded users, `db.select({ s: sum(users.score) })` with a predicate matching no rows.
- Expected: scalar `s` is `null`.
- Actual: scalar `s` is `0`.

### 3. `sum()` over a predicate-emptied numeric run returns `0` instead of `null`

- Test: "sums the run 1..10 kept by gt(v, 10) to null"
- Operation: `numTable([1..10])`, `db.select({ s: sum(t.v) })` with `gt(v, 10)` keeping no rows.
- Expected: scalar `s` is `null`.
- Actual: scalar `s` is `0`.

### 4. `sum()` returns a number instead of a string

- Test: "resolves sum to a string, the Drizzle numeric representation"
- Operation: seeded users, `db.select({ s: sum(users.score) })`.
- Expected: `typeof s` is `'string'`.
- Actual: `typeof s` is `'number'`.

### 5. `sum()` of seeded users returns number `60` instead of string `'60'`

- Test: "resolves the seeded user score sum to the string \"60\""
- Expected: scalar `s` equals string `'60'`.
- Actual: scalar `s` is the number `60`.

### 6-8. `sum()` of two values / five values / negatives datasets return numbers instead of strings

- Tests: "resolves the sum of the two values dataset to a string", "resolves the sum of the five values dataset to a string", "resolves the sum of the negatives dataset to a string"
- Operation: `numTable(values)`, then `db.select({ s: sum(t.v) }).from(t)`.
- Expected: scalar `s` equals the expected string (e.g. `'30'`, `'15'`, `'-30'`).
- Actual: scalar `s` is a number (e.g. `30`, `15`, `-30`).

## Summary of observed behavior

- `sum()` yields a JavaScript `number`, while the tests expect a `string`.
- `sum()` over a table with no matching rows yields `0`, while the tests expect `null`.

# Issue: avg over varying datasets (avg.test.ts)

Test file: `test/aggregate/avg.test.ts`
Result: 7 failed / 32 passed (39 total)

## Observed failures

### 1. `avg()` over an empty table returns `0` instead of `null`

- Test: "averages an empty table to NULL, never zero"
- Operation: `numTable([])`, then `db.select({ a: avg(t.v) }).from(t)`.
- Expected: scalar `a` is `null`.
- Actual: scalar `a` is `0`.

### 2. `avg()` over a predicate-emptied table returns `0` instead of `null`

- Test: "averages to NULL when a predicate empties the table"
- Operation: seeded users, `db.select({ a: avg(users.score) })` with a predicate that matches no rows.
- Expected: scalar `a` is `null`.
- Actual: scalar `a` is `0`.

### 3. `avg()` returns a number instead of a string

- Test: "resolves avg to a string, the Drizzle decimal representation"
- Operation: seeded users, `db.select({ a: avg(users.score) })`.
- Expected: `typeof a` is `'string'`.
- Actual: `typeof a` is `'number'`.

### 4. `avg()` of seeded users returns number `20` instead of string `'20'`

- Test: "resolves the seeded user avg to the string \"20\""
- Expected: scalar `a` equals string `'20'`.
- Actual: scalar `a` is the number `20`.

### 5-7. `avg()` of two/three values and uniform datasets returns numbers instead of strings

- Tests: "resolves the avg of the two values dataset to a string", "resolves the avg of the three values dataset to a string", "resolves the avg of the uniform dataset to a string"
- Operation: `numTable(values)`, then `db.select({ a: avg(t.v) }).from(t)`.
- Expected: scalar `a` equals the expected string (e.g. `'20'`, `'7'`).
- Actual: scalar `a` is a number (e.g. `20`, `7`).

## Summary of observed behavior

- `avg()` yields a JavaScript `number`, while the tests expect a `string`.
- `avg()` over a table with no matching rows yields `0`, while the tests expect `null`.

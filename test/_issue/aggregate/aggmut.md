# Issue: aggregate after insert-and-mutate (aggmut.test.ts)

Test file: `test/aggregate/aggmut.test.ts`
Result: 4 failed / 3 passed (7 total)

## Observed failures

### 1. `sum()` returns a number instead of a string after a delete

- Test: "seeds users, deletes one, then re-aggregates count and sum"
- Operation: seed users, `db.delete(users).where(eq(users.id, 3))`, then `db.select({ n: count(), s: sum(users.score) })`.
- Expected: `{ n: 2, s: '30' }`
- Actual: `{ n: 2, s: 30 }` — the `s` field is the number `30`, not the string `'30'`.

### 2. `sum()` returns a number instead of a string after an update

- Test: "seeds users, updates a score, then re-reads the table sum"
- Operation: update a score, then `db.select({ s: sum(users.score) })`.
- Expected: scalar `s` equals string `'1039'`.
- Actual: scalar `s` is the number `1039`.

### 3. `sum()` over an emptied table returns `0` instead of `null`

- Test: "deletes every row then aggregates the now-empty table"
- Operation: `db.delete(users).where(gt(users.id, 0))`, then `db.select({ n: count(), s: sum(users.score) })`.
- Expected: `{ n: 0, s: null }`
- Actual: `{ n: 0, s: 0 }` — `s` is `0` instead of `null`.

### 4. `sum()` over an empty table returns `0` (number) instead of `null`; non-empty sum returns number instead of string

- Test: "re-seeds after a full delete and confirms the sum returns as a string"
- Operation: empty the table, read sum; re-seed, read sum again.
- Expected: `[null, '30']`
- Actual: `[0, 30]` — empty-table sum is `0` (expected `null`); re-seeded sum is number `30` (expected string `'30'`).

## Summary of observed behavior

- `sum()` yields a JavaScript `number`, while the tests expect a `string`.
- `sum()` over a table with no matching rows yields `0`, while the tests expect `null`.

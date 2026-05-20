# Issue: $count shortcut (count3.test.ts)

Test file: `test/aggregate/count3.test.ts`
Result: 4 failed / 0 passed (4 total)

## Observed failures

All 4 tests fail with the same error: `TypeError: db.$count is not a function`.

### 1. `db.$count(users)` on a seeded table

- Test: "resolves db.$count(users) to the seeded row count"
- Operation: `await db.$count(users)`.
- Expected: `3`.
- Actual: throws `TypeError: db.$count is not a function`.

### 2. `db.$count(users, predicate)` with a filter

- Test: "resolves db.$count with a predicate to the filtered count"
- Operation: `await db.$count(users, gt(users.score, ...))`.
- Expected: `2`.
- Actual: throws `TypeError: db.$count is not a function`.

### 3. `db.$count` on an un-seeded table

- Test: "resolves db.$count to zero on an un-seeded table"
- Operation: `await db.$count(db.tables.users)`.
- Expected: `0`.
- Actual: throws `TypeError: db.$count is not a function`.

### 4. `db.$count` re-read after a delete

- Test: "seeds, deletes a row, then re-reads db.$count to the new total"
- Operation: `await db.$count(users)` before and after a delete.
- Expected: count reflecting the new total.
- Actual: throws `TypeError: db.$count is not a function`.

## Summary of observed behavior

- The `db` object exposes no `$count` method; calling it throws a `TypeError`.

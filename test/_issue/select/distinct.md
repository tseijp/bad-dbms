# Issue: distinct.test.ts — selectDistinct builder not available

Test file: `test/select/distinct.test.ts`
Run: `npx vitest run --no-coverage test/select/distinct.test.ts`
Result: 17 tests, 0 passed, 17 failed.

## Observed failure: `db.selectDistinct` is not a function

Operation: every test calls `db.selectDistinct()` or `db.selectDistinct(projection)` via the test helper at lines 14-15.

- All 17 tests fail with `TypeError: db.selectDistinct is not a function`.

Failure points include:
- "collapses duplicate kind rows to the distinct set"
- "returns three rows from a distinct read over five duplicated kinds"
- "treats distinct over already-unique user rows as a no-op"
- "keys a distinct projection by exactly the projected alias"
- "returns the distinct row count for ..." (6 datasets)
- "returns the sorted distinct values for ..." (3 datasets)
- "returns an empty array from a distinct read of an empty table"
- "keeps a distinct read of all-distinct rows the same length as a bare read"
- "collapses a full-row distinct read over a table with duplicate rows"
- "seeds duplicates, reads distinct, inserts a new value, then re-reads distinct"

## Summary of observed behavior

The db object returned by bad-dbms does not expose a `selectDistinct` method. No distinct-read scenario can run; the entire test file fails at the builder call.

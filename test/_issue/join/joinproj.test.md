# Issue: joinproj.test.ts — join projection fails; `innerJoin` not implemented

## Test run summary

- Command: `npx vitest run --no-coverage test/join/joinproj.test.ts`
- Result: **17 failed / 17 total** (0 pass)

## Observed behavior

Every test builds a joined select with a column projection from both tables,
invoking `b.innerJoin(right, on)` on the builder returned by
`db.select({...}).from(...)` (see `test/join/helpers.ts:18`).

All 17 cases throw:

```
TypeError: b.innerJoin is not a function
  at innerJoin test/join/helpers.ts:18:61
```

## What is observed as not working

The select builder exposes no `innerJoin` method, so a join that projects
columns from both tables cannot be performed. The projection-shape behavior
(which keys appear on each joined row) cannot be exercised.

No scenario reaches an assertion.

## Affected scenarios (all 17)

- "shapes the ... join projection to exactly its keys" for: userId only,
  postId only, both ids, name and score, three columns, expression column
- "keeps four joined rows for the ... projection" for: userId only,
  both ids, name and score, expression column
- and the remaining join-projection scenarios in the file

## Expected vs actual

- Expected: `db.select({...}).from(...).innerJoin(right, on)` resolves to an
  array of joined rows whose keys are exactly the projection aliases.
- Actual: `TypeError: b.innerJoin is not a function`.

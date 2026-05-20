# Issue: onetomany.test.ts — one-to-many join expansion fails; `innerJoin` not implemented

## Test run summary

- Command: `npx vitest run --no-coverage test/join/onetomany.test.ts`
- Result: **5 failed / 5 total** (0 pass)

## Observed behavior

Every test exercises one-to-many row expansion through a join, invoking
`b.innerJoin(right, on)` on the builder returned by
`db.select(...).from(...)` (see `test/join/helpers.ts:18`).

All 5 cases throw:

```
TypeError: b.innerJoin is not a function
  at innerJoin test/join/helpers.ts:18:61
```

## What is observed as not working

The select builder exposes no `innerJoin` method, so a join that expands
one parent row into multiple child rows cannot be performed. The row-count
expansion and re-count-after-mutation behavior cannot be exercised.

No scenario reaches an assertion.

## Affected scenarios (all 5)

- "seeds, joins, inserts another post, then re-counts the expansion"
- "seeds, joins, deletes a post, then watches one user lose a child row"
- and the remaining one-to-many expansion scenarios in the file

## Expected vs actual

- Expected: a join on a one-to-many relation resolves to an array with one
  joined row per child match (parent row repeated per child).
- Actual: `TypeError: b.innerJoin is not a function`.

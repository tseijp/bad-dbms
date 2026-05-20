# Issue: innerjoin.test.ts — `innerJoin` not implemented on select builder

## Test run summary

- Command: `npx vitest run --no-coverage test/join/innerjoin.test.ts`
- Result: **26 failed / 26 total** (0 pass)

## Observed behavior

Every test in `innerjoin.test.ts` calls the `innerJoin` helper, which invokes
`b.innerJoin(right, on)` where `b` is the builder returned by
`db.select({...}).from(users)` (see `test/join/helpers.ts:18`).

In all 26 cases the call throws:

```
TypeError: b.innerJoin is not a function
  at innerJoin test/join/helpers.ts:18:61
```

## What is observed as not working

The select builder produced by `db.select(...).from(...)` exposes no
`innerJoin` method. As a result, inner join cannot be performed at all.

No scenario reaches an assertion; the failure is at the builder method
lookup, before any join logic or row comparison runs.

## Affected scenarios (all 26)

- inner-join row count for the matrix shapes: one-to-one, one-to-many,
  half matched, none matched, many-to-one
- inner-joins three left rows to right tables: no right rows, one match,
  one miss, all three match once, two on one left, three on one left,
  mixed hit and miss, all miss, four rows two match, heavy fan-out
- filtered inner-join row counts: user id 0, 1, 2 variants
- and the remaining inner-join scenarios in the file

## Expected vs actual

- Expected: `db.select(...).from(...).innerJoin(right, on)` resolves to an
  array of joined rows containing only matched pairs.
- Actual: `TypeError: b.innerJoin is not a function`.

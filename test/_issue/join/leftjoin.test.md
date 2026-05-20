# Issue: leftjoin.test.ts — `leftJoin` not implemented on select builder

## Test run summary

- Command: `npx vitest run --no-coverage test/join/leftjoin.test.ts`
- Result: **21 failed / 21 total** (0 pass)

## Observed behavior

Every test in `leftjoin.test.ts` calls the `leftJoin` helper, which invokes
`b.leftJoin(right, on)` where `b` is the builder returned by
`db.select({...}).from(users)` (see `test/join/helpers.ts:19`).

In all 21 cases the call throws:

```
TypeError: b.leftJoin is not a function
  at leftJoin test/join/helpers.ts:19:60
```

## What is observed as not working

The select builder produced by `db.select(...).from(...)` exposes no
`leftJoin` method. Left joins cannot be performed at all.

No scenario reaches an assertion; the failure is at the builder method
lookup, before any join / null-fill logic runs.

## Affected scenarios (all 21)

- left-joins three left rows to right tables: no right rows, one match,
  all three match once, one left gets two, one left gets three,
  matches plus a miss, all miss, heavy fan-out on one
- "keeps all three left ids present" for: no right rows, partial matches,
  full matches
- and the remaining leftJoin scenarios in the file

## Expected vs actual

- Expected: `db.select(...).from(...).leftJoin(right, on)` resolves to an
  array keeping every left row, null-filling the unmatched right side.
- Actual: `TypeError: b.leftJoin is not a function`.

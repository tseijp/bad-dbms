# Issue: fulljoin.test.ts — `fullJoin` not implemented on select builder

## Test run summary

- Command: `npx vitest run --no-coverage test/join/fulljoin.test.ts`
- Result: **10 failed / 10 total** (0 pass)

## Observed behavior

Every test in `fulljoin.test.ts` calls the `fullJoin` helper, which invokes
`b.fullJoin(right, on)` where `b` is the builder returned by
`db.select({...}).from(...)` (see `test/join/helpers.ts:21`).

In all 10 cases the call throws:

```
TypeError: b.fullJoin is not a function
  at fullJoin test/join/helpers.ts:21:60
```

## What is observed as not working

The select builder produced by `db.select(...).from(...)` exposes no
`fullJoin` method. Full joins cannot be performed at all.

No scenario reaches an assertion; the failure is at the builder method
lookup, before any join / null-fill logic runs.

## Affected scenarios (all 10)

- "null-fills the left side for a right-only row in a full join"
- "agrees with the inner join when both tables fully match"
- full-joins right tables to a fixed left pair: no right rows, both matched,
  one matched one left orphan, one matched one right orphan,
  all orphan both sides, fan-out plus right orphan
- and the remaining fullJoin scenarios in the file

## Expected vs actual

- Expected: `db.select(...).from(...).fullJoin(right, on)` resolves to an
  array keeping unmatched rows from both sides, null-filling the missing
  side.
- Actual: `TypeError: b.fullJoin is not a function`.

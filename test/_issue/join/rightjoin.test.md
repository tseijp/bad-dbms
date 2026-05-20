# Issue: rightjoin.test.ts — `rightJoin` not implemented on select builder

## Test run summary

- Command: `npx vitest run --no-coverage test/join/rightjoin.test.ts`
- Result: **10 failed / 10 total** (0 pass)

## Observed behavior

Every test in `rightjoin.test.ts` calls the `rightJoin` helper, which invokes
`b.rightJoin(right, on)` where `b` is the builder returned by
`db.select({...}).from(...)` (see `test/join/helpers.ts:20`).

In all 10 cases the call throws:

```
TypeError: b.rightJoin is not a function
  at rightJoin test/join/helpers.ts:20:61
```

## What is observed as not working

The select builder produced by `db.select(...).from(...)` exposes no
`rightJoin` method. Right joins cannot be performed at all.

No scenario reaches an assertion; the failure is at the builder method
lookup, before any join / null-fill logic runs.

## Affected scenarios (all 10)

- "keeps all right rows present for a one-to-many fan-out"
- right-joins right tables to a fixed left pair: one right row matched,
  one right row orphan, two matched, two orphan, three mixed,
  fan-out then orphan
- and the remaining rightJoin scenarios in the file

## Expected vs actual

- Expected: `db.select(...).from(...).rightJoin(right, on)` resolves to an
  array keeping every right row, null-filling the unmatched left side.
- Actual: `TypeError: b.rightJoin is not a function`.

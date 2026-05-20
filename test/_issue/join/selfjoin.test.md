# Issue: selfjoin.test.ts — self-join fails; `innerJoin` not implemented

## Test run summary

- Command: `npx vitest run --no-coverage test/join/selfjoin.test.ts`
- Result: **9 failed / 9 total** (0 pass)

## Observed behavior

Every test pairs a table with itself, invoking `b.innerJoin(right, on)` on
the builder returned by `db.select(...).from(...)`
(see `test/join/helpers.ts:18`).

All 9 cases throw:

```
TypeError: b.innerJoin is not a function
  at innerJoin test/join/helpers.ts:18:61
```

## What is observed as not working

The select builder exposes no `innerJoin` method, so a table cannot be
joined to itself. Parent/child self-join pairing cannot be exercised.

No scenario reaches an assertion.

## Affected scenarios (all 9)

- "self-joins the ... into the right pair count" for: three-row chain,
  flat fan to root, no parents, single child, dangling parent ids
- "seeds a chain, adds a node, then re-counts the self-join pairs"
- and the remaining self-join scenarios in the file

## Expected vs actual

- Expected: a self-join (`db.select(...).from(nodes).innerJoin(nodes, on)`)
  resolves to an array of parent/child row pairs.
- Actual: `TypeError: b.innerJoin is not a function`.

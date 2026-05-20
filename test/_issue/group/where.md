# Issue: group/where.test.ts

Test run: `npx vitest run --no-coverage test/group/where.test.ts`
Result: 9 passed, 3 failed (12 total)

## Failing tests

### `groupBy after where > forms the right group count after where lt 300`

- Operation: `db.select({ kind: events.kind, n: count() }).from(events).where(predicate(events)).groupBy(events.kind)`, then `rowsOf(result)` length.
- Expected: 2 group rows.
- Observed: `expected [ { kind: +0, n: 2 } ] to have a length of 2 but got 1` at where.test.ts:68.
  - A single merged row (`kind: 0, n: 2`) was returned instead of 2 per-group rows.

### `groupBy after where > forms the right group count after where between 200 and 400`

- Operation: same shape with a `between 200 and 400` predicate.
- Expected: 3 group rows.
- Observed: `expected [ { kind: +0, n: 1 }, …(1) ] to have a length of 3 but got 2` at where.test.ts:68.
  - Only 2 rows returned where 3 distinct groups were expected.

### `groupBy after where > sums each group over only the where-filtered rows`

- Operation: `db.select({ ..., s: sum(events.v) }).from(events).where(gt(events.v, 150)).groupBy(events.kind)`, then `groupWith(result, 'kind', 1).s`.
- Expected: `'700'` (string).
- Observed: `expected 700 to be '700' // Object.is equality` at where.test.ts:78.
  - The per-group sum over the filtered rows is numerically correct (700) but returned as a JS number, not a string.

## Observed behavior

When `groupBy` follows a `where` filter, the grouped result does not split into one
row per distinct key (fewer rows than expected groups; merged rows observed). The
per-group `sum` of where-filtered rows is also returned as a number where a string
is expected.

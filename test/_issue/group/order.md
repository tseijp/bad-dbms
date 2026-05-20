# Issue: group/order.test.ts

Test run: `npx vitest run --no-coverage test/group/order.test.ts`
Result: 10 passed, 3 failed (13 total)

## Failing tests

### `groupBy combined with ordering > orders groups by descending per-group sum`

- Operation: `db.select({ kind: events.kind, ... }).from(events).groupBy(events.kind).orderBy(desc(sum(events.v)))`, then read `rows.map(r => r.kind)`.
- Expected: `[1, 2, 0]` (groups ordered by descending per-group sum).
- Observed: `expected [ +0, 1, 2 ] to deeply equal [ 1, 2, +0 ]` at order.test.ts:50.
  - Result came back ordered `[0, 1, 2]` — i.e. ascending by key, not descending by aggregate.

### `groupBy combined with ordering > orders groups by ascending per-group count`

- Operation: `db.select(...).from(posts).groupBy(posts.userId).orderBy(asc(count()))`, then read `rows.map(r => r.n)`.
- Expected: `[1, 1, 2]` (three group rows ordered by ascending count).
- Observed: `expected [ 4 ] to deeply equal [ 1, 1, 2 ]` at order.test.ts:60.
  - A single row with `n: 4` was returned instead of three per-group rows.

### `groupBy combined with ordering > takes the top group by descending sum with a limit of one`

- Operation: `db.select(...).from(events).groupBy(events.kind).orderBy(desc(sum(events.v))).limit(1)`, then read `rows.map(r => r.kind)`.
- Expected: `[1]` (the top group by descending sum).
- Observed: `expected [ +0 ] to deeply equal [ 1 ]` at order.test.ts:71.
  - The single returned row had `kind: 0`, not the expected top group `1`.

## Observed behavior

`orderBy` over an aggregate expression (`sum`, `count`) on a grouped query does not
order groups by that aggregate — results stay ordered by group key. With `count()`,
the grouped query also collapses to one merged row instead of one row per group.

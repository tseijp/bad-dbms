# Issue: group/having.test.ts

Test run: `npx vitest run --no-coverage test/group/having.test.ts`
Result: 0 passed, 24 failed (24 total)

## Failing tests

All 24 tests in the file fail. Failing test names:

- `having filters groups by aggregate > keeps only groups whose count exceeds one`
- `... > keeps the single group whose count equals one`
- `... > identifies kind 2 as the only single-row group`
- `... > keeps groups whose per-group sum exceeds a threshold`
- `... > returns an empty array when having matches no group`
- `... > combines where, groupBy and having in one query`
- `... > keeps the right group count for having count gt 0 / gt 1 / gt 2`
- `... > keeps the right group count for having count gte 1 / gte 2`
- `... > keeps the right group count for having count lt 2 / lte 1 / lte 2`
- `... > keeps the right group count for having count eq 1 / eq 2 / ne 2`
- `... > keeps the right group count for having sum gt 200 / gt 400 / gt 700`
- `... > keeps the right group count for having sum gte 500 / lt 500 / lte 500 / eq 700`

## Observed behavior

The query builder exposes no `having` method after `groupBy`.

- Operation: `db.select(...).from(...).groupBy(...).having(...)` and `db.select(...).from(...).where(...).groupBy(...).having(...)`.
- Expected: a chainable `having` method that filters groups by an aggregate predicate.
- Observed for every test:
  - `TypeError: db.select(...).from(...).groupBy(...).having is not a function`
  - `TypeError: db.select(...).from(...).where(...).groupBy(...).having is not a function`

`having` is not available on the result of `.groupBy(...)` (the test casts via `as any`
and still fails), so no `HAVING`-style group filtering can be exercised at all.

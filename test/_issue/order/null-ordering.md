# order / null-ordering — issue ticket

Test file: `test/order/null-ordering.test.ts`
Result: 4 passed / 4 failed (8 total)

The failures all involve a nullable numeric column inserted without a value.

## Observed failure 1

### Test: `the non-null scores still come back in ascending order around the NULLs`

Setup (`seededNullable`): table with `id` (pk) and nullable `score`. Inserted:
`{id:1,score:30}`, `{id:2}`, `{id:3,score:10}`, `{id:4}`, `{id:5,score:20}`.

Operation: `db.select().from(t).orderBy(asc(t.score))`, collect `score` values, drop entries `== null`.

Expected: `[10, 20, 30]`
Actual: `[0, 0, 10, 20, 30]`

Observation: rows id 2 and id 4 (inserted with no `score`) read back with `score` equal to `0`, so they survive the nullish filter.

## Observed failure 2

### Test: `a NULL score reads back as null, never as the number zero`

Setup: same `seededNullable` as above.

Operation: `db.select().from(t).orderBy(asc(t.score))`, inspect `rows[0].score`.

Expected: `null`
Actual: `0`

Observation: the score of a row inserted without a value is returned as `0`.

## Observed failure 3

### Test: `a NULL sorts strictly before zero under an ascending sort`

Setup: inserted `{id:1,score:0}` and `{id:2}` (no score).

Operation: `db.select().from(t).orderBy(asc(t.score))`, collect `id` sequence.

Expected: `[2, 1]`
Actual: `[1, 2]`

Observation: the row inserted without a score does not sort before the row whose score is `0`; the two are returned in insertion order.

## Observed failure 4

### Test: `a NULL sorts before a negative score under an ascending sort`

Setup: inserted `{id:1,score:-100}`, `{id:2}` (no score), `{id:3,score:-1}`.

Operation: `db.select().from(t).orderBy(asc(t.score))`, collect `id` sequence.

Expected: `[2, 1, 3]`
Actual: `[1, 3, 2]`

Observation: the row inserted without a score is sorted as if its score were larger than `-1`, landing it last instead of first.

## Passed for reference

The following passed: ascending NULL-row placement by id, descending NULL-row placement by id, all-NULL column row-count preservation, NULL-after-zero under descending sort.

## Summary

A nullable numeric column inserted without a value is observed to read back as the number `0` and to sort as the number `0` rather than as a distinct NULL value.

# order / text-ordering — issue ticket

Test file: `test/order/text-ordering.test.ts`
Result: 0 passed / 7 failed (7 total)

Every test in this file fails. All involve ordering a `text` column.

## Observed failure 1

### Test: `an ascending sort of a text column orders the names alphabetically`

Setup (`seededNames`): table with `id` (pk) and `name` (text). Inserted:
`{id:1,name:'cherry'}`, `{id:2,name:'apple'}`, `{id:3,name:'banana'}`, `{id:4,name:'date'}`.

Operation: `db.select().from(t).orderBy(asc(t.name))`, collect `name` values.

Expected: `['apple', 'banana', 'cherry', 'date']`
Actual: `[0, 0, 0, 0]`

## Observed failure 2

### Test: `a descending sort of a text column orders the names reverse-alphabetically`

Setup: same `seededNames`.

Operation: `db.select().from(t).orderBy(desc(t.name))`, collect `name` values.

Expected: `['date', 'cherry', 'banana', 'apple']`
Actual: `[0, 0, 0, 0]`

## Observed failure 3

### Test: `an ascending text sort carries each whole row, so the ids follow their names`

Setup: same `seededNames`.

Operation: `db.select().from(t).orderBy(asc(t.name))`, collect `id` values.

Expected: `[2, 3, 1, 4]`
Actual: order does not match (ids not reordered by name).

## Observed failure 4

### Test: `strings sharing a prefix sort by their first differing character`

Setup: inserted `{id:1,name:'apricot'}`, `{id:2,name:'apple'}`, `{id:3,name:'apex'}`.

Operation: `db.select().from(t).orderBy(asc(t.name))`, collect `name` values.

Expected: `['apex', 'apple', 'apricot']`
Actual: `[0, 0, 0]`

## Observed failure 5

### Test: `a shorter string sorts before a longer string that extends it`

Setup: inserted `{id:1,name:'apples'}`, `{id:2,name:'apple'}`.

Operation: `db.select().from(t).orderBy(asc(t.name))`, collect `name` values.

Expected: `['apple', 'apples']`
Actual: `[0, 0]`

## Observed failure 6

### Test: `an empty string sorts before any non-empty string`

Setup: inserted `{id:1,name:'a'}`, `{id:2,name:''}`.

Operation: `db.select().from(t).orderBy(asc(t.name))`, collect `id` values.

Expected: `[2, 1]`
Actual: `[1, 2]`

## Observed failure 7

### Test: `a descending text sort is the exact reverse of the ascending one`

Setup: same `seededNames`.

Operation: compare `id` sequence of `orderBy(desc(t.name))` against the reverse of `orderBy(asc(t.name))`.

Expected: `[4, 3, 2, 1]`
Actual: `[1, 2, 3, 4]`

## Summary

Two behaviors are observed across these tests:

1. Reading a `text` column returns the number `0` for every row instead of the stored string value.
2. `orderBy` on a `text` column does not reorder rows; results come back in insertion order regardless of `asc`/`desc`.

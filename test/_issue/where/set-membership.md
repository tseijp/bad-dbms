# where / set-membership

Test file: `test/where/set-membership.test.ts`
Result: 3 failed / 12 passed (15 total)

## Summary

`inArray` and `notInArray` over a column that holds a genuine NULL keep the
NULL rows. Expected SQL behavior: `NULL IN (...)` and `NULL NOT IN (...)` are
UNKNOWN, so the NULL rows drop out of both.

Seed used by the failures:

```ts
table('entries', { id: integer('id').primaryKey(), tag: integer('tag') })
insert([{ id: 1, tag: 10 }, { id: 2 }, { id: 3, tag: 30 }, { id: 4 }])
```

Rows id 2 and id 4 are inserted without a `tag`.

## Observed failures

### 1. `a list that contains the matching values still excludes the null-tagged rows` (line 98)

- Operation: `where(inArray(t.tag, [10, 30, 0]))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3, 4]` — rows 2 and 4 (no tag) are kept; they match the `0`
  in the list.

### 2. `NOT IN against a null-valued column is unknown, so notInArray drops the null rows` (line 104)

- Operation: `where(notInArray(t.tag, [99]))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3, 4]` — rows 2 and 4 are kept.

### 3. `inArray and notInArray over a null-bearing column do not partition the table` (line 111)

- Operations: `inArray(t.tag, [10, 30])` then `notInArray(t.tag, [10, 30])`
- Expected union of both result sets: `[1, 3]`
- Actual: `[1, 2, 3, 4]` — rows 2 and 4 appear in one of the two sets.

## Observed behavior

A column inserted without a value is treated as the numeric `0`: it matches
`inArray` when `0` is in the list, and matches `notInArray` when it is not.
The NULL rows are not excluded as UNKNOWN.

## Passing tests

12 set-membership tests pass, including `inArray`/`notInArray` over
fully-populated columns and `inArray(t.tag, [10, 30])` excluding rows 2/4
(passes because `0` is not in that list).

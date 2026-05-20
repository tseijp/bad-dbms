# where / logical

Test file: `test/where/logical.test.ts`
Result: 3 failed / 17 passed (20 total)

## Summary

Logical combinators (`not`, `or`) over a NULL-bearing comparison, and `isNull`,
do not follow SQL three-valued logic. The failures use a seed where row id 2 is
inserted without a `score`:

```ts
table(..., { id: integer('id').primaryKey(), score: integer('score') })
insert([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
```

## Observed failures

### 1. `NOT of UNKNOWN is still UNKNOWN, so negating a null comparison drops the row` (line 140)

- Operation: `where(not(gt(t.score, 5)))`
- Expected: `[]`
- Actual: `[2]` — the NULL-score row id 2 is kept. `not(UNKNOWN)` should remain
  UNKNOWN and exclude the row; instead `not(gt(NULL, 5))` is treated as true.

### 2. `a comparison and its negation do not partition a table that holds a null` (line 147)

- Operations: `gt(t.score, 15)` then `not(gt(t.score, 15))`
- Expected union of both result sets: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 appears in one of the two sets.

### 3. `isNull is the only way to reclaim the row that all comparisons drop` (line 155)

- Operation: `where(or(gt(t.score, 5), isNull(t.score)))`
- Expected: `[1, 2, 3]`
- Actual: `[1, 3]` — `isNull(t.score)` does not match id 2, so the row inserted
  without a score is not reclaimed.

## Observed behavior

- A column inserted without a value is not recognized by `isNull` (failure 3),
  consistent with it being stored as `0` rather than NULL.
- `not(...)` over a NULL-bearing comparison yields true for the NULL row
  instead of UNKNOWN (failures 1, 2).

## Passing tests

The 17 remaining logical tests pass, including `or`/`and` truth-table cases
over fully-populated columns.

# where / between

Test file: `test/where/between.test.ts`
Result: 3 failed / 10 passed (13 total)

## Summary

`between` and `notBetween` over a column that holds a genuine NULL keep the
NULL row. Expected SQL behavior: `NULL BETWEEN a AND b` is UNKNOWN, so the NULL
row drops out of both `between` and `notBetween`.

All three failures use this seed:

```ts
table('calc', { id: integer('id').primaryKey(), score: integer('score') })
insert([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
```

Row id 2 is inserted without a `score`.

## Observed failures

### 1. `a between over a column drops the row whose value is null` (line 95)

- Operation: `db.select().from(t).where(between(t.score, 0, 100))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 (NULL score) is kept.

### 2. `notBetween over a column also drops the null row, since UNKNOWN negates to UNKNOWN` (line 102)

- Operation: `db.select().from(t).where(notBetween(t.score, 100, 200))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 is kept.

### 3. `between and notBetween do not partition a table that holds a null` (line 109)

- Operations:
  - `between(t.score, 0, 100)` then `notBetween(t.score, 0, 100)`
- Expected union of both result sets: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 appears in at least one of the two result sets.

## Observed behavior

A NULL column value is treated as 0 by `between` / `notBetween`; the NULL row
is not excluded as UNKNOWN.

## Passing tests

The 10 `between` / `notBetween` tests over fully-populated tables pass.

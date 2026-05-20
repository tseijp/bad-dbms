# where / comparison

Test file: `test/where/comparison.test.ts`
Result: 4 failed / 19 passed (23 total)

## Summary

Comparison operators against a column that holds a genuine NULL keep the NULL
row instead of dropping it. Expected SQL behavior: every comparison against a
NULL operand is UNKNOWN, so the NULL row is excluded by all six operators.

The failures use this seed:

```ts
table('scores', { id: integer('id').primaryKey(), score: integer('score') })
insert([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
```

Row id 2 is inserted without a `score`. A read-back of id 2 shows
`{ id: 2, score: 0 }` (see failure 4).

## Observed failures

The parameterized test `%s against 10 excludes the null-scored row` (line 104)
fails for three operators:

### 1. `ne against 10 excludes the null-scored row`

- Operation: `where(ne(t.score, 10))`
- Expected: `[3]`
- Actual: includes id 2 (NULL row treated as `0 != 10` -> true).

### 2. `lt against 10 excludes the null-scored row`

- Operation: `where(lt(t.score, 10))`
- Expected: `[]`
- Actual: includes id 2 (NULL row treated as `0 < 10` -> true).

### 3. `lte against 10 excludes the null-scored row`

- Operation: `where(lte(t.score, 10))`
- Expected: `[1]`
- Actual: includes id 2 (NULL row treated as `0 <= 10` -> true).

### 4. `a null score equals nothing, so an eq probe at zero leaves it out` (line 125)

- Operation: `where(eq(t.score, 0))`
- Expected: `[]`
- Actual: `[{ __rid: [0,1], id: 2, score: 0 }]` — the row inserted without a
  score is stored/returned with `score: 0` and matches `eq(score, 0)`.

## Observed behavior

A column inserted without a value is stored as the numeric `0` rather than
NULL. Comparisons treat it as `0`, so `ne` / `lt` / `lte` / `eq(.,0)` admit it
where SQL three-valued logic would exclude it.

## Passing tests

The 19 comparison tests over fully-populated columns pass, including the
`eq`/`gte` rows of the parameterized test and `eq(t.score, null)` matching no
row.

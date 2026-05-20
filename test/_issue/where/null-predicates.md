# where / null-predicates

Test file: `test/where/null-predicates.test.ts`
Result: 6 failed / 6 passed (12 total)

## Summary

A nullable column inserted without a value is not treated as NULL. `isNull`
matches nothing, `isNotNull` matches every row, and comparisons treat the
missing value as `0`.

Seed used by the failures:

```ts
table('members', { id: integer('id').primaryKey(), score: integer('score') })
insert([
  { id: 1, score: 10 },
  { id: 2 },            // no score
  { id: 3, score: 30 },
  { id: 4 },            // no score
  { id: 5, score: 0 },
])
```

## Observed failures

### 1. `isNull matches exactly the rows whose nullable column was never set` (line 32)

- Operation: `where(isNull(t.score))`
- Expected: `[2, 4]`
- Actual: `[]` — `isNull` matches no row.

### 2. `isNotNull matches exactly the rows that carry a real value, including zero` (line 38)

- Operation: `where(isNotNull(t.score))`
- Expected: `[1, 3, 5]`
- Actual: `[1, 2, 3, 4, 5]` — rows 2 and 4 (never set) are treated as non-null.

### 3. `a null-valued column is not equal to zero, so eq-zero spares the null rows` (line 44)

- Operation: `where(eq(t.score, 0))`
- Expected: `[5]` (only id 5 was explicitly set to 0)
- Actual: `[2, 4, 5]` — rows 2 and 4 are stored as `0` and match.

### 4. `a less-than test against a column also drops the null rows` (line 65)

- Operation: `where(lt(t.score, 100))`
- Expected: `[1, 3, 5]`
- Actual: `[1, 2, 3, 4, 5]` — rows 2 and 4 treated as `0 < 100` -> true.

### 5. `an and of a null-valued comparison contributes unknown and drops the row` (line 102)

- Operation: `where(and(gte(t.score, 0), lt(t.score, 100)))`
- Expected: `[1, 3, 5]`
- Actual: `[1, 2, 3, 4, 5]` — rows 2 and 4 pass both halves as `0`.

### 6. `an or with a true half still admits a row even when the other half is unknown` (line 109)

- Operation: `where(or(isNull(t.score), gt(t.score, 5)))`
- Expected: `[1, 2, 3, 4]`
- Actual: `[1, 3]` — `isNull` matches nothing, and rows 2/4 (`score` 0) fail
  `gt(score, 5)`.

## Observed behavior

A nullable `integer` column inserted without a value is stored and read back as
the numeric `0`. `isNull` never matches it, `isNotNull` always matches it, and
all numeric comparisons treat it as `0`.

## Passing tests

6 tests pass, including `ne(t.score, 0)`, `gt(t.score, 5)` and the `eq(t.score,
null)` case (results not enumerated here).

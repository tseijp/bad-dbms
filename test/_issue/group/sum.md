# Issue: group/sum.test.ts

Test run: `npx vitest run --no-coverage test/group/sum.test.ts`
Result: 1 passed, 15 failed (16 total)

## Failing tests

All 15 failures share one observed behavior: a per-group `sum()` resolves to a JS
`number` but the tests expect a string.

Failing test names:

- `per-group sum > sums the v values of event kind 0 / 1 / 2 to the string 300 / 700 / 500`
- `per-group sum > sums each post group score independently as strings`
- `per-group sum > sums the two even groups shape per group`
- `per-group sum > sums the negatives in a group shape per group`
- `per-group sum > sums the mixed signs shape per group`
- `per-group sum > sums the singleton group shape per group`
- `per-group sum > seeds events, sums per group, raises one row, then re-sums`
- `per-group sum > resolves a per-group sum to a string, not a JS number`
- `per-group sum > sums group 0 / 1 / 2 / 3 / 4 of the rich dataset to the string 60 / 300 / 0 / 7 / 0`

## Observed behavior

- Operation: `db.select({ ..., s: sum(t.v) }).from(t).groupBy(...)`, then read `.s` of a group row.
- Expected: `.s` is a string (e.g. `'300'`, `'30'`, `'-20'`, `'0'`, `'7'`); `typeof .s === 'string'`.
- Observed in every case: `.s` is a JS number with the numerically-correct value.
  - `AssertionError: expected 300 to be '300' // Object.is equality`
  - `AssertionError: expected 30 to be '30'`
  - `AssertionError: expected -20 to be '-20'`
  - `AssertionError: expected 'number' to be 'string'` (at sum.test.ts:79)

The per-group sum value is computed correctly, but `sum()` returns a numeric type
where the tests expect the aggregate to be returned as a string.

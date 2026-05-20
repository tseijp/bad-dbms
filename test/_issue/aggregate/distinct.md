# Issue: distinct aggregates (distinct.test.ts)

Test file: `test/aggregate/distinct.test.ts`
Result: 36 failed / 15 passed (51 total)

## Observed failures

### A. `countDistinct()` does not collapse duplicates

`countDistinct()` returns the total row count, not the count of distinct values.

Examples:
- `numTable([1,1,2,2,3])`, `countDistinct(t.v)` -> expected `3`, actual `5`.
- All-identical dataset (4 rows) -> expected `1`, actual `4`.
- One-duplicate-pair dataset -> expected `2`, actual `3`.
- Interleaved duplicates -> expected `2`, actual `5`.
- Triples dataset -> expected `2`, actual `6`.
- Negatives-repeated dataset -> expected `3`, actual `5`.
- Zeros-and-ones dataset -> expected `2`, actual `5`.
- Scattered-repeats dataset -> expected `3`, actual `6`.

- Test "shows count() and countDistinct genuinely differ on duplicates": dataset of 5 rows with duplicates -> expected `[5, 3]`, actual `[5, 5]` (`countDistinct` equals plain `count`).
- Test "inserts duplicates, then watches countDistinct stay flat as count climbs": expected `[{n:3,d:3},{n:5,d:3}]`, actual `[{n:3,d:3},{n:5,d:5}]` (`d` climbs with `n` instead of staying flat).
- "reads plain and distinct count ... at once" tests: distinct `d` always equals plain `n` (e.g. `{n:4,d:4}` instead of `{n:4,d:1}`).

### B. `sumDistinct()` does not collapse duplicates and returns a number instead of a string

- `numTable([1,1,2,2,3])`, `sumDistinct(t.v)` -> expected `'6'`, actual `9` (sums all rows, and is a number not a string).
- All-identical dataset `[5,5,5]` -> expected `'5'`, actual `15`.
- Negatives dataset -> expected `'-3'`, actual `-4`.
- Paired dataset -> expected `'9'`, actual `18`.
- No-duplicates dataset -> expected string `'6'`, actual number `6` (value correct, type wrong).
- With-zero dataset -> expected string `'3'`, actual number `3` (value correct, type wrong).
- Test "sums distinct to NULL over an empty table" -> expected `null`, actual `0`.
- Test "reads both plain and distinct sums of a duplicated table at once" -> expected `{s:'7',sd:'5'}`, actual `{s:7,sd:7}` (numbers not strings; `sd` not collapsed).

### C. `avgDistinct()` does not collapse duplicates and returns a number instead of a string

- `numTable([1,1,2,2,3])`, `avgDistinct(t.v)` -> expected `'2'`, actual `1.8` (averages all rows; type is number not string).
- Unique-run dataset -> expected string `'2'`, actual number `2`.
- All-same dataset -> expected string `'8'`, actual number `8`.
- Paired-symmetric dataset -> expected string `'20'`, actual number `20`.
- Negatives dataset -> expected `'-4'`, actual `-3.5`.

## Summary of observed behavior

- `countDistinct()`, `sumDistinct()`, `avgDistinct()` do not deduplicate values; they operate over every row as if they were plain `count`/`sum`/`avg`.
- `sumDistinct()` and `avgDistinct()` yield JavaScript `number` values, while the tests expect `string`.
- `sumDistinct()` over an empty table yields `0`, while the tests expect `null`.

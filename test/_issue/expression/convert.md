# Issue: expression/convert.test.ts — type conversion projections return `undefined`

## Summary

Test file: `test/expression/convert.test.ts`
Result: 12 tests, 12 failed, 0 passed.

Every test projects a type conversion expression (`.toFloat` / `.toInt` / `.toBool`) into a
`db.select({ x: ... })` call and reads the column back per row. In every case the projected
column `x` is `undefined` for every row instead of the converted value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Expression | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| keeps the numeric value through toFloat | `score.toFloat()` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| truncates a float toward zero with toInt | `v.toInt()` on `[1.9,2.1,3.5]` | `[1, 2, 3]` | `[undefined, undefined, undefined]` |
| truncates negative floats toward zero with toInt | `v.toInt()` on `[-1.9,-2.1,-0.5]` | `[-1, -2, 0]` | `[undefined, undefined, undefined]` |
| maps every non-zero value to true with toBool | `score.toBool()` | `[true, true, true]` | `[undefined, undefined, undefined]` |
| maps zero to false and non-zero to true with toBool | `v.toBool()` on `[0,1,0,5,-3]` | `[false, true, false, true, true]` | `[undefined×5]` |
| keeps positive integers unchanged through toFloat | `v.toFloat()` on `[1,2,3]` | `[1, 2, 3]` | `[undefined, undefined, undefined]` |
| keeps with zero unchanged through toFloat | `v.toFloat()` on `[0,5,10]` | `[0, 5, 10]` | `[undefined, undefined, undefined]` |
| keeps negatives unchanged through toFloat | `v.toFloat()` on `[-1,-2,-3]` | `[-1, -2, -3]` | `[undefined, undefined, undefined]` |
| truncates just above integers toward zero with toInt | `v.toInt()` on `[1.01,2.99,3.5]` | `[1, 2, 3]` | `[undefined, undefined, undefined]` |
| truncates exact integers as float toward zero with toInt | `v.toInt()` on `[4.0,5.0,6.0]` | `[4, 5, 6]` | `[undefined, undefined, undefined]` |
| truncates fractions below one toward zero with toInt | `v.toInt()` on `[0.1,0.9,0.5]` | `[0, 0, 0]` | `[undefined, undefined, undefined]` |
| produces a strict boolean array from toBool, not numbers | `v.toBool()` on `[0,2]` | `[false, true]` | `[undefined, undefined]` |

## Observed gap

bad-dbms does not evaluate a type conversion expression placed in a `select()` projection.
The query produces one row object per source row, but the projected expression key is absent
(reads as `undefined`). No error is thrown. No conversion test reached a row value, so
truncation behaviour and strict-boolean output could not be observed.

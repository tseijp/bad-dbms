# Issue: expression/compose.test.ts — arithmetic+conversion projections return `undefined`

## Summary

Test file: `test/expression/compose.test.ts`
Result: 9 tests, 9 failed, 0 passed.

Every test projects an expression composing arithmetic with a type conversion
(`.toFloat` / `.toInt` / `.toBool`) into a `db.select({ x: ... })` call and reads the column
back per row. In every case the projected column `x` is `undefined` for every row instead of
the computed value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Expression | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| applies arithmetic then converts the result to float | `score.add(id).toFloat()` | `[11, 22, 33]` | `[undefined, undefined, undefined]` |
| converts to int after a float-producing division | `v.div(10).toInt()` on `[10,21,35]` | `[1, 2, 3]` | `[undefined, undefined, undefined]` |
| converts an arithmetic result to a boolean | `score.sub(10).toBool()` | `[false, true, true]` | `[undefined, undefined, undefined]` |
| chains a conversion then further arithmetic | `v.toInt().mul(10)` on `[1.9,2.1,3.5]` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| evaluates the add then toFloat composition | `score.add(100).toFloat()` | `[110, 120, 130]` | `[undefined, undefined, undefined]` |
| evaluates the mul then toFloat composition | `score.mul(2).toFloat()` | `[20, 40, 60]` | `[undefined, undefined, undefined]` |
| evaluates the sub then toBool composition | `score.sub(20).toBool()` | `[true, false, true]` | `[undefined, undefined, undefined]` |
| evaluates the div then toInt composition | `score.div(20).toInt()` | `[0, 1, 1]` | `[undefined, undefined, undefined]` |
| seeds, reads a raw column, then re-reads it through a conversion chain | raw `score` vs `score.toFloat().mul(2)` | `[[10,20,30],[20,40,60]]` | `[[undefined×3],[undefined×3]]` |

## Observed gap

bad-dbms does not evaluate an expression that composes arithmetic with a type conversion
when placed in a `select()` projection. The query produces one row object per source row,
but the projected expression key is absent (reads as `undefined`). No error is thrown.
In the last test the raw-column projection `select({ x: users.score })` also returned
`undefined` for column `x` (expected `[10, 20, 30]`).

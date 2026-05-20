# Issue: expression/twocol.test.ts — two-column expression projections return `undefined`

## Summary

Test file: `test/expression/twocol.test.ts`
Result: 9 tests, 9 failed, 0 passed.

Every test projects an arithmetic expression between two columns of the same row
(e.g. `users.score.add(users.id)`) into a `db.select({ x: ... })` call and reads the column
back per row. In every case the projected column `x` is `undefined` for every row instead of
the computed value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Expression | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| adds two columns of the same row | `score.add(id)` | `[11, 22, 33]` | `[undefined, undefined, undefined]` |
| subtracts one column from another in the same row | `score.sub(id)` | `[9, 18, 27]` | `[undefined, undefined, undefined]` |
| multiplies two columns of the same row | `score.mul(id)` | `[10, 40, 90]` | `[undefined, undefined, undefined]` |
| divides one column by another in the same row | `score.div(id)` | `[10, 10, 10]` | `[undefined, undefined, undefined]` |
| evaluates a.add(b) over a column pair | `a.add(b)` on `[[1,3],[10,2],[6,3]]` | `[4, 12, 9]` | `[undefined, undefined, undefined]` |
| evaluates a.sub(b) over a column pair | `a.sub(b)` on `[[1,3],[10,2],[6,3]]` | `[-2, 8, 3]` | `[undefined, undefined, undefined]` |
| evaluates a.mul(b) over a column pair | `a.mul(b)` on `[[1,3],[10,2],[6,3]]` | `[3, 20, 18]` | `[undefined, undefined, undefined]` |
| takes one column modulo another in the same row | `a.mod(b)` on `[[10,3],[20,7],[9,9]]` | `[1, 6, 0]` | `[undefined, undefined, undefined]` |
| reads two columns into one expression after a where filter | `score.add(id)` with `.where(id.gt(1))` | `[22, 33]` | `[undefined, undefined]` |

## Observed gap

bad-dbms does not evaluate an arithmetic expression between two columns of the same row when
placed in a `select()` projection. The query produces one row object per source row, but the
projected expression key is absent (reads as `undefined`). No error is thrown. The last test
shows the row count is reduced correctly by the `.where()` filter (2 rows) while the projected
expression value is still `undefined`.

# Issue: expression/arith.test.ts — arithmetic operator projections return `undefined`

## Summary

Test file: `test/expression/arith.test.ts`
Result: 23 tests, 23 failed, 0 passed.

Every test projects an arithmetic expression (`.add` / `.sub` / `.mul` / `.div` / `.mod`)
into a `db.select({ x: ... })` call and reads the column back per row. In every case the
projected column `x` is `undefined` for every row instead of the computed numeric value.

## Observed behaviour

For each test the query runs without throwing, returns the expected number of rows, but the
projected expression key holds `undefined` on every row.

| Test | Operation | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| adds a literal to every score | `users.score.add(5)` | `[15, 25, 35]` | `[undefined, undefined, undefined]` |
| subtracts a literal from every score | `users.score.sub(5)` | `[5, 15, 25]` | `[undefined, undefined, undefined]` |
| multiplies every score by a literal | `users.score.mul(2)` | `[20, 40, 60]` | `[undefined, undefined, undefined]` |
| divides every score by a literal | `users.score.div(10)` | `[1, 2, 3]` | `[undefined, undefined, undefined]` |
| takes every score modulo a literal | `users.score.mod(7)` | `[3, 6, 2]` | `[undefined, undefined, undefined]` |
| adds zero as an identity | `users.score.add(0)` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| multiplies by one as an identity | `users.score.mul(1)` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| multiplies by zero to collapse every value | `users.score.mul(0)` | `[0, 0, 0]` | `[undefined, undefined, undefined]` |
| evaluates score.add over the user seed | `score.add(1)` | `[11, 21, 31]` | `[undefined, undefined, undefined]` |
| evaluates score.add negative over the user seed | `score.add(-5)` | `[5, 15, 25]` | `[undefined, undefined, undefined]` |
| evaluates score.add large over the user seed | `score.add(1000)` | `[1010, 1020, 1030]` | `[undefined, undefined, undefined]` |
| evaluates score.sub over the user seed | `score.sub(3)` | `[7, 17, 27]` | `[undefined, undefined, undefined]` |
| evaluates score.sub into negative over the user seed | `score.sub(15)` | `[-5, 5, 15]` | `[undefined, undefined, undefined]` |
| evaluates score.mul over the user seed | `score.mul(3)` | `[30, 60, 90]` | `[undefined, undefined, undefined]` |
| evaluates score.mul by negative over the user seed | `score.mul(-1)` | `[-10, -20, -30]` | `[undefined, undefined, undefined]` |
| evaluates score.div exact over the user seed | `score.div(5)` | `[2, 4, 6]` | `[undefined, undefined, undefined]` |
| evaluates score.mod over the user seed | `score.mod(3)` | `[1, 2, 0]` | `[undefined, undefined, undefined]` |
| evaluates score.mod by large over the user seed | `score.mod(100)` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| evaluates v.add over a signed dataset | `v.add(10)` on `[-10,0,-5,100]` | `[0, 10, 5, 110]` | `[undefined, undefined, undefined, undefined]` |
| evaluates v.sub over a signed dataset | `v.sub(10)` on `[-10,0,-5,100]` | `[-20, -10, -15, 90]` | `[undefined, undefined, undefined, undefined]` |
| evaluates v.mul over a signed dataset | `v.mul(2)` on `[-10,0,-5,100]` | `[-20, 0, -10, 200]` | `[undefined, undefined, undefined, undefined]` |
| evaluates integer division truncating toward zero | `v.div(3)` on `[7,9,14,1]` | `[2, 3, 4, 0]` | `[undefined, undefined, undefined, undefined]` |
| evaluates modulo with negative operands following SQL sign rules | `v.mod(3)` on `[-7,-9,7]` | `[-1, 0, 1]` | `[undefined, undefined, undefined]` |

## Observed gap

bad-dbms does not evaluate an arithmetic expression placed in a `select()` projection.
The query produces one row object per source row, but the projected expression key is absent
(reads as `undefined`). No error is thrown.

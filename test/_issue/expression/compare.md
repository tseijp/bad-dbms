# Issue: expression/compare.test.ts — comparison operator projections return `undefined`

## Summary

Test file: `test/expression/compare.test.ts`
Result: 15 tests, 15 failed, 0 passed.

Every test projects a comparison expression (`.eq` / `.ne` / `.gt` / `.gte` / `.lt` / `.lte`)
into a `db.select({ x: ... })` call and reads the column back per row. In every case the
projected column `x` is `undefined` for every row instead of the expected boolean value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Operation | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| evaluates score.eq(20) to a boolean sequence | `score.eq(20)` | `[false, true, false]` | `[undefined, undefined, undefined]` |
| evaluates score.ne(20) to a boolean sequence | `score.ne(20)` | `[true, false, true]` | `[undefined, undefined, undefined]` |
| evaluates score.gt(20) to a boolean sequence | `score.gt(20)` | `[false, false, true]` | `[undefined, undefined, undefined]` |
| evaluates score.gte(20) to a boolean sequence | `score.gte(20)` | `[false, true, true]` | `[undefined, undefined, undefined]` |
| evaluates score.lt(20) to a boolean sequence | `score.lt(20)` | `[true, false, false]` | `[undefined, undefined, undefined]` |
| evaluates score.lte(20) to a boolean sequence | `score.lte(20)` | `[true, true, false]` | `[undefined, undefined, undefined]` |
| returns strict booleans, not 1 and 0, from a comparison | `score.gt(15)` | `[false, true, true]` | `[undefined, undefined, undefined]` |
| compares two expressions and yields a boolean | `score.eq(id.mul(10))` | `[true, true, true]` | `[undefined, undefined, undefined]` |
| evaluates a.eq across columns(b) to a boolean per row | `a.eq(b)` | `[false, true, false]` | `[undefined, undefined, undefined]` |
| evaluates a.ne across columns(b) to a boolean per row | `a.ne(b)` | `[true, false, true]` | `[undefined, undefined, undefined]` |
| evaluates a.gt across columns(b) to a boolean per row | `a.gt(b)` | `[true, false, false]` | `[undefined, undefined, undefined]` |
| evaluates a.lt across columns(b) to a boolean per row | `a.lt(b)` | `[false, false, true]` | `[undefined, undefined, undefined]` |
| compares an arithmetic expression against a literal | `score.add(5).gt(20)` | `[false, true, true]` | `[undefined, undefined, undefined]` |
| evaluates a comparison over a signed dataset | `v.gte(0)` on `[-5,0,5]` | `[false, true, true]` | `[undefined, undefined, undefined]` |
| evaluates equality against zero | `v.eq(0)` on `[0,1,0,-1]` | `[true, false, true, false]` | `[undefined, undefined, undefined, undefined]` |

## Observed gap

bad-dbms does not evaluate a comparison expression placed in a `select()` projection.
The query produces one row object per source row, but the projected expression key is absent
(reads as `undefined`). No error is thrown. No comparison test reached a row value at all,
so whether the result would be a strict boolean vs `1`/`0` could not be observed.

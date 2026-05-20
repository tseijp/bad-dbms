# Issue: expression/usecase.test.ts — end-to-end expression projections return `undefined`

## Summary

Test file: `test/expression/usecase.test.ts`
Result: 7 tests, 7 failed, 0 passed.

Each test is an end-to-end scenario that derives a value from an expression placed in a
`db.select({ ... })` projection, optionally mutates the data, and re-derives. In every case
the projected expression key is `undefined` for every row instead of the computed value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Expression | Expected | Observed |
| --- | --- | --- | --- |
| models a discount: scale every score down then floor it to an int | `v.mul(8).div(10).toInt()` on `[19,25,33,47]` | `[15, 20, 26, 37]` | `[undefined, undefined, undefined, undefined]` |
| flags rows over a threshold and re-reads the flag after an update | `score.gt(15)` before/after update | `[[false,true,true],[false,true,false]]` | `[[undefined×3], ...]` |
| computes a per-row bonus from two columns and projects it beside the id | `select({ id, bonus: score.add(id).mul(2) })` | `[{id:1,bonus:22},{id:2,bonus:44},{id:3,bonus:66}]` | `[{id:1,bonus:undefined}, ...]` |
| builds a parity flag from a modulo expression | `v.mod(2).eq(0)` on `[1..6]` | `[false,true,false,true,false,true]` | `[undefined×6]` |
| seeds, derives a normalized score, then inserts a row and re-derives | `v.div(100)` before/after insert | `[[1,2,3],[1,2,3,4]]` | `[[undefined×3], ...]` |
| derives a clamped-style flag and re-checks it after lowering a value | `v.gte(50)` before/after update | `[[false,true,true],[false,false,true]]` | `[[undefined×3], ...]` |
| reads a derived running scale before and after deleting a row | `v.mul(3)` before/after delete | `[[30,60,90],[30,90]]` | `[[undefined×3], ...]` |

## Observed gap

bad-dbms does not evaluate a derived expression placed in a `select()` projection in any
end-to-end scenario. The query produces one row object per source row, but the projected
expression key is absent (reads as `undefined`). No error is thrown.

Notable: in the "computes a per-row bonus" test, the row object correctly contains the plain
column projection `id` (`{ id: 1, ... }`) but the expression projection `bonus` is
`undefined` — a plain column key in the same projection populates while the expression key
does not.

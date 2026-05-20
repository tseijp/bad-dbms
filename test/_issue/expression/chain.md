# Issue: expression/chain.test.ts — chained expression projections return `undefined`

## Summary

Test file: `test/expression/chain.test.ts`
Result: 14 tests, 14 failed, 0 passed.

Every test projects a multi-step chained expression (e.g. `score.add(1).mul(2)`) into a
`db.select({ x: ... })` call and reads the column back per row. In every case the projected
column `x` is `undefined` for every row instead of the computed numeric value.

## Observed behaviour

Queries run without throwing and return the expected number of rows, but the projected
expression key holds `undefined` on every row.

| Test | Chain | Expected column `x` | Observed column `x` |
| --- | --- | --- | --- |
| applies add then mul in chain order | `score.add(1).mul(2)` | `[22, 42, 62]` | `[undefined, undefined, undefined]` |
| applies mul then add in chain order | `score.mul(2).add(1)` | `[21, 41, 61]` | `[undefined, undefined, undefined]` |
| evaluates a three-step chain mixing two columns and a literal | `score.add(id).sub(5)` | `[6, 17, 28]` | `[undefined, undefined, undefined]` |
| evaluates a divide-then-multiply chain across two columns | `score.div(10).mul(id)` | `[1, 4, 9]` | `[undefined, undefined, undefined]` |
| evaluates the add then sub chain left-to-right | `score.add(5).sub(3)` | `[12, 22, 32]` | `[undefined, undefined, undefined]` |
| evaluates the sub then mul chain left-to-right | `score.sub(5).mul(2)` | `[10, 30, 50]` | `[undefined, undefined, undefined]` |
| evaluates the mul then div chain left-to-right | `score.mul(3).div(2)` | `[15, 30, 45]` | `[undefined, undefined, undefined]` |
| evaluates the add then mul then sub chain left-to-right | `score.add(2).mul(2).sub(4)` | `[20, 40, 60]` | `[undefined, undefined, undefined]` |
| evaluates the div then add then mul chain left-to-right | `score.div(10).add(1).mul(3)` | `[6, 9, 12]` | `[undefined, undefined, undefined]` |
| evaluates the mod then add chain left-to-right | `score.mod(7).add(100)` | `[103, 106, 102]` | `[undefined, undefined, undefined]` |
| evaluates the mul then mod chain left-to-right | `score.mul(2).mod(7)` | `[6, 5, 4]` | `[undefined, undefined, undefined]` |
| evaluates the four-step chain chain left-to-right | `score.add(1).mul(2).sub(2).div(2)` | `[10, 20, 30]` | `[undefined, undefined, undefined]` |
| proves chaining order matters by comparing two orderings | `add(1).mul(2)` vs `mul(2).add(1)` | `[[22,42,62],[21,41,61]]` | `[[undefined×3],[undefined×3]]` |
| keeps a long chain stable across a re-read of the same query | `score.add(5).mul(2).sub(10)` (read twice) | `[[20,40,60],[20,40,60]]` | `[[undefined×3],[undefined×3]]` |

## Observed gap

bad-dbms does not evaluate a chained arithmetic expression placed in a `select()` projection.
The query produces one row object per source row, but the projected expression key is absent
(reads as `undefined`). No error is thrown.

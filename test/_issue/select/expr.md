# Issue: expr.test.ts — expression columns in a projection produce no value

Test file: `test/select/expr.test.ts`
Run: `npx vitest run --no-coverage test/select/expr.test.ts`
Result: 25 tests, 3 passed, 22 failed.

## Observed failure 1: single-column expression projections yield undefined

Operation: `db.select({ doubled: users.score.mul(2) }).from(users)` and similar expression projections.

- Test "doubles every score through a multiply expression column": expected `[20, 40, 60]`, observed `[undefined, undefined, undefined]`.
- Test "produces a defined value for every expression-column row": expected `every(r => r.doubled !== undefined)` to be `true`, observed `false`.
- Tests "evaluates the add 5 / sub 5 / mul 2 / div 10 / mod 7 expression column": each `valuesOf(rows, 'x')` expected the computed values, observed `[undefined, undefined, undefined]`.

Observed: a projected expression column (single-column arithmetic) produces `undefined` for every row.

## Observed failure 2: two-column expression projections yield undefined

Operation: expression projections combining two columns, e.g. `score plus id`.

- Tests "evaluates the two-column expression score plus/minus/times/over id": expected computed values, observed `undefined`.
- Tests "evaluates the composed projection add then mul / mul then add / div then mul / add col then sub": expected computed values, observed `undefined`.

## Observed failure 3: mixed and side-by-side expression columns yield undefined

- Test "mixes a plain column and an expression column in one projection": `db.select({ id: users.id, bonus: ... })` — expected `{ id: 1, bonus: 11 }`, observed bonus `undefined` (assertion at line 76).
- Test "projects two independent expression columns side by side": expected `{ twice: 20, more: 110 }`, observed `{ twice: undefined, more: undefined }`.
- Tests "reads row N of a two-expression projection exactly": expected computed `{ twice, more }`, observed both `undefined`.

## Observed failure 4: derived-column reads stale / undefined across queries and updates

- Test "lets a user read raw then derived scores across two queries": raw read returned `[10, 20, 30]` (correct); derived read `db.select({ score: users.score.mul(3) })` expected `[30, 60, 90]`, observed `[10, 20, 30]` (the raw values, not the multiplied ones).
- Test "seeds, projects a derived column, updates a row, then re-derives": expected `[[20, 40, 60], [20, 200, 60]]`, observed `[[undefined, undefined, undefined], [undefined, undefined, undefined]]`.

## Summary of observed behavior

bad-dbms does not evaluate expression columns in a projection. Arithmetic expressions built from columns (e.g. `users.score.mul(2)`, `users.score.add(users.id)`) return `undefined` for every row. In one case where a derived column shares a key name with a plain column, the un-derived raw column value is returned instead of the computed result.

# Issue: alias.test.ts — projection column aliasing not honored

Test file: `test/select/alias.test.ts`
Run: `npx vitest run --no-coverage test/select/alias.test.ts`
Result: 24 tests, 2 passed, 22 failed.

## Observed failure 1: single-column alias ignored

Operation: `db.select({ point: users.score }).from(users)` (and equivalents with aliases `total`, `value`, `userId`, `label`, `tag`).

- Test "keys the result by the alias when it differs from the column name": expected keys `['point']`, observed `['score']`.
- Tests "keys the result by the alias ..." (point, total, value, userId, label): expected `[alias]`, observed `[<source column name>]`.
- Test "drops the original column name when an alias renames it": expected `'score' in row` to be `false`, observed `true`.
- Tests "drops the source column name ... when aliased": expected the source name absent, observed present.
- Test "reads aliased values in order under the new key": `valuesOf(rows, 'point')` expected `[10, 20, 30]`, observed `[undefined, undefined, undefined]`.
- Test "keys a renamed text column by its alias": expected `['tag']`, observed `['label']`.
- Test "reads a renamed text column value under its alias": `valuesOf(rows, 'tag')` expected `['alpha', 'beta', 'gamma']`, observed `[undefined, undefined, undefined]`.
- Test "drops the text column name when it is aliased": expected `'label' in row` to be `false`, observed `true`.

Observed: the alias supplied as the projection key is ignored; the result row is keyed by the original column name. Reading via the alias key yields `undefined`.

## Observed failure 2: multi-column alias ignored

Operation: `db.select({ uid: users.id, pts: users.score }).from(users)`.

- Test "gives a double projection exactly the two alias keys": expected `['pts', 'uid']`, observed (per the assertion at line 87) keyed by source names.
- Tests "reads row N of a relabelled two-column projection exactly": expected `{ uid: N, pts: N0 }`, observed `{ id: N, score: N0 }`.

## Observed failure 3: alias ignored when mixed with same-named column

Operation: `db.select({ id: users.id, pts: users.score }).from(users)`.

- Test "mixes an aliased column with a same-named column in one projection": expected `{ id: 1, pts: 10 }`, observed `{ id: 1, score: 10 }`.

Observed: the aliased entry `pts` keeps the source column name `score` in the result.

## Summary of observed behavior

bad-dbms does not apply projection aliases. Result rows are always keyed by the underlying column name regardless of the key given in the `select({ alias: column })` object. Accessing the result by the intended alias returns `undefined`.

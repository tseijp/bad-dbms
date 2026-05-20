# Issue: select1.test.ts — bare select leaks internal key and corrupts text columns

Test file: `test/select/select1.test.ts`
Run: `npx vitest run --no-coverage test/select/select1.test.ts`
Result: 21 tests, 9 passed, 12 failed.

## Observed failure 1: `__rid` key leaks into bare select rows

Operation: `db.select().from(users)` after seeding users.

- Test "returns rows carrying exactly the three declared columns": expected row keys `['id', 'name', 'score']`, observed `['__rid', 'id', 'name', 'score']`.
- Test "does not leak an internal rid key into a bare select row": expected `'__rid' in row` to be `false`, observed `true`.
- Tests "returns row N with its exact seeded values" (rows 0, 1, 2): each returned row carries an extra `__rid` property whose value is a two-element array (e.g. `[0, 0]`, `[0, 1]`, `[0, 2]`), instead of being absent.
- Test "reads all five event rows back with every column present": expected keys `['id', 'kind', 'v']`, observed `['__rid', 'id', 'kind', 'v']`.

Observed: every bare `select()` row includes an internal `__rid` key that the QA test expects not to be exposed.

## Observed failure 2: text column values returned as numeric 0

Operation: seed a table with text-valued column `label` (values `alpha`, `beta`, `gamma`), then `db.select().from(items)`.

- Test "round-trips a text column value through a bare select": expected `['alpha', 'beta', 'gamma']`, observed `[0, 0, 0]`.
- Tests "reads the text label of row N as the string ...": expected the seeded string, observed `0`.
- Test "keeps a text label a string, not a numeric code": expected `typeof label === 'string'`, observed `'number'`.
- Test "returns a row with the text column beside its integer columns": expected `{ id: 1, label: 'solo', qty: 99 }`, observed `{ __rid: [0,0], id: 1, label: 0, qty: 99 }`.

Observed: text/string column values are not retained through a bare select; they come back as the number `0`.

## Summary of observed behavior

- bad-dbms exposes an internal `__rid` field on bare-select result rows.
- bad-dbms does not preserve string column values on read; they are returned as `0`.

# Issue: select3.test.ts — query isolation issues on one connection

Test file: `test/select/select3.test.ts`
Run: `npx vitest run --no-coverage test/select/select3.test.ts`
Result: 14 tests, 8 passed, 6 failed.

## Observed failure 1: bare select leaks `__rid` key

Operations involving `db.select().from(users)` interleaved with projected reads on the same db.

- Test "keeps a narrow then wide read independent with no projection leak": bare-select keys expected `['id', 'name', 'score']`, observed `['__rid', 'id', 'name', 'score']`.
- Test "keeps a wide then narrow read independent": same — bare-select keys include extra `__rid`.
- Test "runs a projection, a bare read, and another projection in sequence cleanly": bare-read keys include extra `__rid`.
- Test "reads a fresh full result after an expression projection on the same db": expected row `{ id: 1, name: 11, score: 10 }`, observed `{ __rid: [0,0], id: 1, name: 11, score: 10 }`.

Observed: bare `select()` rows include an internal `__rid` key.

## Observed failure 2: aliased projection key not applied

Operation: `db.select({ point: users.score }).from(users)` then `db.select({ score: users.score }).from(users)`.

- Test "keeps two differently-aliased projections from interfering": expected `[['point'], ['score']]`, observed `[['score'], ['score']]`.

Observed: the alias `point` is not applied to the first projection's result key; the column name `score` appears instead.

## Observed failure 3: text column values returned as numeric 0

Operation: `db.select({ label: items.label, ... }).from(items)` over a table seeded with text labels.

- Test "keeps an integer table and a text table independent on one connection": expected `['alpha', 'beta', 'gamma']`, observed `[0, 0, 0]`.

Observed: projected string column values are returned as the number `0`.

## Summary of observed behavior

- bare-select rows expose an internal `__rid` key.
- projection aliases are not honored — the result is keyed by the source column name.
- string column values are not preserved on read; they read as `0`.

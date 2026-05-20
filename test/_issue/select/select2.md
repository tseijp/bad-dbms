# Issue: select2.test.ts — column-subset projection issues

Test file: `test/select/select2.test.ts`
Run: `npx vitest run --no-coverage test/select/select2.test.ts`
Result: 24 tests, 21 passed, 3 failed.

## Observed failure 1: bare select inflates key count

Operation: `const wide = await db.select().from(users)` then `const narrow = await db.select({ id: users.id }).from(users)`.

- Test "lets a user widen then narrow a projection across two reads": expected `[keysOf(wide).length, keysOf(narrow).length]` to equal `[3, 1]`, observed `[4, 1]`.

Observed: a bare `select()` row has 4 keys where 3 declared columns are expected (one extra key present).

## Observed failure 2: text column values returned as numeric 0 in a projection

Operation: seed text column `label` (values `alpha`, `beta`, `gamma`), then `db.select({ label: items.label }).from(items)`.

- Test "projects a text column and keeps its string value": expected `['alpha', 'beta', 'gamma']`, observed `[0, 0, 0]`.
- Test "projects a text column beside an integer column with exact values": expected `{ label: 'beta', qty: 20 }`, observed `{ label: 0, qty: 20 }`.

Observed: projecting a string column returns the number `0` instead of the seeded string value.

## Summary of observed behavior

- bare-select rows carry an extra unexpected key.
- string column values are not preserved through a column-subset projection; they read as `0`.

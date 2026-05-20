# Issue: delete/text-predicate — text predicates on a string column do not match

Test file: `test/delete/text-predicate.test.ts`
Result: 3 failed / 3 total

## Summary

`eq` against a string literal and `like` with a pattern do not select rows for deletion;
string column values are also not read back as their original strings.

## Observed failures

### deleting by an exact name removes the row carrying that string
- Seed includes a row with `name = 'bob'`.
- Action: `db.delete(t).where(eq(t.name, 'bob'))`, then read `t`.
- Expected remaining ids: `[1, 3]`
- Observed remaining ids: `[1, 2, 3]` — the `bob` row was not deleted.

### deleting by a LIKE prefix removes every row whose name matches the pattern
- Seed: names alice, bob, amir.
- Action: delete `where(like(t.name, 'a%'))`, then read `t`.
- Expected remaining ids: `[2]` (only bob survives)
- Observed remaining ids: `[1, 2, 3]` — `like` matched nothing.

### a text delete reads the surviving names back as their original strings
- Action: read `t`, find row with `id === 2`.
- Expected `survivor.name` to be `'bob'`.
- Observed `survivor.name` is `0`.

## Observed capability gaps

1. `eq(column, 'string')` as a delete predicate matches no rows.
2. `like(column, pattern)` as a delete predicate matches no rows.
3. A string column value is read back as `0` rather than the seeded string.

# Issue: delete/re-delete — delete/update return shape and empty SUM value

Test file: `test/delete/re-delete.test.ts`
Result: 3 failed / 2 passed / 5 total

## Passing

- a deleted row never reappears after unrelated writes to the table
- inArray drives a delete that removes exactly the listed ids

## Observed failures

### deleting the same row twice removes it once and then matches nothing
- Action: delete id 2, then `const second = await db.delete(t).where(eq(t.id, 2))`.
- Expected `second` to match `{ rowCount: 0 }`.
- Observed `second` is `[{ deleted: 0 }]` — an array, with key `deleted` instead of `rowCount`.

### updating a row that was already deleted changes nothing
- Action: delete id 1, then `db.update(t).set({ score: 999 }).where(eq(t.id, 1))`.
- Expected result to match `{ rowCount: 0 }`.
- Observed result is `[{ updated: 0 }]` — an array, with key `updated` instead of `rowCount`.

### an empty SUM over a fully deleted table is null, not zero
- Action: `db.delete(t)` (delete all), then `db.select({ s: sum(t.score) }).from(t)`.
- Expected `result[0].s` to be `null` (SQL: SUM of no rows is NULL).
- Observed `result[0].s` is `0`.

## Observed capability gaps

1. `db.delete(...)` and `db.update(...)` return an array (`[{ deleted: n }]` /
   `[{ updated: n }]`) rather than an object exposing a `rowCount` property.
2. `sum()` over an empty (fully deleted) table returns `0` instead of `null`.

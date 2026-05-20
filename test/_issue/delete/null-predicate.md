# Issue: delete/null-predicate — NULL predicates select the wrong rows for deletion

Test file: `test/delete/null-predicate.test.ts`
Result: 3 failed / 3 total

## Summary

`isNull`, `isNotNull` and `eq(col, 0)` predicates on a nullable column do not match
rows the way SQL NULL semantics require when used as a delete `where` clause.

## Observed failures

### deleting rows whose nullable column is null removes exactly those rows
- Action: `db.delete(t).where(isNull(t.tag))`, then read `t`.
- Expected remaining ids: `[1, 3]`
- Observed remaining ids: `[1, 2, 3, 4]` — `isNull` deleted nothing.

### deleting rows whose nullable column is not null keeps the null rows
- Action: `db.delete(t).where(isNotNull(t.tag))`, then read `t`.
- Expected remaining ids: `[2, 4]`
- Observed remaining ids: `[]` — `isNotNull` deleted every row.

### a null-valued column is not equal to zero, so an eq-zero delete spares it
- Action: `db.delete(t).where(eq(t.tag, 0))`, then read `t`.
- Expected remaining ids: `[1, 2, 3, 4]` (NULL never equals 0; nothing deleted)
- Observed remaining ids: `[1, 3]` — rows with a NULL `tag` were deleted by `eq(t.tag, 0)`.

## Observed capability gap

- `isNull` as a delete predicate matches no rows.
- `isNotNull` as a delete predicate matches every row.
- `eq(col, 0)` matches rows whose column value is NULL.

In all three cases the rows actually removed differ from those required by SQL NULL
semantics.

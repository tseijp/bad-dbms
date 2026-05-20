# Issue: delete/return-value — delete return value has wrong shape

Test file: `test/delete/return-value.test.ts`
Result: 5 failed / 1 passed / 6 total

## Summary

`db.delete(...)` returns an array `[{ deleted: n }]` rather than an object exposing a
`rowCount` property. The removed-row count is reported, but under the wrong shape/key.

## Observed failures

### deleting one id reports a rowCount of the rows removed
- Action: `db.delete(t).where(pred(t))` matching 1 row.
- Expected to match `{ rowCount: 1 }`.
- Observed: `[{ deleted: 1 }]`

### deleting a low-score range reports a rowCount of the rows removed
- Action: delete matching 2 rows.
- Expected to match `{ rowCount: 2 }`.
- Observed: `[{ deleted: 2 }]`

### deleting every row reports a rowCount of the rows removed
- Action: delete matching 3 rows.
- Expected to match `{ rowCount: 3 }`.
- Observed: `[{ deleted: 3 }]`

### deleting no row reports a rowCount of the rows removed
- Action: delete matching 0 rows.
- Expected to match `{ rowCount: 0 }`.
- Observed: `[{ deleted: 0 }]`

### a no-where delete reports every row as removed
- Action: `db.delete(t)` (no where), table has 3 rows.
- Expected to match `{ rowCount: 3 }`.
- Observed: `[{ deleted: 3 }]`

## Observed capability gap

The delete return value is an array containing a single object with a `deleted` key.
The numeric count of removed rows is correct in every observed case, but it is not
exposed as `rowCount` on an object as expected.

## Note

One test in this file passes; the count value itself is consistently accurate.

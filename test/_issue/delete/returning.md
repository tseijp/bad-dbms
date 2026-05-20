# Issue: delete/returning — `.returning()` is not available on delete

Test file: `test/delete/returning.test.ts`
Result: 5 failed / 5 total

## Summary

Chaining `.returning()` on a delete throws a `TypeError`; the method does not exist
on the delete builder.

## Observed failures

All 5 tests fail with the same class of error.

### returning gives back the deleted row as a full object
- Action: `await db.delete(t).where(eq(t.id, 2)).returning()`
- Observed: `TypeError: db.delete(...).where(...).returning is not a function`

### returning a multi-row delete yields one object per removed row
- Action: `await db.delete(t).where(lt(t.score, ...)).returning()`
- Observed: `TypeError: db.delete(...).where(...).returning is not a function`

### returning on a delete that matched nothing yields an empty array
- Action: `await db.delete(t).where(eq(t.id, 999)).returning()`
- Observed: `TypeError: db.delete(...).where(...).returning is not a function`

### a returned removed row carries every column it had before deletion
- Action: `await db.delete(t).where(eq(t.id, 3)).returning()`
- Observed: `TypeError: db.delete(...).where(...).returning is not a function`

### returning the rows of a full delete enumerates the whole table
- Action: `await db.delete(t).returning()`
- Observed: `TypeError: db.delete(...).returning is not a function`

## Observed capability gap

The delete builder (`db.delete(t)` and `db.delete(t).where(...)`) exposes no
`returning` method. Deletes cannot return the removed rows.

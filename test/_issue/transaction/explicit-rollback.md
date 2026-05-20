# Issue: explicit-rollback.test.ts

Test file: `test/transaction/explicit-rollback.test.ts`
Result: 3 failed / 0 passed (3 tests)

## Observed failures

All three tests exercise `tx.rollback()` called explicitly inside a
transaction callback. In every case, writes made before the `rollback()` call
were observed to survive after the transaction.

### `calling tx.rollback undoes an insert made earlier in the body`

Steps:
1. `tx.insert(t).values({ id: 1, amount: 100 })`
2. `tx.rollback()`
3. `db.select().from(t)`

Expected: `[]`

Actual: `[{ __rid: [0, 0], id: 1, amount: 100 }]`

Observed: the inserted row remained after `tx.rollback()`.

### `calling tx.rollback undoes an update made earlier in the body`

Steps (table seeded with amounts `[10, 20, 30]`):
1. `tx.update(t).set({ amount: 0 }).where(eq(t.id, 1))`
2. `tx.rollback()`
3. read amounts by id

Expected: `[10, 20, 30]`

Actual: `[0, 20, 30]`

Observed: the update to id 1 remained after `tx.rollback()`.

### `a transaction that rolls back explicitly leaves the row count unchanged`

Steps (table seeded with 3 rows):
1. `tx.delete(t).where(gt(t.id, 0))`
2. `tx.rollback()`
3. count rows

Expected: `3`

Actual: `0`

Observed: the delete remained after `tx.rollback()`; all rows were gone.

## Summary

Across insert, update, and delete, `tx.rollback()` is observed to have no
undo effect — writes performed before the call persist in the table.

# Issue: read-your-writes.test.ts

Test file: `test/transaction/read-your-writes.test.ts`
Result: 1 failed / 4 passed (5 tests)

## Observed failure

### `a write inside a rolled-back transaction is not visible to reads after it`

Steps (table seeded with 3 rows):
1. First transaction inserts `{ id: 9, amount: 90 }` then `throw new Error('abort')`
   (error swallowed via `.catch`).
2. `db.select().from(t).where(eq(t.id, 9))`

Expected: `[]`

Actual: `[{ __rid: [0, 3], id: 9, amount: 90 }]`

Observed: the row inserted inside the transaction whose callback threw remained
visible after the transaction; the aborted write was not undone.

## Notes

The other 4 tests pass — they verify read-your-writes within a transaction
that commits successfully (count after insert, select after update, select
after delete, two writes then a read). The failure is specific to a write made
in a transaction that aborts.

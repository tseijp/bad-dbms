# Issue: delete/transaction — delete is not rolled back when transaction body throws

Test file: `test/delete/transaction.test.ts`
Result: 1 failed / 4 passed / 5 total

## Passing

- a transactional delete removes the targeted row
- a per-row tick deletes every visited row whose score clears a cutoff
- a transactional delete is visible to a read inside the same transaction
- a between-driven delete inside a transaction removes the matched band

## Observed failure

### a delete is rolled back when its transaction body throws
- Action:
  ```
  db.transaction(async (tx) => {
      await tx.delete(t).where(eq(t.id, 2))
      throw new Error('abort')
  })
  ```
  the rejected promise is caught, then `db.select().from(t)`.
- Expected remaining ids: `[1, 2, 3]` (the throw must undo the delete).
- Observed remaining ids: `[1, 3]` — row 2 stays deleted.

## Observed capability gap

When a transaction body throws after a delete, the delete is not rolled back. The
removed row remains absent after the transaction fails. Deletes inside transactions
that complete normally do commit and are visible (the other 4 tests pass).

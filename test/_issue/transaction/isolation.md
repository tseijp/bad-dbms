# Issue: isolation.test.ts

Test file: `test/transaction/isolation.test.ts`
Result: 1 failed / 3 passed (4 tests)

## Observed failure

### `a rolled-back transaction leaves the connection usable for the next one`

Steps:
1. First transaction inserts `{ id: 1, amount: 10 }` then `throw new Error('abort')`
   (error swallowed via `.catch`).
2. Second transaction inserts `{ id: 2, amount: 20 }` and resolves normally.
3. `db.select().from(t)`, then `idsOf(rows)`.

Expected: `[2]` (only the committed second transaction's row survives)

Actual: `[1, 2]`

Observed: the row inserted by the first transaction, whose callback threw,
remained in the table alongside the second transaction's committed row. The
aborted transaction's write was not undone.

## Notes

The other 3 tests in this file pass (sequential composition on one connection,
a second transaction seeing the first's committed writes, and isolation
between two separate connections).

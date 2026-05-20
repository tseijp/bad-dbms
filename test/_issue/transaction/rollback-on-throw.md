# Issue: rollback-on-throw.test.ts

Test file: `test/transaction/rollback-on-throw.test.ts`
Result: 6 failed / 1 passed (7 tests)

## Context

These tests assert the ACID guarantee: when a transaction callback throws, the
transaction aborts and none of its writes survive. The table must read back
exactly as it was before the transaction.

## Observed failures

### `an insert is undone when the transaction body throws after it`

Steps: `tx.insert(t).values({ id: 1, amount: 100 })`, then `throw`.

Expected: `[]`

Actual: `[{ __rid: [0, 0], id: 1, amount: 100 }]`

Observed: the inserted row survived the throwing transaction.

### `an update is undone when the transaction body throws after it`

Steps (seeded amounts `[10, 20, 30]`): `tx.update(t).set({ amount: 999 }).where(eq(t.id, 1))`, then `throw`.

Expected: `[10, 20, 30]`

Actual: `[999, 20, 30]`

Observed: the update to id 1 survived the throwing transaction.

### `a delete is undone when the transaction body throws after it`

Steps (seeded 3 rows): `tx.delete(t).where(eq(t.id, 2))`, then `throw`.

Expected ids: `[1, 2, 3]`

Observed: the delete of id 2 survived the throwing transaction (id 2 missing
from the result).

### `an earlier write is rolled back when a later statement throws`

Steps (seeded amounts `[10, 20, 30]`):
`tx.insert(t).values({ id: 9, amount: 90 })`, then
`tx.update(t).set({ amount: 0 }).where(eq(t.id, 1))`, then `throw`.

Expected amounts: `[10, 20, 30]`

Actual amounts: `[0, 20, 30, 90]`

Observed: both writes survived — id 1 stayed at `0` and id 9 (amount 90)
remained inserted.

### `a transaction that throws leaves the row count unchanged`

Steps (seeded 3 rows): two inserts (`id 4`, `id 5`), then `throw`.

Expected count: `3`

Actual count: `5`

Observed: both inserts survived the throwing transaction.

### `a committed transaction after a rolled-back one starts from the pre-abort state`

Steps (seeded ids `[1, 2, 3]`):
1. First transaction inserts `{ id: 9, amount: 90 }` then `throw` (swallowed).
2. Second transaction inserts `{ id: 4, amount: 40 }` and commits.
3. `idsOf(db.select().from(t))`

Expected: `[1, 2, 3, 4]`

Actual: `[1, 2, 3, 4, 9]`

Observed: id 9 from the aborted first transaction remained, alongside the
committed id 4.

## Summary

Across insert, update, and delete, a transaction whose callback throws does not
roll back its writes — every write performed before the throw persists in the
table. The only passing test in this file is the one that asserts the thrown
error propagates out of `db.transaction` (error propagation works; rollback
does not).

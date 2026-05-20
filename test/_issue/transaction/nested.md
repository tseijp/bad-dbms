# Issue: nested.test.ts

Test file: `test/transaction/nested.test.ts`
Result: 3 failed / 1 passed (4 tests)

## Observed failures

All three failing tests attempt to open a nested transaction by calling
`tx.transaction(...)` on the transaction handle passed into an outer
`db.transaction` callback.

### `an inner transaction commits as part of the outer transaction`

Steps: inside `db.transaction((tx) => ...)`, call `tx.transaction(async (inner) => ...)`.

Observed error: `TypeError: tx.transaction is not a function`
(thrown at `nested.test.ts:12`).

### `an inner rollback undoes only the inner write, not the outer one`

Steps: inside the outer transaction callback, call `tx.transaction(...)`.

Observed error: `TypeError: tx.transaction is not a function`
(thrown at `nested.test.ts:25`).

### `a nested transaction returns its callbacks value to the outer body`

Steps: inside `db.transaction((tx) => ...)`, `return tx.transaction(async () => 7)`.

Observed error: `TypeError: tx.transaction is not a function`
(reported through `src/interface/database.ts:281` / `285`, surfaced at
`nested.test.ts:54`).

## Summary

The transaction handle passed into a `db.transaction` callback does not expose
a callable `transaction` method, so nested transactions / savepoints cannot be
opened. `tx.transaction` is observed to be `undefined`.

## Notes

The 4th test (`an outer rollback undoes the inner committed write as well`)
passes — but note its inner call would also reach `tx.transaction`; it passes
because its assertion (`rows` equals `[]`) is satisfied regardless of whether
the inner call ran.

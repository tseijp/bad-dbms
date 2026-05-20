# Issue: commit.test.ts

Test file: `test/transaction/commit.test.ts`
Result: 1 failed / 10 passed (11 tests)

## Observed failure

### `a single insert inside a transaction is visible afterward`

Steps observed:
1. `db.transaction(async (tx) => { await tx.insert(t).values({ id: 1, amount: 100 }) })`
2. `await db.select().from(t)`

Expected: `[{ id: 1, amount: 100 }]`

Actual: `[{ __rid: [0, 0], id: 1, amount: 100 }]`

Observed behavior: a row read back after a committed transaction carries an
extra `__rid` property (`[0, 0]`) that is not part of the inserted shape. The
committed values themselves (`id`, `amount`) are correct.

## Notes

The remaining 10 tests in this file pass. Tests that assert via `idsOf`,
`amountsById`, `rows.length`, or `.find(...)` are unaffected because they do
not compare the full row object; only the strict full-object `toEqual` here
surfaces the extra `__rid` field.

# insert/transaction — observed failures

Run: `npx vitest run --no-coverage test/insert/transaction.test.ts`
Result: 12 tests, 1 failed, 11 passed.

## summary

- After inserts performed inside a per-row transaction runner, `db.select({ n: count() }).from(table)` returns a result whose `.n` property is `undefined`.

## failures

### per-row tick transaction count matches the user count
- 操作: run a per-row tick transaction runner that inserts users, then `db.select({ n: count() }).from(db.tables....)`.
- 期待: `r.n` is `3`.
- 観測: `r.n` is `undefined`.

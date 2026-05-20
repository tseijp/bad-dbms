# insert/seed-helpers — observed failures

Run: `npx vitest run --no-coverage test/insert/seed-helpers.test.ts`
Result: 7 tests, 2 failed, 5 passed.

## summary

- After `seedUsersPosts()` seeds a shared connection, `db.select({ n: count() }).from(table)` returns a result whose `.n` property is `undefined`.

## failures

### seedUsersPosts shares one connection with both tables seeded
- 操作: `const { db, users } = await seedUsersPosts()`, then `db.select({ n: count() }).from(users)`.
- 期待: `u.n` is `3`.
- 観測: `u.n` is `undefined`.

### seedUsersPosts seeds posts on the same connection
- 操作: `const { db, posts } = await seedUsersPosts()`, then `db.select({ n: count() }).from(posts)`.
- 期待: `p.n` is `4`.
- 観測: `p.n` is `undefined`.

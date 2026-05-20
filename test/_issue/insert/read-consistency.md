# insert/read-consistency — observed failures

Run: `npx vitest run --no-coverage test/insert/read-consistency.test.ts`
Result: 21 tests, 8 failed, 13 passed.

## summary

- `db.select({ n: count() }).from(table)` returns a result whose `.n` property is `undefined` in every observed case.

## failures

### count aggregate after USERS_SEED equals 3
- 操作: `db.insert(users).values(USERS_SEED)`, then `db.select({ n: count() }).from(users)`.
- 期待: `r.n` is `3`.
- 観測: `r.n` is `undefined`.

### count aggregate after inserting 0 / 1 / 3 / 7 / 15 rows
- 操作: insert `n` rows into `users`, then `db.select({ n: count() }).from(users)`.
- 期待: `r.n` is `n` (0, 1, 3, 7, 15 respectively).
- 観測: `r.n` is `undefined` for every `n`.

### inserting into one table leaves the sibling count at 0
- 操作: `db.insert(users).values(USERS_SEED)`, then `db.select({ n: count() }).from(posts)`.
- 期待: `r.n` is `0`.
- 観測: `r.n` is `undefined`.

### inserting into both tables reads the second table count
- 操作: insert into `users` and `posts`, then `db.select({ n: count() }).from(posts)`.
- 期待: `r.n` is `4`.
- 観測: `r.n` is `undefined`.

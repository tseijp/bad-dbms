# insert/column-omission — observed failures

Run: `npx vitest run --no-coverage test/insert/column-omission.test.ts`
Result: 9 tests, 6 failed, 3 passed.

## summary

- An insert that omits a `notNull` column is not rejected; it succeeds.
- Columns omitted from an inserted row are read back as `0` rather than `null`.

## failures

### omitting a notNull column rejects the insert
- 操作: `db.insert(users).values({ id: 1, score: 1 })` omitting a `notNull` column.
- 期待: the insert promise rejects.
- 観測: the promise resolved with `{ rowCount: 1 }` (no rejection).

### omitting posts.userId reads back null
- 操作: `db.insert(posts).values({ id: 1, score: 5 })` omitting `userId`, then `db.select().from(posts)`.
- 期待: `rows[0].user_id` is `null`.
- 観測: `rows[0].user_id` is `0`.

### omitting a no-default events column reads back null
- 操作: `db.insert(events).values({ id: 1, kind: 3 })` omitting `v`, then `db.select().from(events)`.
- 期待: `rows[0].v` is `null`.
- 観測: `rows[0].v` is `0`.

### omitting two no-default events columns reads both back null
- 操作: `db.insert(events).values({ id: 1 })` omitting `kind` and `v`, then `db.select().from(events)`.
- 期待: `rows[0]` matches `{ id: 1, kind: null, v: null }`.
- 観測: `rows[0]` has `kind: 0` and `v: 0`.

### events kind omitted reads the omitted column back as null
- 操作: insert an events row omitting `kind`, then `db.select().from(events)`.
- 期待: `rows[0].kind` is `null`.
- 観測: `rows[0].kind` is `0`.

### events v omitted reads the omitted column back as null
- 操作: insert an events row omitting `v`, then `db.select().from(events)`.
- 期待: `rows[0].v` is `null`.
- 観測: `rows[0].v` is `0`.

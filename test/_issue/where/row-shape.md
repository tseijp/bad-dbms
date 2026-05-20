# where / row-shape

Test file: `test/where/row-shape.test.ts`
Result: 2 failed / 3 passed (5 total)

## Summary

Rows returned from a filtered `select` carry an extra `__rid` key, and a post
row's `user_id` column reads back as `0`.

## Observed failures

### 1. `a filtered post row keeps its userId and score untouched alongside its id` (line 23)

- Operation: `db.select().from(posts).where(eq(posts.id, 3))`
- Expected `rows[0]` to match `{ id: 3, user_id: 2, score: 9 }`
- Actual: `{ __rid: [0, 2], id: 3, score: 9, user_id: 0 }`
  - `user_id` is `0` instead of `2`.
  - row carries an extra `__rid` key.

### 2. `filtering changes which rows return but leaves every returned row the same shape` (line 29)

- Operation: `db.select().from(users).where(gt(users.score, 15))`
- Expected each row's sorted key set: `'id,name,score'`
- Actual: `'__rid,id,name,score'` — every returned row carries an extra `__rid`
  key.

## Observed behavior

- Filtered rows include an internal `__rid` property (an array, e.g. `[0, 2]`)
  in the returned object, so the row shape differs from the declared columns.
- The `user_id` column of a filtered post row is returned as `0` rather than
  its stored value `2`.

## Passing tests

3 tests pass: isolating one user by id with all three columns, a multi-row
score filter keeping each original score, and a filtered-vs-unfiltered read
agreeing on a shared row.

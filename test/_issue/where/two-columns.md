# where / two-columns

Test file: `test/where/two-columns.test.ts`
Result: 1 failed / 5 passed (6 total)

## Summary

An equality predicate comparing two columns of the same row (`eq(posts.userId,
posts.id)`) does not match the row where the two columns are equal.

## Observed failure

### `finding the post a user authored under their own id isolates the self-owned row` (line 23)

- Seed: `seedPosts()` — posts with (score/id/userId): 5/1/1, 7/2/1, 9/3/2,
  4/4/3.
- Operation: `db.select().from(posts).where(eq(posts.userId, posts.id))`
- Expected: `[1]` — post 1 has `id === userId === 1`.
- Actual: `[]` — no row is returned.

## Observed behavior

`eq` over two columns of the same row does not identify post 1, whose `id` and
`userId` are both `1`. The result is empty where one matching row was expected.

Note: a related test in the same file (`gt(posts.score, posts.id)`) passes, so
column-to-column comparison works for `gt` on this seed; the failure is
specific to the `eq(posts.userId, posts.id)` case.

## Passing tests

5 tests pass, including `gt(posts.score, posts.id)` and its negation, and other
column-pair comparisons.

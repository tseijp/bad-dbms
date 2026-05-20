# Issue: group/groupmut.test.ts

Test run: `npx vitest run --no-coverage test/group/groupmut.test.ts`
Result: 4 passed, 1 failed (5 total)

## Failing test

### `grouping over an insert-and-mutate usecase > seeds posts, groups by owner, then re-groups after inserting a post`

- Operation: seed posts, run `db.select(...).from(posts).groupBy(posts.userId)` (`before`), insert another post, run the same grouped query again (`after`), then read `groupWith(before, 'userId', 2).n`.
- Expected: a group row for `userId === 2` exists in the `before` result with a `.n` count.
- Observed: `TypeError: Cannot read properties of undefined (reading 'n')` at groupmut.test.ts:25.
  - `groupWith(before, 'userId', 2)` returned `undefined` — no result row could be located by the integer group-key value `2`.

## Observed behavior

A grouped query result cannot be addressed by its integer group-key value, so the
re-group-after-insert usecase cannot be observed end to end.

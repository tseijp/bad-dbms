# Issue: group/count.test.ts

Test run: `npx vitest run --no-coverage test/group/count.test.ts`
Result: 12 passed, 4 failed (16 total)

## Failing tests

### `per-group count > counts the posts owned by userId 1 as 2`
### `per-group count > counts the posts owned by userId 2 as 1`
### `per-group count > counts the posts owned by userId 3 as 1`

- Operation: `db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)`, then `groupWith(result, 'userId', userId).n`.
- Expected: a group row exists for each of `userId` 1/2/3, with per-group counts 2/1/1 respectively.
- Observed: `TypeError: Cannot read properties of undefined (reading 'n')` at count.test.ts:47.
  - `groupWith(result, 'userId', userId)` returned `undefined` for all three group keys — no result row could be located by the integer group-key value.

### `per-group count > counts distinct values inside each group`

- Operation: `db.select({ g: t.g, d: countDistinct(...) }).from(t).groupBy(t.g)`, then read `.d` for groups `g === 0` and `g === 1`.
- Expected: `[2, 1]`.
- Observed: `AssertionError: expected [ 3, 2 ] to deeply equal [ 2, 1 ]` at count.test.ts:81.
  - Distinct counts per group were reported as 3 and 2 instead of 2 and 1.

## Observed behavior

Grouped `count()` result rows cannot be located by their integer group-key value. Where a row is found, `countDistinct` over-counts per group (does not deduplicate values within the group).

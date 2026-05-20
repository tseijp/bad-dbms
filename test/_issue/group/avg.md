# Issue: group/avg.test.ts

Test run: `npx vitest run --no-coverage test/group/avg.test.ts`
Result: 18 passed, 1 failed (19 total)

## Failing test

### `per-group avg > averages each post group score independently`

- Operation: `db.select({ userId: posts.userId, a: avg(posts.score) }).from(posts).groupBy(posts.userId)`, then look up the group row with `groupWith(result, 'userId', 1)` and read `.a`.
- Expected: the group row for `userId === 1` exists and `.a` equals `6`.
- Observed: `TypeError: Cannot read properties of undefined (reading 'a')` at avg.test.ts:40.
  - `groupWith(result, 'userId', 1)` returned `undefined`, i.e. the result array contains no row whose `userId` column equals the JS number `1`.

## Observed behavior

For this grouped `avg` query, the DBMS does not produce a result row that can be located by the integer group-key value `1`. The 18 other `avg` cases in this file pass.

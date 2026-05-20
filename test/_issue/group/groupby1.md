# Issue: group/groupby1.test.ts

Test run: `npx vitest run --no-coverage test/group/groupby1.test.ts`
Result: 53 passed, 16 failed (69 total)

## Failing tests

All 16 failures share one observed behavior: `groupBy` does not collapse rows to one
row per distinct key — it returns every input row instead.

### `groupBy produces one row per distinct key > buckets the four posts into three userId groups`

- Operation: `db.select({ user_id: posts.userId, n: count() }).from(posts).groupBy(posts.userId)` over 4 posts spanning 3 distinct userIds.
- Expected: 3 rows (one per distinct userId).
- Observed: `expected [ { user_id: +0, n: 4 } ] to have a length of 3 but got 1` — a single row with `n: 4`.

### `groupBy produces one row per distinct key > collapses an aggregate-free projection down to the distinct keys`
### `groupBy produces one row per distinct key > returns the distinct keys of an aggregate-free grouped read`

- Operation: aggregate-free grouped read, e.g. `db.select({ g: t.g }).from(t).groupBy(t.g)`.
- Expected: distinct keys only — e.g. `[1, 2, 3]`.
- Observed: every input row returned — e.g. `expected [ 1, 1, 2, 3, 3, 3 ] to deeply equal [ 1, 2, 3 ]`; `expected [ Array(6) ] to have a length of 3 but got 6`.

### `collapses ... to its distinct keys (aggregate-free proj)` (13 cases)

Cases: two same, three same, pair plus single, two pairs, skewed quad, five into two,
five into three, six into two, six into three, scattered six, eight into four,
negatives as keys, zero among positives.

- Operation: `db.select({ g: t.g }).from(t).groupBy(t.g)` over various key multisets.
- Expected: result length equals the number of distinct keys.
- Observed in every case: result length equals the number of input rows. Examples:
  - two same: `expected [ { g: +0 }, { g: +0 } ] to have a length of 1 but got 2`
  - three same: `... length of 1 but got 3`
  - two pairs: `... length of 2 but got 4`
  - eight into four: `... length of 4 but got 8`
  - negatives as keys: `... length of 3 but got 4`

## Observed behavior

`groupBy` does not deduplicate by group key. An aggregate-free grouped projection
returns one row per input row rather than one row per distinct key. When an
aggregate (`count()`) is present, the count is computed but the rows are not split
per key (one merged row observed for a multi-key input).

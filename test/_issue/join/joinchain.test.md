# Issue: joinchain.test.ts — chained joins fail; `innerJoin`/`leftJoin` not implemented

## Test run summary

- Command: `npx vitest run --no-coverage test/join/joinchain.test.ts`
- Result: **20 failed / 20 total** (0 pass)

## Observed behavior

Every test chains multiple joins across three tables (users / posts / tags).
The chain starts with a join helper that invokes `b.innerJoin(...)` or
`b.leftJoin(...)` on the builder returned by `db.select(...).from(...)`.

All 20 cases throw at the first join in the chain:

```
TypeError: b.innerJoin is not a function
  at innerJoin test/join/helpers.ts:18:61
```

and, for the doubled-leftJoin scenario:

```
TypeError: b.leftJoin is not a function
  at leftJoin test/join/helpers.ts:19:60
```

## What is observed as not working

The select builder exposes no `innerJoin` or `leftJoin` method, so a
multi-table join chain cannot even begin. The chaining behavior
(users -> posts -> tags), filtering on the third table, grouping a
three-table chain, and re-counting after inserts cannot be exercised.

No scenario reaches an assertion.

## Affected scenarios (all 20)

- "chains users-posts-tags" for tag tables: no tags, one tag,
  one tag missing post, one tag per post, two tags on one post,
  three tags on one post, mixed hit and miss, all tags miss
- "seeds three tables, chains the joins, adds a tag, then re-counts"
- "filters a chained join on the third table column"
- "groups a three-table chain by user to count tags per user"
- "keeps every left user through a doubled chained leftJoin"
- and the remaining chained-join scenarios in the file

## Expected vs actual

- Expected: `db.select(...).from(...).innerJoin(t2, on).innerJoin(t3, on)`
  (and the leftJoin variant) resolve to arrays of joined rows across three
  tables.
- Actual: `TypeError: b.innerJoin is not a function` /
  `b.leftJoin is not a function`.

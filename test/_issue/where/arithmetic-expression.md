# where / arithmetic-expression

Test file: `test/where/arithmetic-expression.test.ts`
Result: 4 failed / 8 passed (12 total)

## Summary

When an arithmetic expression in a `where` predicate touches a NULL column
value, bad-dbms keeps the row whose operand is NULL. The expected SQL behavior
is that the NULL operand makes the whole expression NULL and the comparison
UNKNOWN, so the row drops out.

All four failures use this seed:

```ts
table('calc', { id: integer('id').primaryKey(), score: integer('score') })
insert([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
```

Row id 2 is inserted without a `score`.

## Observed failures

### 1. `adding a constant to a null column yields null, so the comparison drops the row` (line 89)

- Operation: `db.select().from(t).where(gt(t.score.add(5), 0))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 (NULL score) is kept.

### 2. `multiplying a null column by zero still yields null, not zero` (line 96)

- Operation: `db.select().from(t).where(eq(t.score.mul(0), 0))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 is kept (NULL * 0 evaluated as matching 0).

### 3. `a between over a null-bearing arithmetic expression drops the null row` (line 103)

- Operation: `db.select().from(t).where(between(t.score.add(1), 0, 1000))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 is kept.

### 4. `a less-than over a null arithmetic result excludes the null row rather than counting it as zero` (line 109)

- Operation: `db.select().from(t).where(lt(t.score.sub(100), 0))`
- Expected: `[1, 3]`
- Actual: `[1, 2, 3]` — id 2 is kept.

## Observed behavior

A NULL column participating in `.add` / `.sub` / `.mul` arithmetic inside a
`where` predicate is treated as the numeric value 0; the row is not excluded by
the comparison/`between` over the computed expression.

## Passing tests

The 8 arithmetic tests over fully-populated tables (no NULL operand) pass.

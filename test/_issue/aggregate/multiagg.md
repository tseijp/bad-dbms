# Issue: multiple aggregates in one projection (multiagg.test.ts)

Test file: `test/aggregate/multiagg.test.ts`
Result: 5 failed / 2 passed (7 total)

## Observed failures

### 1. `sum()`/`avg()` in a multi-aggregate projection return numbers instead of strings

- Test: "reads count, sum and avg of the user seed in one query"
- Operation: `db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)`.
- Expected: `{ n: 3, s: '60', a: '20' }`
- Actual: `{ n: 3, s: 60, a: 20 }` — `s` and `a` are numbers, not strings.

### 2. Five-aggregate projection: `sum()`/`avg()` return numbers instead of strings

- Test: "reads all five aggregates of the user seed at once"
- Operation: `db.select` of count, sum, avg, min, max over seeded users.
- Expected: `s: '60'`, `a: '20'` (strings); `lo`, `hi`, `n` numeric.
- Actual: `s: 60`, `a: 20` are numbers (`lo: 10`, `hi: 30`, `n: 3` correct).

### 3. Empty-table multi-aggregate: `sum`/`avg`/`min`/`max` do not yield `null`

- Test: "reads count, sum, avg, min, max of an empty table together"
- Operation: `numTable([])`, `db.select({ n: count(), s: sum(t.v), a: avg(t.v), lo: min(t.v), hi: max(t.v) })`.
- Expected: `{ n: 0, s: null, a: null, lo: null, hi: null }`
- Actual: `{ n: 0, s: 0, a: 0, lo: Infinity, hi: -Infinity }`.

### 4. Where-filtered multi-aggregate: `sum()` returns a number instead of a string

- Test: "reads a multi-aggregate projection of a where-filtered subset"
- Operation: `db.select({ n: count(), s: sum(users.score) }).from(users).where(gte(users.score, 20))`.
- Expected: `{ n: 2, s: '50' }`
- Actual: `{ n: 2, s: 50 }`.

### 5. Events aggregate then narrowed by where: `sum()` returns numbers instead of strings

- Test: "seeds events, reads the full aggregate row, then narrows by where"
- Operation: aggregate over all events, then aggregate the `gte(events.v, 300)` subset.
- Expected: `[{ n: 5, s: '1500' }, { n: 3, s: '1200' }]`
- Actual: `[{ n: 5, s: 1500 }, { n: 3, s: 1200 }]`.

## Summary of observed behavior

- In multi-aggregate projections, `sum()` and `avg()` yield JavaScript `number` values, while the tests expect `string`.
- Over an empty table, `sum()`/`avg()` yield `0` and `min()`/`max()` yield `Infinity`/`-Infinity`, while the tests expect `null` for all four.

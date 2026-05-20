# Issue: update — return-value

Test file: `test/update/return-value.test.ts`
Result: 12 failed / 0 passed (12 total)

## Observed failures

### Group A: update result shape (`an update resolves to a run-result carrying a changes count`)

All tests expect `db.update(t).set(...).where(...)` to resolve to a single object with a numeric `changes` field. Instead it resolves to an array of objects with an `updated` field.

- `updating one id reports a changes count of the modified rows`
  - Expected: object matching `{ changes: 1 }`.
  - Observed: `[{ updated: 1 }]`.
- `updating two ids by range reports a changes count of the modified rows`
  - Expected: `{ changes: 2 }`. Observed: `[{ updated: 2 }]`.
- `updating every row reports a changes count of the modified rows`
  - Expected: `{ changes: 3 }`. Observed: `[{ updated: 3 }]`.
- `updating no row reports a changes count of the modified rows`
  - Expected: `{ changes: 0 }`. Observed: `[{ updated: 0 }]`.
- `an update resolves to a single result object, not an array`
  - Action: `Array.isArray(result)`. Expected: `false`. Observed: `true`.
- `an update with no where clause reports every row in its changes count`
  - Action: `db.update(t).set({ score: 0 })`. Expected: `{ changes: 3 }`. Observed: `[{ updated: 3 }]`.
- `updating an empty table reports a changes count of zero`
  - Expected: `{ changes: 0 }`. Observed: `[{ updated: 0 }]`.
- `the changes count matches the rows that actually carry the new value`
  - Action: read `result.changes`. Expected: `2`. Observed: `undefined`.

### Group B: `.returning()` on update (`update with returning yields the updated rows`)

All tests call `db.update(t).set(...).where(...).returning(...)` and fail because `.returning` is not defined on the update builder chain.

- `returning gives back the updated row with its new value`
  - Observed: `TypeError: db.update(...).set(...).where(...).returning is not a function`.
- `returning a multi-row update yields one object per modified row`
  - Observed: same `TypeError`.
- `returning on an update that matched nothing yields an empty array`
  - Observed: same `TypeError`.
- `a returned row reflects the post-update value, not the old one`
  - Observed: same `TypeError`.

## Behavior observed

- An update resolves to an array of `{ updated: N }` rather than a single run-result object exposing a `changes` count.
- The update builder chain does not provide a `.returning()` method to retrieve the updated rows.

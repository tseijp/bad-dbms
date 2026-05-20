# order / multi-key — issue ticket

Test file: `test/order/multi-key.test.ts`
Result: 11 passed / 1 failed (12 total)

## Observed failure

### Test: `the non-null secondary values still order correctly around the NULL`

Setup (`seededNullableSecondary`):

- Table `partial` with columns `id` (pk), `rank`, `score`. `score` is nullable.
- Inserted rows:
  - `{ id: 1, rank: 1, score: 50 }`
  - `{ id: 2, rank: 1 }` — inserted with no `score`
  - `{ id: 3, rank: 1, score: 20 }`
  - `{ id: 4, rank: 2, score: 5 }`

Operation:

- `db.select().from(t).orderBy(asc(t.rank), asc(t.score))`
- Filter result to `rank === 1` rows.
- Collect their `score` values and drop entries that are `== null`.

Expected: `[20, 50]`
Actual: `[0, 20, 50]`

## Observed behavior

Row id 2 was inserted with no `score`. On read-back its `score` value is `0`, not `null`. Because the value is `0` (not nullish), the `s != null` filter in the test does not drop it, so the non-null score sequence contains an extra leading `0`.

Observation: a nullable column inserted without a value is returned as the number `0` rather than `null`.

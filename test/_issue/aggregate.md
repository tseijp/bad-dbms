# aggregate feature - tsc observation report

## Feature
`aggregate` (`projects/bad-dbms/test/aggregate/`)

## Target files

| # | File | Kind |
| --- | --- | --- |
| 1 | `test/aggregate/helpers.ts` | shared fixtures (not a `.test.ts`) |
| 2 | `test/aggregate/aggmut.test.ts` | test |
| 3 | `test/aggregate/avg.test.ts` | test |
| 4 | `test/aggregate/count1.test.ts` | test |
| 5 | `test/aggregate/count2.test.ts` | test |
| 6 | `test/aggregate/count3.test.ts` | test |
| 7 | `test/aggregate/distinct.test.ts` | test |
| 8 | `test/aggregate/minmax.test.ts` | test |
| 9 | `test/aggregate/multiagg.test.ts` | test |
| 10 | `test/aggregate/sum.test.ts` | test |

Total: 1 helper + 9 `.test.ts` files.

## tsc command

Executed inside `projects/bad-dbms`:

```
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "test/aggregate"
```

`tsconfig.json` uses `strict: true`, `target: ESNext`, `module: ESNext`, `moduleResolution: Bundler`.

## tsc errors

| File | Line:Col | Message |
| --- | --- | --- |
| (none) | - | - |

## Error count summary

| File | Error count |
| --- | --- |
| `test/aggregate/helpers.ts` | 0 |
| `test/aggregate/aggmut.test.ts` | 0 |
| `test/aggregate/avg.test.ts` | 0 |
| `test/aggregate/count1.test.ts` | 0 |
| `test/aggregate/count2.test.ts` | 0 |
| `test/aggregate/count3.test.ts` | 0 |
| `test/aggregate/distinct.test.ts` | 0 |
| `test/aggregate/minmax.test.ts` | 0 |
| `test/aggregate/multiagg.test.ts` | 0 |
| `test/aggregate/sum.test.ts` | 0 |
| **TOTAL** | **0** |

The full-project `tsc --noEmit -p tsconfig.json` run produced 171 output lines of errors across `test/delete`, `test/insert`, `test/join`, `test/order`, etc., but **zero** of them are sourced from `test/aggregate/`.

## Library-user representative patterns

The patterns below are quoted directly from the test files; they describe how a library user is calling the library API and how they consume the returned values.

### Pattern A: import surface

Every test imports values from the package barrel `../../src/index` and helpers from `../_helpers` plus the local `./helpers`. Representative line:

```ts
// avg.test.ts:2-4
import { avg, gte, lt } from '../../src/index'
import { seedUsers } from '../_helpers'
import { scalar, numTable } from './helpers'
```

```ts
// count1.test.ts:2-5
import { database, table, integer } from '../../src/index'
import { count, eq, gt, gte, lt, lte, ne, between } from '../../src/index'
import { seedUsers } from '../_helpers'
import { rowsOf, scalar, freshUsers, numTable } from './helpers'
```

```ts
// distinct.test.ts:2
import { count, countDistinct, sum, sumDistinct, avgDistinct } from '../../src/index'
```

Aggregate-related APIs pulled in across the feature: `count`, `countDistinct`, `sum`, `sumDistinct`, `avg`, `avgDistinct`, `min`, `max`.

Predicate-related APIs pulled in: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`.

Schema / DB-construction APIs pulled in: `database`, `table`, `integer`, `float`.

### Pattern B: building a fresh DB / table

`helpers.ts` shows the canonical builders the tests reuse:

```ts
// helpers.ts:15-27
export const freshUsers = () => {
        const users = makeUsers()
        return { users, db: database({ users }) }
}
export const numTable = async (values: number[], type: 'integer' | 'float' = 'integer') => {
        const v = type === 'float' ? float('v') : integer('v')
        const t = table('t', { id: integer('id').primaryKey(), v })
        const db = database({ t })
        const rows = values.map((value, i) => ({ id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
```

A nullable-column variant is built inline:

```ts
// count1.test.ts:119-125
const seedNullable = async (values: Array<number | null>) => {
        const t = table('t', { id: integer('id'), v: integer('v') })
        const db = database({ t })
        const rows = values.map((value, i) => (value === null ? { id: i + 1 } : { id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows as any)
        return { db, t }
}
```

Note the explicit `as any` cast on the insert payload.

### Pattern C: building an aggregate query

The library-user call site is always `db.select({ alias: aggregateFn(col) }).from(table)`, optionally chained with `.where(predicate)`. Representative call sites:

```ts
// sum.test.ts:20
const result = await db.select({ s: sum(users.score) }).from(users)
```

```ts
// avg.test.ts:41-44
const result = await db
        .select({ a: avg(users.score) })
        .from(users)
        .where(gte(users.score, 20))
```

```ts
// count1.test.ts:48
const result = await db.select({ n: count() }).from(users).where(gt(users.score, 15))
```

```ts
// count1.test.ts:43
const byCol = await db.select({ n: count(users.score) }).from(users)
```

Multi-aggregate one-shot projection:

```ts
// multiagg.test.ts:26-34
const result = await db
        .select({
                n: count(),
                s: sum(users.score),
                a: avg(users.score),
                lo: min(users.score),
                hi: max(users.score),
        })
        .from(users)
```

Distinct variants:

```ts
// distinct.test.ts:16-17
const { db, t } = await numTable([1, 1, 2, 2, 3])
const result = await db.select({ d: countDistinct(t.v) }).from(t)
```

```ts
// distinct.test.ts:66
const result = await db.select({ s: sum(t.v), sd: sumDistinct(t.v) }).from(t)
```

### Pattern D: consuming the result

Two parallel consumption styles, both encapsulated in `helpers.ts`:

```ts
// helpers.ts:9-14
export const rowsOf = (r: unknown): any[] => (Array.isArray(r) ? (r as any[]) : [])
export const aggRow = (r: unknown): any => rowsOf(r)[0]
export const scalar = (r: unknown, alias: string): unknown => {
        const row = aggRow(r)
        return row ? row[alias] : undefined
}
```

The user-level call site does not destructure on its own; it routes the awaited value through these helpers. Examples:

- Scalar read with alias:
  ```ts
  // sum.test.ts:21
  expect(scalar(result, 's')).toBe('60')
  ```
- Whole-row deep-equal:
  ```ts
  // multiagg.test.ts:17
  expect(aggRow(result)).toEqual({ n: 3, s: '60', a: '20' })
  ```
- Array-shape assertion:
  ```ts
  // count2.test.ts:12
  expect(Array.isArray(result)).toBe(true)
  ```
- Row-array length:
  ```ts
  // multiagg.test.ts:53
  expect(rowsOf(result)).toHaveLength(1)
  ```
- Index access on the row array:
  ```ts
  // count2.test.ts:27
  expect(rowsOf(result)[0]).toEqual({ n: 3 })
  ```

`scalar(result, 's')` is also fed back into typeof / Number / array assembly:

```ts
// sum.test.ts:129
expect(typeof scalar(result, 's')).toBe('string')
```

```ts
// avg.test.ts:136
expect(Number(scalar(result, 'a'))).toBeCloseTo(expected, 10)
```

```ts
// aggmut.test.ts:34
expect([scalar(one, 'n'), scalar(two, 'n'), scalar(three, 'n')]).toEqual([1, 2, 3])
```

### Pattern E: mutation-then-re-aggregate usecase

Reads are interleaved with writes; the library user calls `db.delete`, `db.update`, `db.insert` between two `db.select` aggregates and compares them:

```ts
// aggmut.test.ts:14-17
const { db, users } = await seedUsers()
await db.delete(users).where(eq(users.id, 3))
const result = await db.select({ n: count(), s: sum(users.score) }).from(users)
expect(aggRow(result)).toEqual({ n: 2, s: '30' })
```

```ts
// aggmut.test.ts:20-23
const { db, users } = await seedUsers()
await db.update(users).set({ score: 999 }).where(eq(users.id, 2))
const result = await db.select({ s: sum(users.score) }).from(users)
expect(scalar(result, 's')).toBe('1039')
```

Update via a column-expression `users.score.add(10)`:

```ts
// avg.test.ts:58-61
await db
        .update(users)
        .set({ score: users.score.add(10) })
        .where(gte(users.id, 1))
```

Predicate built off a column method `t.v.lt(20)` / `t.v.gte(threshold)`:

```ts
// minmax.test.ts:76
await db.delete(t).where(t.v.lt(20))
```

```ts
// minmax.test.ts:120
.where(t.v.gte(threshold))
```

### Pattern F: parameterised tables with `it.each`

Most tests drive dense matrices through `it.each([...])`, then call `numTable` per row:

```ts
// sum.test.ts:28-40
it.each([
        ['single positive', [7], '7'],
        ['two positives', [10, 20], '30'],
        ['negatives only', [-10, -20], '-30'],
        ['mixed signs', [-10, 5, 20], '15'],
        ['cancelling pair', [50, -50], '0'],
        ['large values', [1000000, 2000000], '3000000'],
        ['five values', [1, 2, 3, 4, 5], '15'],
])('sums the %s dataset', async (_label, values, expected) => {
        const { db, t } = await numTable(values as number[])
        const result = await db.select({ s: sum(t.v) }).from(t)
        expect(scalar(result, 's')).toBe(expected)
})
```

The `values as number[]` cast appears whenever the matrix tuple shape mixes a string label with a number array.

### Pattern G: `$count` shortcut via `(db as any)`

`count3.test.ts` reaches for a Drizzle-style shortcut that is not on the public type, so the test casts:

```ts
// count3.test.ts:11-13
const { db, users } = await seedUsers()
const n = await (db as any).$count(users)
expect(n).toBe(3)
```

```ts
// count3.test.ts:17
const n = await (db as any).$count(users, gt(users.score, 15))
```

### Pattern H: accessing tables via `db.tables.<name>`

When the test builds the DB through `freshUsers()` (no destructured `users`), the table is read off `db.tables`:

```ts
// count1.test.ts:26-27
const { db } = freshUsers()
const result = await db.select({ n: count() }).from(db.tables.users)
```

```ts
// count2.test.ts:20-22
const { db } = freshUsers()
const result = await db.select({ n: count() }).from(db.tables.users)
expect(rowsOf(result)).toHaveLength(1)
```

### Pattern I: expected return-shape contract observed

The tests pin a mixed-shape contract on the awaited value of `db.select(...).from(...)`:

- `count()` resolves to a JS `number`.
- `sum()`, `sumDistinct()`, `avg()`, `avgDistinct()` resolve to a JS `string` (decimal text), or `null` over an empty set.
- `min()`, `max()` resolve to the underlying column type (`number` here), or `null` over an empty set.
- `countDistinct()` resolves to a JS `number`.
- The whole result is an array of row objects, length 1 for group-by-less aggregates.

Examples of each:

```ts
// avg.test.ts:25
expect(scalar(result, 'a')).toBeNull()
```

```ts
// sum.test.ts:26
expect(scalar(result, 's')).toBeNull()
```

```ts
// minmax.test.ts:21
expect(scalar(result, 'lo')).toBeNull()
```

```ts
// multiagg.test.ts:40
expect(aggRow(result)).toEqual({ n: 0, s: null, a: null, lo: null, hi: null })
```

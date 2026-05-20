# schema/column-name — observed failures

Test run: `npx vitest run --no-coverage test/schema/column-name.test.ts`
Result: 38 failed / 3 passed (41 total)

## summary

Observed from column factories and `table()`:

- A column exposes no `name` property; `column.name` returns `undefined` for both explicit factory names and property-key-derived names.
- A fresh column's constraint flags are not strict booleans. `primary` and `hasDefault` read as `undefined`; `notNull` and `isUnique` read as a `function` (the chain method) rather than a boolean.

The 3 passing tests cover: two same-named integer columns are distinct objects, a two-column table declares 2 entries in `$meta.columns`, and those two column entries are distinct objects.

## failures

### keeps the explicit factory name on a integer / uint / float / text column
- 操作: `table('t', { c: <factory>('explicit') })`, then read `t.c.name`.
- 期待: `'explicit'`.
- 観測: `undefined`.

### fills the column name from the property key for an integer / uint / float / text column
- 操作: `table('t', { propKey: <factory>() })` (no explicit name), then read `t.propKey.name`.
- 期待: `'propKey'`.
- 観測: `undefined`.

### lets the explicit factory name win over the property key
- 操作: `table('t', { propKey: integer('given_name') })`, then read `t.propKey.name`.
- 期待: `'given_name'`.
- 観測: `undefined`.

### records the factory name id / name / score / user_id / created_at on the column
- 操作: `table('t', { c: integer(<name>) })`, then read `t.c.name`.
- 期待: the supplied name.
- 観測: `undefined`.

### reports a fresh integer / uint / float / text column as strictly not primary
- 操作: `table('t', { c: <factory>('c') })`, then read `t.c.primary`.
- 期待: `false`.
- 観測: `undefined`.

### reports a fresh integer / uint / float / text column as strictly not unique
- 操作: `table('t', { c: <factory>('c') })`, then read `t.c.isUnique`.
- 期待: `false`.
- 観測: a `function`.

### reports a fresh integer / uint / float / text column as strictly nullable
- 操作: `table('t', { c: <factory>('c') })`, then read `t.c.notNull`.
- 期待: `false`.
- 観測: a `function`.

### reports a fresh integer / uint / float / text column as having strictly no default
- 操作: `table('t', { c: <factory>('c') })`, then read `t.c.hasDefault`.
- 期待: `false`.
- 観測: `undefined`.

### reports the primary flag of a fresh integer / uint / float / text column as a real boolean
- 操作: `table('t', { c: <factory>('c') })`, then check `typeof t.c.primary`.
- 期待: `'boolean'`.
- 観測: `'undefined'`.

### reports the notNull flag of a fresh integer / uint / float / text column as a real boolean
- 操作: `table('t', { c: <factory>('c') })`, then check `typeof t.c.notNull`.
- 期待: `'boolean'`.
- 観測: `'function'`.

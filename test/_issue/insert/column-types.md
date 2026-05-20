# insert/column-types — observed failures

Run: `npx vitest run --no-coverage test/insert/column-types.test.ts`
Result: 36 tests, 5 failed, 31 passed.

## summary

- Values inserted into a text column are not preserved; reads return `0` instead of the inserted string.

## failures

### text column stores and reads the string "hello"
- 操作: `db.insert(t).values({ id: 1, v: 'hello' })`, then `db.select().from(t)`.
- 期待: `rows[0].v` is `'hello'`.
- 観測: `rows[0].v` is `0`.

### text column stores and reads the string "a"
- 操作: `db.insert(t).values({ id: 1, v: 'a' })`, then `db.select().from(t)`.
- 期待: `rows[0].v` is `'a'`.
- 観測: `rows[0].v` is `0`.

### text column stores and reads the string "drizzle parity"
- 操作: `db.insert(t).values({ id: 1, v: 'drizzle parity' })`, then `db.select().from(t)`.
- 期待: `rows[0].v` is `'drizzle parity'`.
- 観測: `rows[0].v` is `0`.

### text column stores and reads the string ""
- 操作: `db.insert(t).values({ id: 1, v: '' })`, then `db.select().from(t)`.
- 期待: `rows[0].v` is `''`.
- 観測: `rows[0].v` is `0`.

### text column preserves strings across a multi-row insert
- 操作: multi-row insert of text values `'first'` and `'second'`, then `db.select().from(t)`.
- 期待: `rows.map(r => r.v)` equals `['first', 'second']`.
- 観測: `rows.map(r => r.v)` equals `[0, 0]`.

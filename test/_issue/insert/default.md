# insert/default — observed failures

Run: `npx vitest run --no-coverage test/insert/default.test.ts`
Result: 13 tests, 9 failed, 4 passed.

## summary

- A column with a declared default value is read back as `0` when omitted from the insert, instead of the declared default.
- Columns populated by `$defaultFn` / `defaultFn` are read back as `0` instead of the function's value.
- When some rows of a multi-row insert omit a defaulted column and others supply an explicit value, the explicit values are not preserved.

## failures

### declared default 1 / 7 / 42 / 99 / 255 with omitted column reads back the default
- 操作: table with column `v` declared `default(d)`; `db.insert(t).values({ id: 1 })` omitting `v`, then `db.select().from(t)`.
- 期待: `rows[0].v` is `d` (1, 7, 42, 99, 255 respectively).
- 観測: `rows[0].v` is `0` for every value of `d`.

### $defaultFn returning a constant applies on omitted column
- 操作: column with `$defaultFn` returning `5`; `db.insert(t).values({ id: 1 })`, then `db.select().from(t)`.
- 期待: `rows[0].seq` is `5`.
- 観測: `rows[0].seq` is `0`.

### $defaultFn counter applies incrementing values per row
- 操作: column with `$defaultFn` counter; multi-row insert `[{ id: 1 }, { id: 2 }]`, then `db.select().from(t)`.
- 期待: `rows.map(r => r.seq)` equals `[1, 2]`.
- 観測: `rows.map(r => r.seq)` equals `[0, 0]`.

### defaultFn alias returning a constant applies on omitted column
- 操作: column with `defaultFn` returning `8`; `db.insert(t).values({ id: 1 })`, then `db.select().from(t)`.
- 期待: `rows[0].seq` is `8`.
- 観測: `rows[0].seq` is `0`.

### a default column distinct from explicit 0 keeps the explicit 0
- 操作: multi-row insert into a table with a defaulted `v`; one row supplies `v: 0`, another omits `v`, then `db.select().from(t)`.
- 期待: `rows.map(r => r.v)` equals `[0, 3]`.
- 観測: `rows.map(r => r.v)` equals `[0, 0]`.

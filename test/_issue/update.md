# update

## tsc エラー一覧

- `test/update/expression-setter.test.ts(12,68)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; score: Column<number>; }>>'.`
- `test/update/expression-setter.test.ts(23,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/expression-setter.test.ts(32,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/expression-setter.test.ts(38,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/expression-setter.test.ts(49,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/expression-setter.test.ts(55,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/expression-setter.test.ts(64,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(15,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(21,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(27,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(32,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(35,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/literal-set.test.ts(41,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-column.test.ts(11,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-column.test.ts(17,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-column.test.ts(26,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-column.test.ts(35,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-column.test.ts(41,44)`: TS2769 `No overload matches this call. Argument of type '(r: { name: number; score: number; }) => boolean' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => unknown'. Type 'unknown' is not assignable to type '{ name: number; score: number; }'.`
- `test/update/multi-row.test.ts(11,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-row.test.ts(17,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-row.test.ts(23,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/multi-row.test.ts(34,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(22,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(35,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(45,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(61,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(74,33)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/repeated.test.ts(74,58)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/return-value.test.ts(42,46)`: TS2769 `No overload matches this call. Argument of type '(r: { score: number; }) => boolean' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => unknown'. Type 'unknown' is not assignable to type '{ score: number; }'.`
- `test/update/transaction.test.ts(13,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(22,33)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(22,58)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(30,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(42,48)`: TS7006 `Parameter 'tx' implicitly has an 'any' type.`
- `test/update/transaction.test.ts(42,52)`: TS7006 `Parameter 'c' implicitly has an 'any' type.`
- `test/update/transaction.test.ts(50,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(54,48)`: TS7006 `Parameter 'tx' implicitly has an 'any' type.`
- `test/update/transaction.test.ts(54,52)`: TS7006 `Parameter 'c' implicitly has an 'any' type.`
- `test/update/transaction.test.ts(62,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(76,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(88,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/transaction.test.ts(98,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(11,33)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(11,58)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(17,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(23,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(29,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/untouched-rows.test.ts(35,32)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/visible-to-reads.test.ts(11,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/update/visible-to-reads.test.ts(29,40)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'.`
- `test/update/visible-to-reads.test.ts(36,25)`: TS2571 `Object is of type 'unknown'.`
- `test/update/visible-to-reads.test.ts(36,42)`: TS2571 `Object is of type 'unknown'.`
- `test/update/visible-to-reads.test.ts(45,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`

## 観測されたテストコードの呼び出し形

```ts
// test/update/expression-setter.test.ts:12
await db.insert(db.tables.t).values([{ id: 1, score: 10 }, { id: 2 }, { id: 3, score: 30 }])
```

```ts
// test/update/literal-set.test.ts:13-15
await db.update(t).set({ score: value }).where(eq(t.id, id))
const rows = await db.select().from(t)
expect(rowById(rows, id)?.score).toBe(value)
```

```ts
// test/update/multi-column.test.ts:30-35
await db
        .update(t)
        .set({ name: t.name.add(1), score: t.score.add(1) })
        .where(eq(t.id, 3))
const rows = await db.select().from(t)
expect(rowById(rows, 3)).toMatchObject({ id: 3, name: 301, score: 31 })
```

```ts
// test/update/multi-column.test.ts:39-42
await db.update(t).set({ name: 0, score: 0 })
const rows = await db.select().from(t)
const allZero = rows.every((r: { name: number; score: number }) => r.name === 0 && r.score === 0)
expect(allZero).toBe(true)
```

```ts
// test/update/visible-to-reads.test.ts:9-11
await db.update(t).set({ score: 999 }).where(eq(t.id, 2))
const rows = await db.select().from(t).where(gt(t.score, 100))
expect(rows.map((r: { id: number }) => r.id)).toEqual([2])
```

```ts
// test/update/visible-to-reads.test.ts:33-36
const before = await db.select().from(t).where(eq(t.id, 2))
await db.update(t).set({ score: 0 }).where(eq(t.id, 2))
const after = await db.select().from(t).where(eq(t.id, 2))
expect([before[0].score, after[0].score]).toEqual([20, 0])
```

```ts
// test/update/return-value.test.ts:40-43
const result = (await db.update(t).set({ score: 77 }).where(gte(t.score, 20))) as { changes: number }
const rows = await db.select().from(t)
const carrying = rows.filter((r: { score: number }) => r.score === 77)
expect(result.changes).toBe(carrying.length)
```

```ts
// test/update/transaction.test.ts:42-48
const runner = db.transaction((tx, c) => {
        return tx
                .update(t)
                .set({ score: 0 })
                .where(eq(t.id, (c as { id: number }).id))
})
await runner.run()
```

```ts
// test/update/transaction.test.ts:9-13
await db.transaction(async (tx) => {
        await tx.update(t).set({ score: 50 }).where(eq(t.id, 1))
})
const rows = await db.select().from(t)
expect(rowById(rows, 1)?.score).toBe(50)
```

## エラー件数

53

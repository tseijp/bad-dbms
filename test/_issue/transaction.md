# transaction

## tsc エラー一覧

- test/transaction/commit.test.ts(32,36): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/commit.test.ts(40,34): error TS2769: No overload matches this call.
- test/transaction/commit.test.ts(40,70): error TS2339: Property 'amount' does not exist on type '{}'.
- test/transaction/commit.test.ts(48,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/explicit-rollback.test.ts(28,36): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/isolation.test.ts(19,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/isolation.test.ts(41,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/isolation.test.ts(56,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/nested.test.ts(16,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/nested.test.ts(31,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/per-row-tick.test.ts(11,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(11,53): error TS7006: Parameter '_c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(20,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(20,53): error TS7006: Parameter 'c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(28,48): error TS7006: Parameter 'tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(28,52): error TS7006: Parameter 'c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(36,36): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/per-row-tick.test.ts(40,48): error TS7006: Parameter 'tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(40,52): error TS7006: Parameter 'c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(47,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/per-row-tick.test.ts(52,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(52,53): error TS7006: Parameter '_c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(61,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(61,53): error TS7006: Parameter '_c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(72,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(72,53): error TS7006: Parameter '_c' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(81,48): error TS7006: Parameter '_tx' implicitly has an 'any' type.
- test/transaction/per-row-tick.test.ts(81,53): error TS7006: Parameter 'c' implicitly has an 'any' type.
- test/transaction/rollback-on-throw.test.ts(26,36): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/rollback-on-throw.test.ts(36,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.
- test/transaction/rollback-on-throw.test.ts(48,36): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/rollback-on-throw.test.ts(81,30): error TS2345: Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.

## 観測されたテストコードの呼び出し形

```ts
// test/transaction/commit.test.ts:9-11
await db.transaction(async (tx) => {
        await tx.insert(t).values({ id: 1, amount: 100 })
})
```

```ts
// test/transaction/commit.test.ts:31-32
const rows = await db.select().from(t)
expect(amountsById(rows)).toEqual([0, 30, 40])
```

```ts
// test/transaction/commit.test.ts:39-40
const rows = await db.select().from(t)
expect(rows.find((r: { id: number }) => r.id === 2)?.amount).toBe(99)
```

```ts
// test/transaction/commit.test.ts:47-48
const rows = await db.select().from(t)
expect(idsOf(rows)).toEqual([1, 2])
```

```ts
// test/transaction/per-row-tick.test.ts:10-14
let visits = 0
const runner = db.transaction((_tx, _c) => {
        visits += 1
})
await runner.run({})
```

```ts
// test/transaction/per-row-tick.test.ts:28-34
const runner = db.transaction((tx, c) => {
        return tx
                .update(t)
                .set({ amount: 0 })
                .where(eq(t.id, (c as { id: number }).id))
})
await runner.run({})
```

```ts
// test/transaction/nested.test.ts:9-14
await db.transaction(async (tx) => {
        await tx.insert(t).values({ id: 1, amount: 10 })
        await (tx as { transaction: (fn: (i: typeof tx) => Promise<void>) => Promise<void> }).transaction(async (inner) => {
                await inner.insert(t).values({ id: 2, amount: 20 })
        })
})
```

```ts
// test/transaction/explicit-rollback.test.ts:10-15
await db
        .transaction(async (tx) => {
                await tx.insert(t).values({ id: 1, amount: 100 })
                ;(tx as { rollback: () => void }).rollback()
        })
        .catch(() => undefined)
```

```ts
// test/transaction/isolation.test.ts:26-29
const seenInside = await db.transaction(async (tx) => {
        return tx.select().from(t)
})
expect(idsOf(seenInside as { id: number }[])).toEqual([1])
```

```ts
// test/transaction/rollback-on-throw.test.ts:20-26
const attempt = db.transaction(async (tx) => {
        await tx.update(t).set({ amount: 999 }).where(eq(t.id, 1))
        throw new Error('abort')
})
await attempt.catch(() => undefined)
const rows = await db.select().from(t)
expect(amountsById(rows)).toEqual([10, 20, 30])
```

## エラー件数

32

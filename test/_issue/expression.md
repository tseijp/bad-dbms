# expression

## tsc エラー一覧

(なし)

## 観測されたテストコードの呼び出し形

```ts
// test/expression/arith.test.ts:11
const rows = await db.select({ x: users.score.add(5) }).from(users)
```

```ts
// test/expression/arith.test.ts:64
const rows = await db.select({ x: (users.score as any)[method](arg) }).from(users)
```

```ts
// test/expression/chain.test.ts:9
const rows = await db.select({ x: users.score.add(1).mul(2) }).from(users)
```

```ts
// test/expression/chain.test.ts:19
const rows = await db.select({ x: users.score.add(users.id).sub(5) }).from(users)
```

```ts
// test/expression/chain.test.ts:30-37
['add then sub', (s: any) => s.add(5).sub(3), [12, 22, 32]],
['sub then mul', (s: any) => s.sub(5).mul(2), [10, 30, 50]],
['mul then div', (s: any) => s.mul(3).div(2), [15, 30, 45]],
['add then mul then sub', (s: any) => s.add(2).mul(2).sub(4), [20, 40, 60]],
['four-step chain', (s: any) => s.add(1).mul(2).sub(2).div(2), [10, 20, 30]],
```

```ts
// test/expression/compare.test.ts:26
const rows = await db.select({ x: users.score.eq(users.id.mul(10)) }).from(users)
```

```ts
// test/expression/compare.test.ts:45
const rows = await db.select({ x: users.score.add(5).gt(20) }).from(users)
```

```ts
// test/expression/compose.test.ts:8
const rows = await db.select({ x: users.score.add(users.id).toFloat() }).from(users)
```

```ts
// test/expression/compose.test.ts:23
const rows = await db.select({ x: t.v.toInt().mul(10) }).from(t)
```

```ts
// test/expression/convert.test.ts:30
const rows = await db.select({ x: t.v.toBool() }).from(t)
```

```ts
// test/expression/twocol.test.ts:46
const rows = await db.select({ x: t.a.mod(t.b) }).from(t)
```

```ts
// test/expression/twocol.test.ts:51-54
const rows = await db
        .select({ x: users.score.add(users.id) })
        .from(users)
        .where(users.id.gt(1))
```

```ts
// test/expression/usecase.test.ts:11
const rows = await db.select({ discounted: t.v.mul(8).div(10).toInt() }).from(t)
```

```ts
// test/expression/usecase.test.ts:26
const rows = await db.select({ id: users.id, bonus: users.score.add(users.id).mul(2) }).from(users)
```

```ts
// test/expression/usecase.test.ts:35
const rows = await db.select({ even: t.v.mod(2).eq(0) }).from(t)
```

## エラー件数

0

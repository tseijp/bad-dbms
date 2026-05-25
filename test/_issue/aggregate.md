# aggregate

## tsc エラー一覧

(なし)

## 観測されたテストコードの呼び出し形

```ts
// test/aggregate/helpers.ts:20-27
export const numTable = async (values: number[], type: 'integer' | 'float' = 'integer') => {
        const v = type === 'float' ? float('v') : integer('v')
        const t = table('t', { id: integer('id').primaryKey(), v })
        const db = database({ t })
        const rows = values.map((value, i) => ({ id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows)
        return { db, t }
}
```

```ts
// test/aggregate/avg.test.ts:17-21
const { db, users } = await seedUsers()
const result = await db.select({ a: avg(users.score) }).from(users)
expect(scalar(result, 'a')).toBe('20')
```

```ts
// test/aggregate/avg.test.ts:55-63
const before = await db.select({ a: avg(users.score) }).from(users)
await db
        .update(users)
        .set({ score: users.score.add(10) })
        .where(gte(users.id, 1))
const after = await db.select({ a: avg(users.score) }).from(users)
expect([scalar(before, 'a'), scalar(after, 'a')]).toEqual(['20', '30'])
```

```ts
// test/aggregate/aggmut.test.ts:13-18
const { db, users } = await seedUsers()
await db.delete(users).where(eq(users.id, 3))
const result = await db.select({ n: count(), s: sum(users.score) }).from(users)
expect(aggRow(result)).toEqual({ n: 2, s: '30' })
```

```ts
// test/aggregate/count1.test.ts:46-49
const { db, users } = await seedUsers()
const result = await db.select({ n: count() }).from(users).where(gt(users.score, 15))
expect(scalar(result, 'n')).toBe(2)
```

```ts
// test/aggregate/count1.test.ts:119-125
const seedNullable = async (values: Array<number | null>) => {
        const t = table('t', { id: integer('id'), v: integer('v') })
        const db = database({ t })
        const rows = values.map((value, i) => (value === null ? { id: i + 1 } : { id: i + 1, v: value }))
        if (rows.length) await db.insert(t).values(rows as any)
        return { db, t }
}
```

```ts
// test/aggregate/count2.test.ts:9-13
const { db, users } = await seedUsers()
const result = await db.select({ n: count() }).from(users)
expect(Array.isArray(result)).toBe(true)
```

```ts
// test/aggregate/sum.test.ts:18-22
const { db, users } = await seedUsers()
const result = await db.select({ s: sum(users.score) }).from(users)
expect(scalar(result, 's')).toBe('60')
```

```ts
// test/aggregate/multiagg.test.ts:14-18
const { db, users } = await seedUsers()
const result = await db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)
expect(aggRow(result)).toEqual({ n: 3, s: '60', a: '20' })
```

```ts
// test/aggregate/multiagg.test.ts:24-36
const result = await db
        .select({
                n: count(),
                s: sum(users.score),
                a: avg(users.score),
                lo: min(users.score),
                hi: max(users.score),
        })
        .from(users)
expect(aggRow(result)).toEqual({ n: 3, s: '60', a: '20', lo: 10, hi: 30 })
```

## エラー件数

0

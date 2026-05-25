# group

## tsc エラー一覧

- (なし)

## 観測されたテストコードの呼び出し形

```ts
const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind)
```

```ts
const result = await db
        .select({ kind: events.kind, a: avg(events.v) })
        .from(events)
        .groupBy(events.kind)
```

```ts
const result = await (db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind) as any).having(gt(count(), 1))
```

```ts
const result = await (
        db
                .select({ kind: events.kind, s: sum(events.v) })
                .from(events)
                .groupBy(events.kind) as any
).having(gt(sum(events.v), 400))
```

```ts
const result = await db.select({ kind: events.kind, n: count() }).from(events).groupBy(events.kind).orderBy(asc(events.kind))
```

```ts
const result = await db
        .select({ kind: events.kind, s: sum(events.v) })
        .from(events)
        .groupBy(events.kind)
        .orderBy(desc(sum(events.v)))
```

```ts
const result = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId).orderBy(asc(count()))
```

```ts
await db.insert(posts).values({ id: 5, userId: 2, score: 8 })
const after = await db.select({ userId: posts.userId, n: count() }).from(posts).groupBy(posts.userId)
```

```ts
const result = await db.select({ kind: events.kind, n: count() }).from(events).where(gt(events.v, 150)).groupBy(events.kind)
```

```ts
expect(byKey(result, 'kind').map((r) => r.kind)).toEqual([0, 1, 2])
```

## エラー件数

0

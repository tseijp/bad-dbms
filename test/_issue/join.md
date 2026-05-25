# join

## tsc エラー一覧

- (該当なし)

## 観測されたテストコードの呼び出し形

```ts
// test/join/helpers.ts:15-18
export const innerJoin = (b: any, right: any, on: any) => b.innerJoin(right, on)
export const leftJoin = (b: any, right: any, on: any) => b.leftJoin(right, on)
export const rightJoin = (b: any, right: any, on: any) => b.rightJoin(right, on)
export const fullJoin = (b: any, right: any, on: any) => b.fullJoin(right, on)
```

```ts
// test/join/innerjoin.test.ts:11
const result = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
```

```ts
// test/join/innerjoin.test.ts:31
const result = await innerJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id)).where(eq(users.id, 1))
```

```ts
// test/join/innerjoin.test.ts:36
const result = await innerJoin(db.select({ userId: users.id, postScore: posts.score }).from(users), posts, eq(posts.userId, users.id)).where(gt(posts.score, 6))
```

```ts
// test/join/leftjoin.test.ts:9
const result = await leftJoin(db.select({ userId: users.id, postId: posts.id }).from(users), posts, eq(posts.userId, users.id))
```

```ts
// test/join/rightjoin.test.ts:16
const result = await rightJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
```

```ts
// test/join/fulljoin.test.ts:19
const result = await fullJoin(db.select({ id: l.id, rv: r.rv }).from(l), r, eq(r.fk, l.id))
```

```ts
// test/join/joinchain.test.ts:17
const result = await innerJoin(innerJoin(db.select({ userId: users.id, postId: posts.id, tagId: tags.id }).from(users), posts, eq(posts.userId, users.id)), tags, eq(tags.postId, posts.id))
```

```ts
// test/join/joinproj.test.ts:21
const result = await innerJoin(db.select({ userId: users.id, combined: users.score.add(posts.score) }).from(users), posts, eq(posts.userId, users.id))
```

```ts
// test/join/joinproj.test.ts:26
const result = await innerJoin(db.select().from(users), posts, eq(posts.userId, users.id))
```

```ts
// test/join/onetomany.test.ts:20
const result = await innerJoin(db.select({ userId: users.id, n: count() }).from(users), posts, eq(posts.userId, users.id)).groupBy(users.id)
```

```ts
// test/join/selfjoin.test.ts:10
const result = await innerJoin(db.select({ child: nodes.id, parent: nodes.id }).from(nodes), nodes, eq(nodes.parentId, nodes.id))
```

## エラー件数

0

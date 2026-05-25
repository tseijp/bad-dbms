# select

## tsc エラー一覧

(なし)

## 観測されたテストコードの呼び出し形

```ts
// test/select/select1.test.ts:16-20
it('reads back every seeded user row', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select().from(users)
        expect(rowsOf(rows)).toHaveLength(3)
})
```

```ts
// test/select/select1.test.ts:45-50
it('reads an empty array from a freshly built un-seeded table', async () => {
        const users = makeUsers()
        const db = database({ users })
        const rows = await db.select().from(db.tables.users)
        expect(rowsOf(rows)).toEqual([])
})
```

```ts
// test/select/select2.test.ts:13-17
it('narrows a user read to a single id key per row', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ id: users.id }).from(users)
        expect(rowsOf(rows).every((r) => Object.keys(r).length === 1)).toBe(true)
})
```

```ts
// test/select/select2.test.ts:28-32
it('projects two columns and yields exactly those two keys', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ id: users.id, score: users.score }).from(users)
        expect(rowsOf(rows)[0]).toEqual({ id: 1, score: 10 })
})
```

```ts
// test/select/alias.test.ts:20-24
it('keys the result by the alias when it differs from the column name', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ point: users.score }).from(users)
        expect(keysOf(rows)).toEqual(['point'])
})
```

```ts
// test/select/expr.test.ts:16-20
it('doubles every score through a multiply expression column', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ doubled: users.score.mul(2) }).from(users)
        expect(valuesOf(rows, 'doubled')).toEqual([20, 40, 60])
})
```

```ts
// test/select/expr.test.ts:65-69
it('mixes a plain column and an expression column in one projection', async () => {
        const { db, users } = await seedUsers()
        const rows = await db.select({ id: users.id, bonus: users.score.add(1) }).from(users)
        expect(rowsOf(rows)[0]).toEqual({ id: 1, bonus: 11 })
})
```

```ts
// test/select/aggshape.test.ts:15-19
it('returns a single-aggregate projection as an array', async () => {
        const { db, users } = await seedUsers()
        const result = await db.select({ n: count() }).from(users)
        expect(Array.isArray(result)).toBe(true)
})
```

```ts
// test/select/aggshape.test.ts:35-39
it('returns a multi-aggregate projection as a one-row array', async () => {
        const { db, users } = await seedUsers()
        const result = await db.select({ n: count(), s: sum(users.score), a: avg(users.score) }).from(users)
        expect(rowsOf(result)).toHaveLength(1)
})
```

```ts
// test/select/distinct.test.ts:12
const selectDistinct = (db: any, projection?: unknown) => (projection === undefined ? db.selectDistinct() : db.selectDistinct(projection))
```

```ts
// test/select/select3.test.ts:14-19
it('keeps a narrow then wide read independent with no projection leak', async () => {
        const { db, users } = await seedUsers()
        const narrow = await db.select({ id: users.id }).from(users)
        const wide = await db.select().from(users)
        expect([keysOf(narrow), keysOf(wide)]).toEqual([['id'], ['id', 'name', 'score']])
})
```

## エラー件数

0

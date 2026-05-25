# insert

## tsc エラー一覧

- `test/insert/batches.test.ts(16,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/batches.test.ts(55,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/column-omission.test.ts(8,47)`: TS2345 `Argument of type '{ id: number; name: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<...>[]'.`
- `test/insert/column-omission.test.ts(10,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-omission.test.ts(15,47)`: TS2345 `Argument of type '{ id: number; userId: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; userId: Column<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ ...; }>>[]'.`
- `test/insert/column-omission.test.ts(17,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-omission.test.ts(23,54)`: TS2345 `Argument of type '{ id: number; score: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<...>[]'.`
- `test/insert/column-omission.test.ts(29,47)`: TS2345 `Argument of type '{ id: number; score: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; userId: Column<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ ...; }>>[]'.`
- `test/insert/column-omission.test.ts(31,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-omission.test.ts(37,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-omission.test.ts(52,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-omission.test.ts(58,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(12,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(22,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(34,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(47,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(61,33)`: TS2345 `Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/column-types.test.ts(74,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(88,33)`: TS2345 `Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/column-types.test.ts(104,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/column-types.test.ts(117,33)`: TS2345 `Argument of type '(r: { v: string; }) => string' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => string'.`
- `test/insert/default.test.ts(10,53)`: TS2345 `Argument of type '{ id: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; v: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ id: TypedColumn<number>; v: TypedColumn<...>; }>>[]'.`
- `test/insert/default.test.ts(12,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(20,53)`: TS2345 `Argument of type '{ id: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; v: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ id: TypedColumn<number>; v: TypedColumn<...>; }>>[]'.`
- `test/insert/default.test.ts(22,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(32,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(42,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(50,53)`: TS2345 `Argument of type '{ id: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<...>; }>>[]'.`
- `test/insert/default.test.ts(52,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(61,54)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<number>; }>>'.`
- `test/insert/default.test.ts(61,65)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<number>; }>>'.`
- `test/insert/default.test.ts(63,33)`: TS2345 `Argument of type '(r: { seq: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/default.test.ts(71,53)`: TS2345 `Argument of type '{ id: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<number>; }>> | InsertRowOfTable<Table<{ id: TypedColumn<number>; seq: TypedColumn<...>; }>>[]'.`
- `test/insert/default.test.ts(73,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(83,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/default.test.ts(91,71)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; v: TypedColumn<number>; }>>'.`
- `test/insert/default.test.ts(93,33)`: TS2345 `Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/multi-row.test.ts(24,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/multi-row.test.ts(62,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/read-consistency.test.ts(29,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/read-consistency.test.ts(53,26)`: TS2339 `Property 'n' does not exist on type 'RowOfFields<{ n: SQL<number>; }>[]'.`
- `test/insert/read-consistency.test.ts(67,26)`: TS2339 `Property 'n' does not exist on type 'RowOfFields<{ n: SQL<number>; }>[]'.`
- `test/insert/read-consistency.test.ts(77,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/returning.test.ts(76,58)`: TS2345 `Argument of type '{ id: number; name: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<...>[]'.`
- `test/insert/seed-helpers.test.ts(33,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/seed-helpers.test.ts(38,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/single-row.test.ts(41,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/single-row.test.ts(47,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/single-row.test.ts(53,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/single-row.test.ts(61,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/single-row.test.ts(67,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/table-shapes.test.ts(16,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/table-shapes.test.ts(33,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/table-shapes.test.ts(39,24)`: TS2571 `Object is of type 'unknown'.`
- `test/insert/table-shapes.test.ts(57,53)`: TS2345 `Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<...>[]'.`
- `test/insert/table-shapes.test.ts(66,43)`: TS2345 `Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>> | InsertRowOfTable<...>[]'.`
- `test/insert/transaction.test.ts(44,33)`: TS2345 `Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: unknown, index: number, array: unknown[]) => number'.`
- `test/insert/transaction.test.ts(76,48)`: TS7006 `Parameter 'tx' implicitly has an 'any' type.`
- `test/insert/transaction.test.ts(76,52)`: TS7006 `Parameter '_c' implicitly has an 'any' type.`
- `test/insert/transaction.test.ts(90,48)`: TS7006 `Parameter 'tx' implicitly has an 'any' type.`
- `test/insert/transaction.test.ts(90,52)`: TS7006 `Parameter '_c' implicitly has an 'any' type.`

## 観測されたテストコードの呼び出し形

```ts
// test/insert/column-omission.test.ts:6-11
it('omitting a default(0) column writes the declared default', async () => {
        const { db, users } = freshUsers()
        await db.insert(users).values({ id: 1, name: 11 })
        const rows = await db.select().from(users)
        expect(rows[0].score).toBe(0)
})
```

```ts
// test/insert/default.test.ts:14-23
it.each([[1], [7], [42], [99], [255]])('declared default %i with omitted column reads back the default', async (d) => {
        const t = table('defn', {
                id: integer('id').primaryKey(),
                v: integer('v').default(d),
        })
        const db = database({ t })
        await db.insert(db.tables.t).values({ id: 1 })
        const rows = await db.select().from(db.tables.t)
        expect(rows[0].v).toBe(d)
})
```

```ts
// test/insert/default.test.ts:60-64
const db = database({ t })
await db.insert(db.tables.t).values([{ id: 1 }, { id: 2 }])
const rows = await db.select().from(db.tables.t)
expect(rows.map((r: { seq: number }) => r.seq)).toEqual([1, 2])
```

```ts
// test/insert/batches.test.ts:11-17
it('two sequential single-row inserts keep ids 1,2 in order', async () => {
        const { db, users } = freshUsers()
        await db.insert(users).values([{ id: 1, name: 11, score: 10 }])
        await db.insert(users).values([{ id: 2, name: 22, score: 20 }])
        const rows = await db.select().from(users)
        expect(rows.map((r: { id: number }) => r.id)).toEqual([1, 2])
})
```

```ts
// test/insert/single-row.test.ts:36-42
('a single insert %s', async (_label, key) => {
        const { db, users } = freshUsers()
        await db.insert(users).values({ id: 7, name: 70, score: 700 })
        const rows = await db.select().from(users)
        const expected: Record<string, number> = { id: 7, name: 70, score: 700 }
        expect(rows[0][key]).toBe(expected[key])
})
```

```ts
// test/insert/read-consistency.test.ts:49-54
it.skip('inserting into one table leaves the sibling count at 0', async () => {
        const { db, users, posts } = freshUsersPosts()
        await db.insert(users).values(USERS_SEED)
        const r = await db.select({ n: count() }).from(posts)
        expect(r.n).toBe(0)
})
```

```ts
// test/insert/table-shapes.test.ts:55-59
] as const)('a %s seed insert resolves to a changes count matching the seed length', async (_label, build, seed) => {
        const { db, t } = build()
        const r = await db.insert(t).values(seed as Record<string, number>[])
        expect(r).toMatchObject({ changes: seed.length })
})
```

```ts
// test/insert/transaction.test.ts:70-83
it('per-row tick transaction inserts one post per visited user', async () => {
        const users = makeUsers()
        const posts = makePosts()
        const db = database({ users, posts })
        await db.insert(db.tables.users).values(USERS_SEED)
        let next = 0
        const runner = db.transaction((tx, _c) => {
                next += 1
                return tx.insert(db.tables.posts).values({ id: next, userId: next, score: 0 })
        })
        await runner.run()
        const rows = await db.select().from(db.tables.posts)
        expect(rows.length).toBe(3)
})
```

```ts
// test/insert/returning.test.ts:73-78
it('a returned row reflects the declared default of a column omitted from the insert', async () => {
        const { db, users } = freshUsers()
        // score has a declared default; omitting it must surface the default in the returned row
        const r = (await db.insert(users).values({ id: 1, name: 11 }).returning()) as { score: number }[]
        expect(r[0].score).toBe(0)
})
```

## エラー件数

61

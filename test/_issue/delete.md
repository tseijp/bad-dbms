# delete

## tsc エラー一覧

- `test/delete/_fixtures.ts(20,15)`: TS7022 `'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`
- `test/delete/_fixtures.ts(22,59)`: TS7024 `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
- `test/delete/cascade-tree.test.ts(24,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/cascade-tree.test.ts(36,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/cascade.test.ts(13,34)`: TS2322 `Type 'number' is not assignable to type 'string'.`
- `test/delete/cascade.test.ts(14,34)`: TS2322 `Type 'number' is not assignable to type 'string'.`
- `test/delete/cascade.test.ts(17,48)`: TS2322 `Type 'number' is not assignable to type 'string'.`
- `test/delete/cascade.test.ts(18,48)`: TS2322 `Type 'number' is not assignable to type 'string'.`
- `test/delete/cascade.test.ts(19,48)`: TS2322 `Type 'number' is not assignable to type 'string'.`
- `test/delete/cascade.test.ts(28,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/cascade.test.ts(54,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/null-predicate.test.ts(15,73)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; tag: Column<number>; }>>'.`
- `test/delete/null-predicate.test.ts(15,103)`: TS2322 `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; tag: Column<number>; }>>'.`
- `test/delete/null-predicate.test.ts(22,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/null-predicate.test.ts(28,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/null-predicate.test.ts(35,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/re-delete.test.ts(25,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/re-delete.test.ts(38,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/sibling-isolation.test.ts(25,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/text-predicate.test.ts(25,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/text-predicate.test.ts(32,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/transaction.test.ts(13,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/transaction.test.ts(24,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/transaction.test.ts(28,48)`: TS7006 `Parameter 'tx' implicitly has an 'any' type.`
- `test/delete/transaction.test.ts(28,52)`: TS7006 `Parameter 'c' implicitly has an 'any' type.`
- `test/delete/transaction.test.ts(34,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`
- `test/delete/transaction.test.ts(50,30)`: TS2345 `Argument of type 'unknown[]' is not assignable to parameter of type '{ id: number; }[]'.`

## 観測されたテストコードの呼び出し形

```ts
// test/delete/_fixtures.ts:19-25
export const makeNodes = () => {
        const nodes = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => nodes.id, { onDelete: 'cascade' }),
        })
        return nodes
}
```

```ts
// test/delete/_fixtures.ts:49
export const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)
```

```ts
// test/delete/cascade.test.ts:12-20
await db.insert(db.tables.authors).values([
        { id: 1, name: 1 },
        { id: 2, name: 2 },
])
await db.insert(db.tables.books).values([
        { id: 10, authorId: 1, title: 1 },
        { id: 11, authorId: 1, title: 2 },
        { id: 12, authorId: 2, title: 3 },
])
```

```ts
// test/delete/cascade.test.ts:25-28
await db.delete(authors).where(eq(authors.id, 1))
const rows = await db.select().from(books)
expect(idsOf(rows)).toEqual([12])
```

```ts
// test/delete/null-predicate.test.ts:15
await db.insert(db.tables.t).values([{ id: 1, tag: 5 }, { id: 2 }, { id: 3, tag: 7 }, { id: 4 }])
```

```ts
// test/delete/null-predicate.test.ts:19-22
const { db, t } = await seededNullable()
await db.delete(t).where(isNull(t.tag))
const rows = await db.select().from(t)
expect(idsOf(rows)).toEqual([1, 3])
```

```ts
// test/delete/transaction.test.ts:26-32
it('a per-row tick deletes every visited row whose score clears a cutoff', async () => {
        const { db, t } = await seededBoard()
        const runner = db.transaction((tx, c) => {
                const cur = c as { id: number; score: number }
                return tx.delete(t).where(and(eq(t.id, cur.id), gt(t.score, 15)))
        })
        await runner.run()
```

```ts
// test/delete/re-delete.test.ts:21-25
await db.delete(t).where(eq(t.id, 2))
await db.update(t).set({ score: 0 }).where(eq(t.id, 1))
await db.insert(t).values({ id: 5, score: 50 })
const rows = await db.select().from(t)
expect(idsOf(rows)).toEqual([1, 3, 5])
```

```ts
// test/delete/sibling-isolation.test.ts:22-25
const { db, board, tag } = await twoTables()
await db.delete(board)
const rows = await db.select().from(tag)
expect(idsOf(rows)).toEqual([1, 2])
```

## エラー件数

27

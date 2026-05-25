# delete feature - tsc observation report

## Feature

`delete`

## Target files

Located under `projects/bad-dbms/test/delete/`:

- `_fixtures.ts` (shared helpers, not a `.test.ts` file)
- `cascade.test.ts`
- `cascade-tree.test.ts`
- `null-predicate.test.ts`
- `re-delete.test.ts`
- `returning.test.ts`
- `return-value.test.ts`
- `sibling-isolation.test.ts`
- `text-predicate.test.ts`
- `transaction.test.ts`

## tsc errors (all, filtered by `test/delete`)

Command:

```
cd projects/bad-dbms
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "test/delete"
```

| # | File | Line:Col | Code | Message |
|---|------|----------|------|---------|
| 1 | `test/delete/_fixtures.ts` | 20:15 | TS7022 | `'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.` |
| 2 | `test/delete/_fixtures.ts` | 22:59 | TS7024 | `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.` |
| 3 | `test/delete/cascade.test.ts` | 13:34 | TS2322 | `Type 'number' is not assignable to type 'string'.` |
| 4 | `test/delete/cascade.test.ts` | 14:34 | TS2322 | `Type 'number' is not assignable to type 'string'.` |
| 5 | `test/delete/cascade.test.ts` | 17:48 | TS2322 | `Type 'number' is not assignable to type 'string'.` |
| 6 | `test/delete/cascade.test.ts` | 18:48 | TS2322 | `Type 'number' is not assignable to type 'string'.` |
| 7 | `test/delete/cascade.test.ts` | 19:48 | TS2322 | `Type 'number' is not assignable to type 'string'.` |
| 8 | `test/delete/null-predicate.test.ts` | 15:73 | TS2322 | `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number, false>; tag: TypedColumn<number, false>; }>>'. Property 'tag' is missing in type '{ id: number; }' but required in type '{ tag: number; id: number; }'.` |
| 9 | `test/delete/null-predicate.test.ts` | 15:103 | TS2322 | `Type '{ id: number; }' is not assignable to type 'InsertRowOfTable<Table<{ id: TypedColumn<number, false>; tag: TypedColumn<number, false>; }>>'. Property 'tag' is missing in type '{ id: number; }' but required in type '{ tag: number; id: number; }'.` |
| 10 | `test/delete/transaction.test.ts` | 28:48 | TS7006 | `Parameter 'tx' implicitly has an 'any' type.` |
| 11 | `test/delete/transaction.test.ts` | 28:52 | TS7006 | `Parameter 'c' implicitly has an 'any' type.` |

## Aggregate counts

- Total errors in `test/delete`: **11**
- By file:
  - `_fixtures.ts`: 2
  - `cascade.test.ts`: 5
  - `null-predicate.test.ts`: 2
  - `transaction.test.ts`: 2
  - `cascade-tree.test.ts`: 0
  - `re-delete.test.ts`: 0
  - `returning.test.ts`: 0
  - `return-value.test.ts`: 0
  - `sibling-isolation.test.ts`: 0
  - `text-predicate.test.ts`: 0
- By error code:
  - TS2322 (type not assignable): 7
  - TS7006 (parameter implicit any): 2
  - TS7022 (variable referenced in own initializer, implicit any): 1
  - TS7024 (function return type implicit any): 1

## library user representative patterns

### `_fixtures.ts`

Schema builders via `table`, `integer`, `text`:

```ts
table('authors', {
        id: integer('id').primaryKey(),
        name: text('name'),
})
```

FK declared with `.references(() => authors.id, { onDelete: 'cascade' })`:

```ts
authorId: integer('author_id').references(() => authors.id, { onDelete: 'cascade' }),
```

Self-referential table within an IIFE-style `let` so the table is captured in its own FK callback:

```ts
const nodes = table('nodes', {
        id: integer('id').primaryKey(),
        parentId: integer('parent_id').references(() => nodes.id, { onDelete: 'cascade' }),
})
```

`database({ t })` accepts a record of tables. The handle is reused as `db.tables.t` re-typed via `as ReturnType<typeof makeBoard>`:

```ts
const db = database({ t })
return { db, t: db.tables.t as ReturnType<typeof makeBoard> }
```

`db.insert(t).values([...])` is awaited; rows are plain object literals:

```ts
await db.insert(t).values([
        { id: 1, score: 10 },
        { id: 2, score: 20 },
        { id: 3, score: 30 },
])
```

Helper for ordered id extraction:

```ts
export const idsOf = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)
```

### `cascade.test.ts`

`db.insert(db.tables.authors).values([...])` with row literals where `name`/`title` columns receive numeric literals (these drive the TS2322 messages):

```ts
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

`db.delete(table).where(eq(table.col, x))` returning a thenable, awaited:

```ts
await db.delete(authors).where(eq(authors.id, 1))
```

`db.delete(table)` with no predicate:

```ts
await db.delete(authors)
```

`db.select({ n: count() }).from(books)` projection asserted with `toEqual`:

```ts
const result = await db.select({ n: count() }).from(books)
expect(result).toEqual([{ n: 1 }])
```

`db.transaction(async (tx) => { ... })` used for a cascade inside a tx (callback-style, `tx` implicitly typed):

```ts
await db.transaction(async (tx) => {
        await tx.delete(authors).where(eq(authors.id, 2))
})
```

### `cascade-tree.test.ts`

`db.insert(db.tables.nodes).values([...])` with self-referential `parentId`; verifies subtree removal via `db.delete(nodes).where(eq(nodes.id, n))` and `db.select().from(nodes)`.

```ts
await db.delete(nodes).where(eq(nodes.id, 1))
const rows = await db.select().from(nodes)
expect(rows).toEqual([])
```

### `null-predicate.test.ts`

Inline `table(...)` + `database(...)` inside an arrow factory; insertions mix full and partial row literals — the latter omit `tag` (drives TS2322 at line 15):

```ts
await db.insert(db.tables.t).values([{ id: 1, tag: 5 }, { id: 2 }, { id: 3, tag: 7 }, { id: 4 }])
```

`isNull(t.tag)` / `isNotNull(t.tag)` / `eq(t.tag, 0)` flow into `db.delete(t).where(...)`:

```ts
await db.delete(t).where(isNull(t.tag))
await db.delete(t).where(isNotNull(t.tag))
await db.delete(t).where(eq(t.tag, 0))
```

### `re-delete.test.ts`

Result asserted to expose `rowCount`:

```ts
const second = await db.delete(t).where(eq(t.id, 2))
expect(second).toMatchObject({ rowCount: 0 })
```

`db.update(t).set({ score: 999 }).where(eq(t.id, 1))` returning a `rowCount`-bearing object:

```ts
const result = await db.update(t).set({ score: 999 }).where(eq(t.id, 1))
expect(result).toMatchObject({ rowCount: 0 })
```

Aggregate `sum` used through a `select({ s: sum(t.score) }).from(t)` and cast to expected shape:

```ts
const result = (await db.select({ s: sum(t.score) }).from(t)) as { s: number | null }[]
expect(result[0].s).toBeNull()
```

`inArray(t.id, [1, 3])` predicate threaded through `.where`:

```ts
await db.delete(t).where(inArray(t.id, [1, 3]))
```

### `returning.test.ts`

`db.delete(t).where(...).returning()` awaited and cast to a row-shape array:

```ts
const removed = (await db.delete(t).where(eq(t.id, 2)).returning()) as Record<string, number>[]
expect(removed).toEqual([{ id: 2, score: 20 }])
```

`lt(t.score, 25)` used as predicate; result re-typed to `{ id: number }[]`:

```ts
const removed = (await db.delete(t).where(lt(t.score, 25)).returning()) as { id: number }[]
expect(idsOf(removed)).toEqual([1, 2])
```

`.returning()` on a no-match delete asserted to be `[]`; full-table `db.delete(t).returning()` also exercised.

### `return-value.test.ts`

`it.each([...])` driven by `(label, predBuilder, expected)` triples where the predBuilder is typed against `ReturnType<typeof makeBoard>`:

```ts
it.each([
        ['one id', (t: ReturnType<typeof makeBoard>) => eq(t.id, 2), 1],
        ['a low-score range', (t: ReturnType<typeof makeBoard>) => lt(t.score, 25), 2],
        ['every row', (t: ReturnType<typeof makeBoard>) => gt(t.score, 0), 3],
        ['no row', (t: ReturnType<typeof makeBoard>) => eq(t.id, 999), 0],
])('deleting %s reports a rowCount of the rows removed', async (_label, pred, expected) => {
        const { db, t } = await seededBoard()
        const result = await db.delete(t).where(pred(t))
        expect(result).toMatchObject({ rowCount: expected })
})
```

`gte(t.score, 20)` predicate plus pre/post `db.select().from(t)` to compare lengths.

### `sibling-isolation.test.ts`

Inline second table via `table('tag', { id: integer('id').primaryKey(), weight: integer('weight') })` registered alongside `board` in `database({ board, tag })`. Sibling reads exercised through `db.select().from(tag)` and `db.select({ n: count() }).from(tag)`:

```ts
const result = await db.select({ n: count() }).from(tag)
expect(result).toEqual([{ n: 2 }])
```

Sibling row asserted by reading and finding a row:

```ts
const rows = (await db.select().from(tag)) as { id: number; weight: number }[]
const first = rows.find((r) => r.id === 1)
expect(first).toMatchObject({ id: 1, weight: 5 })
```

### `text-predicate.test.ts`

Inline `table('people', { ... text('name') })`, insertions of string literals, and `like(t.name, 'a%')` predicate:

```ts
await db.delete(t).where(eq(t.name, 'bob'))
await db.delete(t).where(like(t.name, 'a%'))
```

Surviving rows cast and queried by `find`:

```ts
const rows = (await db.select().from(t)) as { id: number; name: string }[]
const survivor = rows.find((r) => r.id === 2)
expect(survivor?.name).toBe('bob')
```

### `transaction.test.ts`

Async-callback transaction with awaited deletes inside:

```ts
await db.transaction(async (tx) => {
        await tx.delete(t).where(eq(t.id, 1))
})
```

Transaction body that throws, awaited with `.catch(() => undefined)`:

```ts
const attempt = db.transaction(async (tx) => {
        await tx.delete(t).where(eq(t.id, 2))
        throw new Error('abort')
})
await attempt.catch(() => undefined)
```

A "per-row tick" variant: `db.transaction((tx, c) => ...)` returning a runner object that exposes `.run()` (both `tx` and `c` parameters are implicitly `any` — drives TS7006):

```ts
const runner = db.transaction((tx, c) => {
        const cur = c as { id: number; score: number }
        return tx.delete(t).where(and(eq(t.id, cur.id), gt(t.score, 15)))
})
await runner.run()
```

Read inside the same transaction returned and cast at the call site:

```ts
const seen = await db.transaction(async (tx) => {
        await tx.delete(t).where(ne(t.id, 2))
        return tx.select().from(t)
})
expect(idsOf(seen as { id: number }[])).toEqual([2])
```

Range predicate `between(t.score, 10, 20)` used as the `.where` clause.

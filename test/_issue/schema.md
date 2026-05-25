# schema

## tsc エラー一覧

- `test/schema/default.test.ts(46,80)`: TS2345 `Argument of type 'any' is not assignable to parameter of type 'never'.`
- `test/schema/reference.test.ts(77,23)`: TS7022 `'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`
- `test/schema/reference.test.ts(79,67)`: TS7024 `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`
- `test/schema/reference.test.ts(85,23)`: TS7022 `'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`
- `test/schema/reference.test.ts(87,67)`: TS7024 `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`

## 観測されたテストコードの呼び出し形

```ts
// test/schema/default.test.ts:45-48
it.each(factoryNames)('marks hasDefault true on a %s column with a default', (name) => {
        const t = table('t', { score: factories[name]('score').default(1 as any) })
        expect((t as any).score.hasDefault).toBe(true)
})
```

```ts
// test/schema/default.test.ts:33-36
it.each(intDefaults)('records a %s default on the public default property', (_label, value) => {
        const t = table('t', { score: integer('score').default(value) })
        expect((t as any).score.default).toBe(value)
})
```

```ts
// test/schema/reference.test.ts:76-83
it('lists a self-referential foreign key in getTableConfig', () => {
        const nodes = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => (nodes as any).id),
        })
        const config = getTableConfig(nodes)
        expect(config.foreignKeys.length).toBe(1)
})
```

```ts
// test/schema/reference.test.ts:84-92
it('resolves a self-referential foreign key back to its own table', () => {
        const nodes = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => (nodes as any).id),
        })
        const fk = getTableConfig(nodes).foreignKeys[0]
        const ref = fk.reference()
        expect(ref.foreignTable.$meta?.name ?? ref.foreignTable.name).toBe('nodes')
})
```

```ts
// test/schema/reference.test.ts:33-42
it('resolves a foreign key to its referencing column name', () => {
        const users = table('users', { id: integer('id').primaryKey() })
        const posts = table('posts', {
                id: integer('id').primaryKey(),
                userId: integer('user_id').references(() => (users as any).id),
        })
        const fk = getTableConfig(posts).foreignKeys[0]
        const ref = fk.reference()
        expect(ref.columns.map((c: any) => c.name)).toContain('user_id')
})
```

## エラー件数

5

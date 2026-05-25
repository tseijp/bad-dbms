# delete tsc 観測報告

## tsc エラー一覧 (初期)

- test/delete/_fixtures.ts:20:15 - error TS7022: 'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- test/delete/_fixtures.ts:22:59 - error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
- test/delete/cascade.test.ts:13:34 - error TS2322: Type 'number' is not assignable to type 'string'.
- test/delete/cascade.test.ts:14:34 - error TS2322: Type 'number' is not assignable to type 'string'.
- test/delete/cascade.test.ts:17:48 - error TS2322: Type 'number' is not assignable to type 'string'.
- test/delete/cascade.test.ts:18:48 - error TS2322: Type 'number' is not assignable to type 'string'.
- test/delete/cascade.test.ts:19:48 - error TS2322: Type 'number' is not assignable to type 'string'.

## test 側で修正したファイル

- test/delete/cascade.test.ts: text 列 `name` / `title` に number リテラルを渡していた insert 値を string リテラルに修正。
  - before:
    ```
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
  - after:
    ```
    await db.insert(db.tables.authors).values([
            { id: 1, name: '1' },
            { id: 2, name: '2' },
    ])
    await db.insert(db.tables.books).values([
            { id: 10, authorId: 1, title: '1' },
            { id: 11, authorId: 1, title: '2' },
            { id: 12, authorId: 2, title: '3' },
    ])
    ```
  - assertion (`idsOf(rows)` / `rows[0]` の `id` `authorId` チェック等) は一切変更していない。setup data の型を declared 列型 (text = string) に揃えただけ。

## 修正後の tsc エラー一覧

- test/delete/_fixtures.ts:20:15 - error TS7022: 'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- test/delete/_fixtures.ts:22:59 - error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.

(残った 2 件は `makeNodes` 内の `table('nodes', { id: ..., parentId: integer(...).references(() => nodes.id, ...) })` 自己参照による implicit any。test 側で型注釈を入れるには src 側の Table 型を引いてくる必要があり、test 側だけでは素直に直せないため見送り。)

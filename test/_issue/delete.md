# delete 型安全検証 report

## 検証範囲

`test/delete/` 配下のテストファイル群について、`tsc --noEmit --strict` で型検証を実施。

対象ファイル (test/delete/):

- `_fixtures.ts` (test fixture / 共有 schema)
- `cascade.test.ts`
- `cascade-tree.test.ts`
- `null-predicate.test.ts`
- `re-delete.test.ts`
- `returning.test.ts`
- `return-value.test.ts`
- `sibling-isolation.test.ts`
- `text-predicate.test.ts`
- `transaction.test.ts`

実行コマンド:

```
npx tsc --noEmit --strict --target ESNext --module ESNext \
  --moduleResolution Bundler --jsx react-jsx --jsxImportSource react \
  --skipLibCheck --lib ESNext,DOM test/delete/*.test.ts
```

## エラー総数

- **test/delete/ 由来: 97 件**
- エラーコード内訳:
        | TSコード | 件数 | 概要 |
        | --- | --- | --- |
        | TS2345 | 93 | Argument 型ミスマッチ |
        | TS7022 | 1 | 自己参照型で implicit any |
        | TS7024 | 1 | 自己参照関数の戻り implicit any |
        | TS7006 | 2 | callback param が implicit any |

- ファイル別内訳:
        | ファイル | エラー件数 |
        | --- | --- |
        | _fixtures.ts | 3 |
        | cascade.test.ts | 14 |
        | cascade-tree.test.ts | 9 |
        | null-predicate.test.ts | 10 |
        | re-delete.test.ts | 14 |
        | returning.test.ts | 5 |
        | return-value.test.ts | 5 |
        | sibling-isolation.test.ts | 13 |
        | text-predicate.test.ts | 9 |
        | transaction.test.ts | 15 |

## エラー一覧 (グループ別)

### グループ G1: `Table<具象 Columns>` → `Table<ColumnsShape>` (約 80 件)

aggregate report の G1 と同根。`db.select().from(t)` / `db.delete(t)` / `db.update(t)` / `db.insert(t)` / `tx.delete(t)` / `tx.select().from(t)` の引数に渡される具象 `Table<{ id: ...; score: ...; ... }>` が、`Table<ColumnsShape>` の index signature を満たさない。

代表例:

- `_fixtures.ts:41` `await db.insert(t).values([...])` (seededBoard helper)
- `cascade.test.ts:12,16,25,26,...` authors / books の `db.insert(...)` と `db.delete(...).where(...)`
- `cascade-tree.test.ts:11,21,23,28,...` nodes テーブル全般
- `null-predicate.test.ts:15,20,21,...` `db.insert(db.tables.t)` および `db.delete(t).where(isNull(t.tag))`
- `re-delete.test.ts:9,10,...` `db.delete(t)`, `db.update(t).set(...)`
- `returning.test.ts:10,15,20,25,30` `db.delete(t).where(...).returning()` の `t`
- `sibling-isolation.test.ts:11,15,23,24,...` board / tag 二つの table を持つ db で両方落ちる
- `text-predicate.test.ts:14,23,24,...` text column を持つ people table
- `transaction.test.ts:10,12,18,22,33,...` `tx.delete(t)`, `tx.select().from(t)`

サブパターン的に、Column 型は

- `TypedColumn<number>` (primaryKey() 付きの id, references() 付きの authorId 等)
- `Column<number>` (default 無し / 単なる integer())
- `Column<string>` (text())

が混在するが、すべて同じ「index signature 欠落」で落ちる。

### グループ G2: `unknown[]` → `{ id: number; ... }[]` (約 13 件)

`db.select().from(t)` の戻り値が `Promise<unknown[]>` (もしくは類似) と推論されており、`idsOf(rows: { id: number }[])` ヘルパに渡すと型不一致。

代表例:

- `cascade.test.ts:28` `idsOf(rows)` where `rows = await db.select().from(books)`
- `cascade.test.ts:54` 同 (transaction 後の select)
- `cascade-tree.test.ts:24,36` `idsOf(rows)`
- `null-predicate.test.ts:22,28,35` `idsOf(rows)` × 3
- `re-delete.test.ts:25,38` `idsOf(rows)`
- `sibling-isolation.test.ts:25` `idsOf(rows)`
- `text-predicate.test.ts:25,32` `idsOf(rows)`
- `transaction.test.ts:13,24,34,50` `idsOf(rows)`

`idsOf` 自体は `(rows: { id: number }[]) => ...` という型定義 (`_fixtures.ts:49`)。これに対して `db.select().from(t)` の結果が `unknown[]` に推論されているのが原因。

なお、`returning()` の戻り値や `tx.select()` の結果はテスト側で `as { id: number }[]` / `as Record<string, number>[]` でキャストして回避している (例: `returning.test.ts:10,15,20,25,30`)。一方で素の `db.select().from(t)` はキャストされておらず、ここに集中して TS2345 が出ている。

### グループ G3: 自己参照テーブル定義での implicit any (TS7022 / TS7024)

`_fixtures.ts:20-25`:

```ts
export const makeNodes = () => {
        const nodes = table('nodes', {
                id: integer('id').primaryKey(),
                parentId: integer('parent_id').references(() => nodes.id, { onDelete: 'cascade' }),
        })
        return nodes
}
```

- `_fixtures.ts(20,15)` TS7022 `'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.`
- `_fixtures.ts(22,59)` TS7024 `Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.`

これは self-referential FK を Drizzle 風に表現するときの典型的な TypeScript 限界。`.references(() => nodes.id, ...)` の lazy callback で自己参照しているため、`nodes` 変数の型推論ループが解けず implicit any。

### グループ G4: transaction の callback param が implicit any (TS7006)

`transaction.test.ts:28`:

```ts
const runner = db.transaction((tx, c) => {
        const cur = c as { id: number; score: number }
        ...
})
```

- `transaction.test.ts(28,48)` `Parameter 'tx' implicitly has an 'any' type.`
- `transaction.test.ts(28,52)` `Parameter 'c' implicitly has an 'any' type.`

`db.transaction(callback)` の callback シグネチャが overload で `(tx) => ...` と `(tx, c) => ...` の両方を許す型になっていないか、または callback の引数型注釈が完全に欠落している。他の transaction テスト (`tx => ...` の 1 引数版) では落ちていないので、おそらく `db.transaction` の型は単一引数 callback を想定している。

## 修正の方向性 hint

src 側担当 agent への hint:

1. **G1 (80 件超)**: aggregate report G1 と同じ。`Table<C extends ColumnsShape>` 制約 / `db.*` API の generic 化が根治。
2. **G2 (13 件)**: `db.select(): SelectBuilder<...>` / `.from(table: Table<C>): Promise<Row<C>[]>` のようなチェーン上で、`Row<C>` (= columns shape から各列の TS 型を抜き出した row 型) を `unknown` ではなく具体的に推論できるよう型を整える。例えば `select<P extends Projection>(p?: P): SelectBuilder<P, ...>` で projection 型を保ち、`.from(t)` で table の columns 型と合成して `Promise<RowOf<P, T>[]>` にする。
   - 一時しのぎなら test 側で `as { id: number }[]` キャストだが、テストは不変なので src 側で対応必須。
3. **G3 (2 件)**: 自己参照 FK は src 側で `references<C extends ColumnsShape>()` の引数 callback 戻り値を generic に持たせ、`table()` の戻り型を遅延解決できる形にするか、あるいは `_fixtures.ts` 側で type annotation を入れる必要がある (test 修正不可なので src 側で対応 / もしくは `table` の overload に self-ref ヘルパ追加)。
4. **G4 (2 件)**: `db.transaction` の型シグネチャに `(callback: (tx: Tx, cursor?: unknown) => Promise<R>)` のような 2 引数オーバーロードを追加。

## 観測されたまとめ

- 約 8 割は aggregate と同じ「Table 型の index signature 欠落」
- 残り 2 割の中で目立つのは「select() の戻り値が unknown[] に潰れて idsOf に渡せない」(G2)
- 純粋に test 側のコードに起因するもの (G3 の self-ref パターン) は 1 ファイル / 2 件のみ。これは Drizzle 仕様準拠の書き方なので test 改修ではなく src 側で型ヘルパを用意するのが筋。

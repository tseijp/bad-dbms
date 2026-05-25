# insert 型安全検証 report

## 検証範囲

`test/insert/` 配下の以下 11 本の `.test.ts` を対象に、プロジェクト共通の `tsconfig.json` 相当 (`strict: true` / `target: ESNext` / `module: ESNext` / `moduleResolution: Bundler` / `jsx: react-jsx`) で `tsc --noEmit` を実行した。

- `batches.test.ts`
- `column-omission.test.ts`
- `column-types.test.ts`
- `default.test.ts`
- `multi-row.test.ts`
- `read-consistency.test.ts`
- `returning.test.ts`
- `seed-helpers.test.ts`
- `single-row.test.ts`
- `table-shapes.test.ts`
- `transaction.test.ts`

補助ファイル `_fixtures.ts` も連鎖的に型解決対象となっている (テスト本体からの import 経由)。

## エラー総数

`test/insert/` 配下のみで **242 件** の型エラーを検出。

| エラーコード | 件数 | 概要 |
| --- | --- | --- |
| `TS2345` | 208 | 引数の型不一致 (`Table<...>` が `Table<ColumnsShape>` に代入不可、`Array.prototype.map` のコールバック型不一致) |
| `TS2571` | 28 | `Object is of type 'unknown'` (`db.select() ... .from(...)` の戻り行 row が `unknown` 扱い) |
| `TS7006` | 4 | `Parameter implicitly has an 'any' type` (`db.transaction((tx, _c) => ...)` の引数) |
| `TS2339` | 2 | `Property 'n' does not exist on type 'RowOfFields<{ n: SQL<number>; }>[]'` (`r.n` を配列に対して直接アクセスしている) |

### ファイル別エラー数

| ファイル | 件数 |
| --- | --- |
| `single-row.test.ts` | 28 |
| `read-consistency.test.ts` | 28 |
| `default.test.ts` | 27 |
| `column-types.test.ts` | 27 |
| `transaction.test.ts` | 24 |
| `batches.test.ts` | 24 |
| `multi-row.test.ts` | 22 |
| `column-omission.test.ts` | 21 |
| `table-shapes.test.ts` | 18 |
| `returning.test.ts` | 14 |
| `seed-helpers.test.ts` | 9 |

## グルーピング

### グループ A: `Table<具体的なカラム形>` が `Table<ColumnsShape>` に代入できない (約 200 件)

最大派閥。`db.insert(users)` / `db.select().from(users)` などテーブル参照を渡したあらゆる場所で発生。

代表メッセージ:

```
Argument of type 'Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>'
  is not assignable to parameter of type 'Table<ColumnsShape>'.
```

該当テーブル形は以下のように複数バリエーションがある (`_helpers` の `makeUsers` / `makePosts` / `makeEvents` / `makeNodes` および test 内で構築されるアドホックなテーブル):

- `{ id; name; score }` (users 系) — 124 件
- `{ id; userId; score }` (posts 系) — 16 件
- `{ id; kind; v }` — 15 件
- `{ id; v }` (`number`) — 12 件
- `{ id; v }` (`TypedColumn<number>`) — 10 件
- `{ id; seq }` — 8 件
- `{ id; v }` (`string`) — 4 件
- `{ id; parentId }` (nodes) — 4 件
- `{ id; a; b; c }` — 2 件

### グループ B: select 結果の row が `unknown` (`TS2571` 28 件)

`const rows = await db.select().from(users)` の `rows` が `unknown[]` 相当として推論されてしまい、`rows[0][key]` / `rows[0].id` 等のアクセスで「Object is of type 'unknown'」となる。`column-omission.test.ts` / `column-types.test.ts` / `default.test.ts` / `single-row.test.ts` / `read-consistency.test.ts` / `table-shapes.test.ts` に集中。

### グループ C: `Array.prototype.map((r: { id: number }) => ...)` (`TS2345` 12 件)

`rows.map((r: { id: number }) => r.id)` のように明示的に annotate された row 型が `unknown[]` の callback signature と非互換。グループ B の派生で、`rows` 全体が `unknown[]` に推論されていることに起因する。

- `(r: { id: number }) => number` — 8 件
- `(r: { v: number }) => number` — 3 件
- `(r: { v: string }) => string` / `(r: { seq: number }) => number` — 各 1 件

### グループ D: `db.transaction((tx, _c) => ...)` の暗黙 any (`TS7006` 4 件)

`transaction.test.ts` のみ。`transaction` のコールバックシグネチャが推論されず、`tx` / `_c` が `any` 扱いになる箇所が 2 ケース x 2 引数 = 4 件。

### グループ E: 集約 SELECT の戻り型の取り扱い (`TS2339` 2 件)

`read-consistency.test.ts` の 53 / 67 行目。`await db.select({ n: count() }).from(posts)` が `RowOfFields<{ n: SQL<number>; }>[]` 配列で返るのに、テストでは配列に対して `.n` をアクセスしている (`r.n`)。なお同ファイルの末尾 (96 行) では `r[0].n` という配列要素アクセスを行っており、`transaction.test.ts` でも `r[0].n` の形が使われている — つまり一部は記述自体が誤っている可能性も併存している。

## 修正の方向性 hint (test 側を直さない前提でのソース側の指摘)

> 注: テストコードは「Drizzle / SQLite の契約」「JS の自然な書き味」に合わせて書かれており、test を直すのではなく `src/` 側の型を改善する方針で読むこと。

1. **`database({ ... })` から取り出した `db.tables.users` の型を `Table<具体的なカラム形>` のまま `db.insert` / `db.select().from()` が受理できるようにする。**
   - 現状 `db.insert(table: Table<ColumnsShape>)` 等が「`ColumnsShape` 制約」ではなく「`ColumnsShape` への代入」を要求しているため、`Table<{ id: TypedColumn<number>; ... }>` 側に index signature が無く失敗している。
   - 受け側を `<T extends ColumnsShape>(table: Table<T>) => ...` のジェネリックに変える、または `Table` の `extends ColumnsShape` 制約を緩める/index signature を持たせるのが定石。
   - これだけでグループ A の約 200 件と、波及するグループ B / C の合計 約 30 件が消える見込み。

2. **`db.select().from(table)` の戻り型を `Promise<RowOf<T>[]>` まで伝播させる。**
   - グループ A を直すとテーブルの具体型が `db.select` チェーンを通って `rows` に届くため、`rows[0].id` 等が型付き row として解決され、グループ B の 28 件と、それに紐づく `map((r: { id: number }) => ...)` の 12 件もまとめて解消する。

3. **`db.transaction(callback)` のコールバック引数 `tx` / `_c` の型を明示する。**
   - `transaction: <R>(cb: (tx: TxClient, c: TxContext) => R | Promise<R>) => Runner<R>` のように `tx` / 第二引数を型付きにすれば `TS7006` (4 件) は消える。
   - 併せて `runner.run()` の呼び出し方も test の前提 (`runner = db.transaction(...)`; `await runner.run()`) に整合するシグネチャに揃える必要がある。

4. **集約 select の戻り型と「配列 / 単一」の規約を整理する。**
   - `db.select({ n: count() }).from(t)` の戻りが配列なら test 53 / 67 行目の `r.n` 直接アクセスはテスト側の (スキップ済) ロジックバグ。test ファイルでは `.skip` が付いているため実行はされないが、型チェックは走るのでエラーとして上がっている。
   - 同ファイル末尾や `transaction.test.ts` では `r[0].n` という配列要素アクセスを採用しているため、`src/` の戻り型としては配列方向で確定するのが妥当。
   - test 自体は変更しないが、`.skip` 部の整合は本質ではないため、型契約は「配列」で固める前提で OK。

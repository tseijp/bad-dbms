# select 型安全検証 report

## 検証範囲

`projects/bad-dbms/test/select/` 配下の以下ファイルに対し、`--strict` 付き tsc を実行した。

- `test/select/aggshape.test.ts`
- `test/select/alias.test.ts`
- `test/select/distinct.test.ts`
- `test/select/expr.test.ts`
- `test/select/helpers.ts`
- `test/select/select1.test.ts`
- `test/select/select2.test.ts`
- `test/select/select3.test.ts`

実行コマンド (`projects/bad-dbms` 直下):

```
npx tsc --noEmit --strict --target ESNext --module ESNext --moduleResolution Bundler --jsx react-jsx --jsxImportSource react --skipLibCheck --lib ESNext,DOM test/select/*.test.ts
```

## エラー総数

`test/select/` 配下のみで **108 件**。すべて `error TS2345` (引数型の不整合) で、`src/` 内のエラーは対象外として除外している。

### ファイル別件数

| ファイル                          | 件数 |
| --------------------------------- | ---: |
| `test/select/select3.test.ts`     |   24 |
| `test/select/select2.test.ts`     |   17 |
| `test/select/select1.test.ts`     |   16 |
| `test/select/expr.test.ts`        |   16 |
| `test/select/alias.test.ts`       |   15 |
| `test/select/aggshape.test.ts`    |   13 |
| `test/select/distinct.test.ts`    |    4 |
| `test/select/helpers.ts`          |    3 |

## エラー一覧 (代表)

すべて以下の同型シグネチャ違反である。代表だけ抜粋する (他はすべて同じ形状)。

- `aggshape.test.ts:17:69` — `db.select({ n: count() }).from(users)` の `users` がアサインできない
- `alias.test.ts:17:75` — `db.select({ score: users.score }).from(users)` の `users`
- `alias.test.ts:89:73` — `db.select({ tag: items.label }).from(items)` の `items` (text 列を持つテーブル)
- `distinct.test.ts:18:42` — `db.insert(t).values(rows)` の `t`
- `distinct.test.ts:75:53` — `db.select().from(users)` の `users`
- `expr.test.ts:18:84` — `db.select({ doubled: users.score.mul(2) }).from(users)` の `users`
- `helpers.ts:17:25` — `db.insert(users).values(USERS_SEED)` の `users` (users fixture)
- `helpers.ts:24:25` — `db.insert(events).values(EVENTS_SEED)` の `events` (events fixture)
- `helpers.ts:38:42` — `db.insert(items).values(data as any)` の `items` (labels fixture)
- `select1.test.ts:48:53` — `db.select().from(db.tables.users)` の `users`
- `select2.test.ts:15:69` — `db.select({ id: users.id }).from(users)` の `users`
- `select3.test.ts:55:33` — `db.insert(users).values(USERS_SEED)` の `users`

(残りの 96 件もすべて、`db.select(...).from(<table>)` または `db.insert(<table>).values(...)` の **引数 table** が `Table<ColumnsShape>` パラメータに対して invariant に互換性なしと判定されたもの。)

## グルーピング

エラーは **`error TS2345` 1 種類のみ** だが、引数 table の具象シェイプで 3 系統に分かれる。

### グループ A: users テーブル系 (主要)

メッセージの骨格:

```
Argument of type 'Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>'
 is not assignable to parameter of type 'Table<ColumnsShape>'.
  Type 'Table<{ ... }>' is not assignable to type 'ColumnsShape'.
    Index signature for type 'string' is missing in type 'TableBase<{ ... }> & { id: ...; name: ...; score: ...; }'.
```

該当数: 約 80 件 (aggshape / alias / expr / select1〜3 / helpers の `seedUsers`)。

### グループ B: events テーブル系 (`kind: Column<number>; v: Column<number>`)

`helpers.ts:24:25`, `select1.test.ts:53:53`, `select3.test.ts:57:58` の 3 件。
同じく `Table<{ id: ...; kind: ...; v: ... }>` が `Table<ColumnsShape>` に non-assignable。

### グループ C: items / 動的テーブル系 (text 列または ad-hoc 構成)

text 列 `label: Column<string>` を持つテーブル (`seedLabels`) と、distinct テスト内でローカル定義する `{ id, v }` / `{ id, a, b }` テーブルなど。
該当数: 約 11 件 (alias の text 列 / distinct / select1, 2 の items / helpers.ts:38)。

### 根本原因

`db.select().from(...)` および `db.insert(...).values(...)` の 引数型は **`Table<ColumnsShape>` を invariant に要求** している (内部の `ColumnsShape` は `{ [k: string]: Column }` のインデックスシグネチャ型と推定される)。

`table('users', { id: integer('id').primaryKey(), ... })` が返すのは具象な `Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number> }>` で、これは TypeScript の構造的部分型では `ColumnsShape` (string index signature 必須) に**降格できない**。

つまり「具象 columns 形 → string index 形」への暗黙降格が許されず、型変数の variance かパラメータ型のいずれかに不備がある。

## 修正の方向性 hint

テスト側を書き換えるのは禁止 (今回の対象外) なので、`src/` 側の API シグネチャを以下のいずれかで緩める方向が無難 (実装は agent A の担当):

1. `from`, `insert` 等の引数型を `Table<ColumnsShape>` ではなく `Table<any>` ないし `Table<ColumnsShape> | Table<{ [k: string]: Column }>` の上位境界に変える。
2. `Table<T>` 自体に `[k: string]: Column` のインデックスシグネチャを含めるか、`TableBase<T>` を `T & { [k: string]: Column }` 互換に整える。
3. 受け側を generic に取り、`<T extends ColumnsShape>(t: Table<T>) => ...` のように **共変位置で受ける**。これが Drizzle 風で最も読みやすい。

特に (3) の generic 化は、`db.select(...).from(users)` の戻り値型を `users` のシェイプから推論する将来形にも繋がるため、本テスト群の他の挙動 (alias による row key 推論 など) と相性が良い。

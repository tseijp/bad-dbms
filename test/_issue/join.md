# join 型安全検証 report

## 検証範囲

`test/join/` 配下の以下 8 本の `.test.ts` を対象に `tsc --noEmit` を実行 (`strict: true` / `target: ESNext` / `module: ESNext` / `moduleResolution: Bundler` / `jsx: react-jsx`)。

- `fulljoin.test.ts`
- `innerjoin.test.ts`
- `joinchain.test.ts`
- `joinproj.test.ts`
- `leftjoin.test.ts`
- `onetomany.test.ts`
- `rightjoin.test.ts`
- `selfjoin.test.ts`

共通ヘルパ `helpers.ts` は test 本体から import されているため、同ファイル内の型エラーも `test/join/helpers.ts` として連鎖検出されている。

## エラー総数

`test/join/` 配下のみで **78 件** の型エラーを検出。全てが `TS2345`。

| エラーコード | 件数 | 概要 |
| --- | --- | --- |
| `TS2345` | 78 | `Table<具体的なカラム形>` が `Table<ColumnsShape>` に代入不可 |

### ファイル別エラー数

| ファイル | 件数 |
| --- | --- |
| `joinchain.test.ts` | 15 |
| `innerjoin.test.ts` | 10 |
| `helpers.ts` | 10 |
| `leftjoin.test.ts` | 9 |
| `joinproj.test.ts` | 9 |
| `onetomany.test.ts` | 8 |
| `selfjoin.test.ts` | 7 |
| `rightjoin.test.ts` | 5 |
| `fulljoin.test.ts` | 5 |

## グルーピング

### グループ A: `Table<具体的なカラム形>` が `Table<ColumnsShape>` に代入不可 (全 78 件)

`insert` feature と全く同根。`db.insert(table)` / `db.select(...).from(table)` 等にテーブル参照を渡すと `Table<{ id: TypedColumn<number>; ... }>` が `Table<ColumnsShape>` に代入できず弾かれる。

ヘルパ `seedUsersPosts` / `seedThreeTables` / `seedPair` / `seedNodeChain` のいずれを使うかでテーブル形が変わるだけで、メッセージ系統は同じ。

代表メッセージ:

```
Argument of type 'Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number>; }>'
  is not assignable to parameter of type 'Table<ColumnsShape>'.
```

| テーブル形 | 件数 | 由来ヘルパ |
| --- | --- | --- |
| `{ id; name; score }` (users) | 43 | `seedUsersPosts` / `seedUsersPostsWithOrphan` / `seedThreeTables` |
| `{ id; lv }` (seedPair の `l`) | 19 | `seedPair` |
| `{ id; parentId }` (nodes) | 7 | `seedNodeChain` |
| `{ id; userId; score }` (posts) | 5 | `seedUsersPosts` 系 |
| `{ id; postId; label }` (tags) | 2 | `seedThreeTables` |
| `{ id; fk; rv }` (seedPair の `r`) | 2 | `seedPair` |

`helpers.ts` 自身でも `db.insert(users).values(USERS_SEED)` などをまとめて行うため、テスト本体だけでなくヘルパ内でも同じエラーが 10 件発生している。

### 注: join 機能そのものの型は本テストでは検出されていない

`helpers.ts` 内で `innerJoin / leftJoin / rightJoin / fullJoin` は `(b: any, right: any, on: any) => b.<method>(right, on)` のように **意図的に any 経由** で呼び出されている (該当コメント: 「reached untyped so a missing method is a runtime honest fail rather than a compile error」)。
そのため join API 側の型契約 (戻り行のキー、null fill、predicate の型 など) は tsc では検出されておらず、見えているのは全て「テーブル参照を builder に渡す段階」のグループ A に閉じる。

## 修正の方向性 hint

> 注: テストコードは変更しない前提。`src/` 側の型契約を改善する観点。

1. **insert feature と同じ「`Table<ColumnsShape>` 代入問題」の解消が最優先で、それだけで全 78 件が解消する。**
   - `db.insert` / `db.select(...).from` / その他 builder 入口を `<T extends ColumnsShape>(table: Table<T>) => ...` のジェネリックに直すか、`Table` の `extends ColumnsShape` 制約 / index signature の付与で受理可能にする。
   - `insert.md` の修正案 1 と完全に同じパッチで全件カバー可能。

2. **join builder 側の型は本検証では何も見えていないため、別途 helper の `any` を剥がしたバージョンでの検証が必要。**
   - 今回は `helpers.ts` が `any` で逃しているため tsc では落ちないが、ランタイムでは「未実装」「シグネチャ不一致」が起こり得る。
   - test を変えずに join 系の型契約を強める場合は、`src/` 側で `SelectBuilder` が `innerJoin` / `leftJoin` / `rightJoin` / `fullJoin` を返り型 (joined row 型 / 元 table の null union 等) 込みで定義する必要があるが、今回の tsc 結果からは具体的な不整合は読み取れない。

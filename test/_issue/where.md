# where 型安全検証 report

## 検証範囲

`projects/bad-dbms/test/where/` 配下の以下ファイルに対し、`--strict` 付き tsc を実行した。

- `test/where/_fixtures.ts`
- `test/where/arithmetic-expression.test.ts`
- `test/where/between.test.ts`
- `test/where/comparison.test.ts`
- `test/where/logical.test.ts`
- `test/where/null-predicates.test.ts`
- `test/where/row-shape.test.ts`
- `test/where/set-membership.test.ts`
- `test/where/successive-queries.test.ts`
- `test/where/text-predicates.test.ts`
- `test/where/transaction.test.ts`
- `test/where/two-columns.test.ts`

実行コマンド (`projects/bad-dbms` 直下):

```
npx tsc --noEmit --strict --target ESNext --module ESNext --moduleResolution Bundler --jsx react-jsx --jsxImportSource react --skipLibCheck --lib ESNext,DOM test/where/*.test.ts
```

## エラー総数

`test/where/` 配下のみで **305 件**。

### エラーコード分布

| TS code   | 件数 | 概要 |
| --------- | ---: | ---- |
| `TS2345`  |  301 | 引数型ミスマッチ。内訳: `Table<...>` → `Table<ColumnsShape>` 系 173 件、`unknown[]` → `{ id: number }[]` 等 128 件 |
| `TS2769`  |    2 | overload 解決失敗 (`Object.keys(r)` などに `unknown` を渡せない) |
| `TS18046` |    2 | `'a' is of type 'unknown'` (sort callback の `a.id - b.id`) |

### ファイル別件数

| ファイル                                       | 件数 |
| ---------------------------------------------- | ---: |
| `test/where/logical.test.ts`                   |   46 |
| `test/where/successive-queries.test.ts`        |   35 |
| `test/where/between.test.ts`                   |   34 |
| `test/where/comparison.test.ts`                |   34 |
| `test/where/set-membership.test.ts`            |   32 |
| `test/where/null-predicates.test.ts`           |   31 |
| `test/where/arithmetic-expression.test.ts`     |   30 |
| `test/where/text-predicates.test.ts`           |   25 |
| `test/where/two-columns.test.ts`               |   18 |
| `test/where/row-shape.test.ts`                 |   11 |
| `test/where/transaction.test.ts`               |    9 |

(`test/where/_fixtures.ts` はテーブル定義を含まず、純ヘルパのため 0 件)

## エラー一覧 (代表)

### `Table<{...}>` not assignable to `Table<ColumnsShape>` (173 件)

`db.select().from(<table>)` のすべての呼び出しで再発。代表のみ抜粋:

- `arithmetic-expression.test.ts:13:25` — local `seededNullableScore` の `db.insert(db.tables.t).values(...)`
- `arithmetic-expression.test.ts:26:33` — `db.select().from(users).where(gt(users.score.add(5), 20))`
- `between.test.ts:*` — 全 `db.select().from(users|posts)` 呼び出し
- `comparison.test.ts:*` — 同上
- `logical.test.ts:*` — `and/or/not` を組み合わせた 全 `from(users|posts)` 呼び出し
- `null-predicates.test.ts:*` — `isNull/isNotNull` 系 (内部で nullable table fixture を局所定義)
- `set-membership.test.ts:*` — `inArray/notInArray`
- `successive-queries.test.ts:*` — 連続クエリ
- `text-predicates.test.ts:*` — `like/notLike/ilike` 系 (text 列)
- `two-columns.test.ts:*` — 2 列予測 (`gt(t.a, t.b)` 等)
- `transaction.test.ts` — `db.select().from(users)` および `tx.select().from(users)` (例外的に内部で局所 cast `found as { id: number }[]` 済みで残り 9 件のみ)

### `unknown[]` → `{ id: number }[]` (128 件)

`db.select().from(t).where(...)` の戻りが `unknown[]` で、ヘルパ `idsOf`, `scoresOf` の引数 `{ id: number }[]` / `{ score: number }[]` に渡せない。

代表:

- `arithmetic-expression.test.ts:28:30` — `expect(idsOf(bonused)).toEqual([2, 3])`
- `between.test.ts:25:30` 等
- `comparison.test.ts:30:30` 等
- `successive-queries.test.ts:*` 多数

### `row-shape.test.ts` の TS2769 / TS18046 (4 件)

- `row-shape.test.ts:17:58` (TS18046): `[...rows].sort((a, b) => a.id - b.id)` の `a`, `b` が `unknown`
- `row-shape.test.ts:17:65` (TS18046): 同上 `b`
- `row-shape.test.ts:28:61` (TS2769): `rows.map((r) => Object.keys(r).sort().join(','))` の `Object.keys(r)` に `unknown` を渡せない
- `row-shape.test.ts:35:44` (TS2769): `all.find((r: { id: number }) => r.id === 1)` の predicate が `unknown[].find` のオーバーロードと噛み合わない

これらはすべて **B (select 戻りが `unknown[]`)** の連鎖。

## グルーピング

### グループ A: `Table<T>` invariance (173 件)

select / transaction / update report と完全に同じ根本問題。`from(t)` が `Table<ColumnsShape>` を invariant に要求し、`table(...)` 由来の具象型 `Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number> }>` などが降格できない。

where 固有要素として:

- `where(...)` の引数 (`eq`, `gt`, `lt`, `between`, `and`, `or`, `not`, `like`, `inArray`, `isNull` 等) は **すべて型エラーになっていない**。つまり SQL predicate ファクトリの引数型は十分に緩く設計されている。
- 同様に `users.score.add(5)` のような expression chain も TS では通っている。問題は `.from(table)` のみ。

### グループ B: `db.select().from(t)` が `unknown[]` を返す (128 件 + 連鎖 4 件)

select / transaction / update report と同根本。`.from(t)` の戻り row 型が立たないため、`rows.map(r => r.id)`, `[...rows].sort((a,b) => a.id - b.id)`, `Object.keys(rows[0])` のような row レベル操作が一律に失敗する。

`test/where/_fixtures.ts` のヘルパ:

```ts
export const idsOf = (rows: { id: number }[]) => rows.map(...)
export const scoresOf = (rows: { score: number }[]) => rows.map(...)
```

が `{ id: number }[]` / `{ score: number }[]` を期待しているため、`unknown[]` を渡すと TS2345 が量産される。

### グループ C: `transaction.test.ts` の内部 cast (グループ B を回避)

`transaction.test.ts` は **テスト側で `as { id: number }[]` 等の局所 cast を毎回掛けている** ため、where では `from()` 経由の TS2345 のみが 9 件残るにとどまる。
他ファイル (cast を掛けていない) との対比から、cast の有無で B グループ件数が大きく変わることが分かる。

### グループ D: `successive-queries.test.ts` の連続性 (35 件)

`logical.test.ts` 46 件に次ぐ第 2 位の件数。同一テーブル → 連続 select の組合せが多く、`from(t)` 呼び出し回数自体が多いため A + B 双方が同時に重なる。本質的にはグループ A / B と同じ問題で固有原因なし。

## 修正の方向性 hint

すべて `src/` 側の API シグネチャ調整で吸収できる。select / transaction / update report と同じ修正で 99% 解消する。

1. **(最優先) `Table<ColumnsShape>` invariance の解消**: `from`, `insert`, `update`, `delete` の table 引数を `<T extends ColumnsShape>(t: Table<T>)` の generic 形に。グループ A 173 件解消。

2. **`from(t).where(...)` の row 推論**: 上記と組で `from<T>(t: Table<T>): Query<RowOf<T>>` 形にし、`where(...)` chain でも row 型を維持する。これでグループ B 128 件 + row-shape 連鎖 4 件 (TS18046, TS2769) も解消。

3. (where 固有の課題は無し) `where` 周りの predicate ファクトリ (`eq/gt/lt/between/inArray/like/isNull/and/or/not` ...) は型エラーゼロなので、今回の検証範囲では追加修正不要。

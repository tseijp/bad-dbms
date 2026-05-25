# update 型安全検証 report

## 検証範囲

`projects/bad-dbms/test/update/` 配下の以下ファイルに対し、`--strict` 付き tsc を実行した。

- `test/update/_fixtures.ts`
- `test/update/expression-setter.test.ts`
- `test/update/literal-set.test.ts`
- `test/update/multi-column.test.ts`
- `test/update/multi-row.test.ts`
- `test/update/null-and-constraints.test.ts`
- `test/update/repeated.test.ts`
- `test/update/return-value.test.ts`
- `test/update/transaction.test.ts`
- `test/update/untouched-rows.test.ts`
- `test/update/visible-to-reads.test.ts`

実行コマンド (`projects/bad-dbms` 直下):

```
npx tsc --noEmit --strict --target ESNext --module ESNext --moduleResolution Bundler --jsx react-jsx --jsxImportSource react --skipLibCheck --lib ESNext,DOM test/update/*.test.ts
```

## エラー総数

`test/update/` 配下のみで **197 件**。

### エラーコード分布

| TS code   | 件数 | 概要 |
| --------- | ---: | ---- |
| `TS2345`  |  189 | 引数型ミスマッチ。内訳: `Table<...>` → `Table<ColumnsShape>` 系 145 件、`unknown[]` → 期待 row 型系 44 件 |
| `TS7006`  |    4 | implicit `any` (`db.transaction((tx, c) => ...)` per-row tick の引数) |
| `TS2769`  |    2 | overload 解決失敗 (`rows.find` / `rows.filter` の predicate と `unknown[]` の不一致) |
| `TS2571`  |    2 | `Object is of type 'unknown'` (`before[0].score` のアクセス) |

### ファイル別件数

| ファイル                                    | 件数 |
| ------------------------------------------- | ---: |
| `test/update/transaction.test.ts`           |   31 |
| `test/update/null-and-constraints.test.ts`  |   28 |
| `test/update/expression-setter.test.ts`     |   25 |
| `test/update/repeated.test.ts`              |   21 |
| `test/update/literal-set.test.ts`           |   19 |
| `test/update/visible-to-reads.test.ts`      |   18 |
| `test/update/untouched-rows.test.ts`        |   16 |
| `test/update/multi-column.test.ts`          |   15 |
| `test/update/multi-row.test.ts`             |   12 |
| `test/update/return-value.test.ts`          |   11 |
| `test/update/_fixtures.ts`                  |    1 |

## エラー一覧 (代表)

### `Table<{...}>` not assignable to `Table<ColumnsShape>` (145 件)

`db.insert(t)`, `db.update(t).set(...).where(...)`, `db.select().from(t)`, `tx.update(t)` のすべてで再発。代表のみ抜粋:

- `_fixtures.ts:37:25` — seeded helper の `db.insert(t).values([...])`
- `expression-setter.test.ts:12:25` — local `seededNullableScore` の `db.insert(...).values(...)`
- `expression-setter.test.ts:21:33` — `db.update(t).set({ score: t.score.add(1) })`
- `literal-set.test.ts:13:33` — `db.update(t).set({ score: value }).where(eq(t.id, id))`
- `multi-column.test.ts:9:33` — `db.update(t).set({ name: 111, score: 222 }).where(...)`
- `multi-row.test.ts:9:33` — `db.update(t).set({ score: 7 }).where(gt(t.id, 0))`
- `null-and-constraints.test.ts:14:25` — `db.insert(db.tables.t).values(...)`
- `null-and-constraints.test.ts:36:33` — `db.update(t).set({ score: null }).where(...)`
- `null-and-constraints.test.ts:62:33` — `db.update(t).set({ label: null }).where(...)` (constraint test)
- `return-value.test.ts:20:39` — `db.update(t).set({ score: 1 }).where(pred(t))`
- `transaction.test.ts:10:41` — `tx.update(t).set({ score: 50 }).where(eq(t.id, 1))`
- `visible-to-reads.test.ts:9:33` — `db.update(t).set({ score: 999 }).where(...)`

### `unknown[]` → `Record<string, unknown>[]` / `{ id: number }[]` 等 (TS2345 系派生、44 件)

`db.select().from(t)` の戻りが `unknown[]` で、`rowById`, `scoresInIdOrder` 等のヘルパに渡せない。

- `expression-setter.test.ts:23:40` / `32:40` 等 — `scoresInIdOrder(rows)` 呼び出し
- `literal-set.test.ts:15:38` 等 — `rowById(rows, id)` 呼び出し
- `multi-column.test.ts:11:38` 等
- `multi-row.test.ts:11:40` 等
- `repeated.test.ts:22:38` 等
- `transaction.test.ts:13:38` 等
- `untouched-rows.test.ts:11:25` 等

### `transaction.test.ts` の implicit any (TS7006, 4 件)

per-row tick (2 引数版 `db.transaction((tx, c) => ...)`) の引数が推論されない。

- `transaction.test.ts:42:48` / `42:52` — `(tx, c) => tx.update(t).set({ score: 0 }).where(eq(t.id, (c as { id: number }).id))`
- `transaction.test.ts:54:48` / `54:52`

### overload failure & unknown 連鎖 (TS2769, TS2571 計 4 件)

- `multi-column.test.ts:41:44` (TS2769): `rows.every((r: { name: number; score: number }) => ...)` を `unknown[]` の `.every` に渡せない
- `return-value.test.ts:42:46` (TS2769): `rows.filter((r: { score: number }) => r.score === 77)` を `unknown[]` の `.filter` に渡せない
- `visible-to-reads.test.ts:36:25` / `36:42` (TS2571): `expect([before[0].score, after[0].score])...` — `before[0]` が `unknown` のため `.score` 不可

## グルーピング

### グループ A: `Table<T>` invariance (主要原因、約 145 件)

select / transaction report と完全に同じ根本問題。`db.update(t)`, `db.insert(t)`, `db.select().from(t)`, `tx.update(t)` のすべてで再発。
update には固有事情として `.set({ ... })` の引数も介在するが、こちらでは型エラーになっていない (`set` の引数型が緩いか `any` 受け、と推定)。

特に `null-and-constraints.test.ts` では `db.update(t).set({ score: null })`, `db.update(t).set({ label: null })` のように **`null` 値の混入** があるが、これも TS エラーは出ていない。つまり `set` の値型は `null` を許容する形になっており、`notNull` 制約のテストは型ではなくランタイム挙動側で評価する設計になっている。

### グループ B: `db.select().from(t)` が `unknown[]` を返す (約 44 件 + 連鎖 4 件)

select / transaction report と同根本。`db.select().from(t)` の戻りが `unknown[]` で row 型を持たないため:

- ヘルパ `rowById`, `scoresInIdOrder` に渡せない
- `rows.find`, `rows.filter`, `rows.every` の predicate がマッチしない
- `before[0].score` 等のインデックスアクセスが `unknown` で .score できない

このグループは A が解消されれば連鎖的に消える可能性が高い。

### グループ C: `db.transaction` 2 引数 overload の implicit any (4 件)

transaction report と同じ問題。`transaction.test.ts:42, 54` の 2 ヶ所のみ。

### グループ D: update 戻り型の `{ changes: number }` (型上は問題なし)

`return-value.test.ts` の `result` 経由 `toMatchObject({ changes: expected })` / `result.changes` は **すべて `as { changes: number }` 局所 cast されている** ため、TS エラーは発生していない。Drizzle 風 run-result 型を src 側に持たせれば cast を畳める。

## 修正の方向性 hint

1. **(最優先) `Table<ColumnsShape>` invariance 解消**: `from`, `insert`, `update`, `delete` の table 引数を `<T extends ColumnsShape>(t: Table<T>)` の generic 形に再宣言。select / transaction report と同じ修正で update のグループ A 145 件が消える。

2. **`select().from(t)` の row 推論**: (1) と組で `from<T>(t: Table<T>) => Query<RowOf<T>>` 形にすれば、グループ B の 44 件 + 連鎖 4 件 (TS2571 / TS2769 各 2) も消える。

3. **`update(t).set(...)` の column 型整合**: `set` の引数を `Partial<RowOf<T>>` 派生にし、`null` / expression node の両方を許容する union を設計する。現状すでに緩いため緊急性は低いが、`set({ label: null })` の null は **`label` が `text().notNull()` なら型で弾く** のが理想。テストでは `notNull` 違反を **ランタイムで rejects する** ことを期待しているため、型で弾きすぎないバランスが必要。

4. **`db.transaction((tx, c) => ...)` の overload**: transaction report と同じ修正。`per-row tick` overload に row 型を持たせれば 4 件解消。

5. **`update().returning()`**: テスト側は `as Record<string, number>[]` 等で局所 cast されているため、型エラーは出ていない。row 型を `(1)+(2)` で持たせれば cast 削減可。

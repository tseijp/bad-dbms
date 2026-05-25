# transaction 型安全検証 report

## 検証範囲

`projects/bad-dbms/test/transaction/` 配下の以下ファイルに対し、`--strict` 付き tsc を実行した。

- `test/transaction/_fixtures.ts`
- `test/transaction/commit.test.ts`
- `test/transaction/explicit-rollback.test.ts`
- `test/transaction/isolation.test.ts`
- `test/transaction/nested.test.ts`
- `test/transaction/per-row-tick.test.ts`
- `test/transaction/read-your-writes.test.ts`
- `test/transaction/return-value.test.ts`
- `test/transaction/rollback-on-throw.test.ts`

実行コマンド (`projects/bad-dbms` 直下):

```
npx tsc --noEmit --strict --target ESNext --module ESNext --moduleResolution Bundler --jsx react-jsx --jsxImportSource react --skipLibCheck --lib ESNext,DOM test/transaction/*.test.ts
```

## エラー総数

`test/transaction/` 配下のみで **99 件**。

### エラーコード分布

| TS code   | 件数 | 概要 |
| --------- | ---: | ---- |
| `TS2345`  |   81 | 引数型ミスマッチ (主に `Table<...>` → `Table<ColumnsShape>` の非互換、加えて `unknown[]` → 期待 row 型の非互換) |
| `TS7006`  |   16 | implicit `any` (`db.transaction((tx, c) => ...)` の引数推論失敗) |
| `TS2769`  |    1 | overload 解決失敗 (`rows.find(...)` の `rows` が `unknown[]` で predicate と不一致) |
| `TS2339`  |    1 | `Property 'amount' does not exist on type '{}'` (`select().from(t).where(...)` の戻り推論不在) |

### ファイル別件数

| ファイル                                       | 件数 |
| ---------------------------------------------- | ---: |
| `test/transaction/per-row-tick.test.ts`        |   20 |
| `test/transaction/rollback-on-throw.test.ts`   |   19 |
| `test/transaction/commit.test.ts`              |   16 |
| `test/transaction/isolation.test.ts`           |   14 |
| `test/transaction/read-your-writes.test.ts`    |   11 |
| `test/transaction/nested.test.ts`              |   10 |
| `test/transaction/explicit-rollback.test.ts`   |    7 |
| `test/transaction/return-value.test.ts`        |    1 |
| `test/transaction/_fixtures.ts`                |    1 |

## エラー一覧 (代表)

### 同型反復: `Table<{...}>` not assignable to `Table<ColumnsShape>` (81 件)

`db.select().from(t)`, `tx.insert(t).values(...)`, `tx.update(t).set(...)`, `tx.delete(t).where(...)` のすべてで再発する。代表のみ抜粋:

- `_fixtures.ts:21:25` — `db.insert(t).values([...])`
- `commit.test.ts:10:41` — `tx.insert(t).values({...})`
- `commit.test.ts:12:53` — `db.select().from(t)`
- `commit.test.ts:27:41` / `28:41` / `29:41` — insert / update / delete を 1 トランザクション内で連結
- `explicit-rollback.test.ts:34:49` — `tx.delete(t).where(gt(t.id, 0))`
- `nested.test.ts:24:60` — `inner.insert(t).values({...})` (nested tx)
- `read-your-writes.test.ts:14:63` — `tx.select({ n: count() }).from(t)`
- `rollback-on-throw.test.ts:11:41` 〜 `:79:53` — 全 13 件

### `unknown[]` → `Record<string, number>[]` / `{ id: number }[]` (TS2345 の派生)

`db.select().from(t)` の戻り値が `unknown[]` になっており、それを `amountsById`, `idsOf` といったヘルパが期待する row 型に流し込めない。

- `commit.test.ts:32:36` — `expect(amountsById(rows)).toEqual([...])`
- `commit.test.ts:48:30` — `expect(idsOf(rows)).toEqual([1, 2])`
- `explicit-rollback.test.ts:28:36`
- `isolation.test.ts:19:30` / `41:30` / `56:30`
- `nested.test.ts:16:30` / `31:30`
- `per-row-tick.test.ts:36:36` / `47:30`
- `rollback-on-throw.test.ts:26:36` / `36:30` / `48:36` / `81:30`

### `per-row-tick` の implicit any (TS7006, 16 件)

`db.transaction((tx, c) => { ... })` という二引数オーバーロード (per-row tick) のコールバック引数が、TS 側に推論型を持たない。

- `per-row-tick.test.ts:11:48` / `11:53` — `(_tx, _c) => ...`
- `per-row-tick.test.ts:20:48` / `20:53` — `(_tx, c) => ...`
- `per-row-tick.test.ts:28:48` / `28:52` — `(tx, c) => tx.update(t).set(...).where(...)`
- `per-row-tick.test.ts:40,52,61,72,81` の各行も同様

### `commit.test.ts:40` の overload failure (TS2769 + TS2339)

```
expect(rows.find((r: { id: number }) => r.id === 2)?.amount).toBe(99)
```

`db.select().from(t)` の戻りが `unknown[]` で `Array<T>.find` の predicate がマッチしないため:

- `commit.test.ts:40:34` (TS2769): `(r: { id: number }) => boolean` predicate を `unknown[]` の `find` に渡せない
- `commit.test.ts:40:70` (TS2339): 直後の `?.amount` が `{}` 上で参照できない

## グルーピング

### グループ A: `Table<T>` invariance (主要原因)

select 報告と全く同じ根本問題。`db.select().from(t)`, `db.insert(t).values(...)` 等が `Table<ColumnsShape>` を invariant に要求し、`table('ledger', { id, amount })` 由来の具象 `Table<{ id: TypedColumn<number>; amount: Column<number> }>` が降格できない。

### グループ B: select 戻り値の `unknown[]` 化

`db.select().from(t)` の戻り型が **任意 row 形状を持たず `unknown[]`**。
そのため `rows.map((r) => r.id)`, `rows.find(...)` のような操作も型エラー化する。

これは select 報告のグループ A の影響でもあり、`from(t)` が table 型を活用できないため戻り型推論が走らない。

### グループ C: `db.transaction` 二引数 overload の implicit any

`per-row-tick.test.ts` 全体に渡る `(tx, c) => ...` 形式の callback。
fixture 側 (_fixtures.ts) では正常に `db.transaction(async (tx) => ...)` の **一引数 overload** は推論できているが、`(tx, c) => ...` の **二引数 overload (per-row tick)** だけが型注釈なしになっている。

### グループ D: `commit.test.ts:40` の連鎖

グループ B (select 戻りが `unknown[]`) と組み合わさり、`rows.find(...)?.amount` のような chain で TS2769 / TS2339 を併発させる典型ケース。これ単体で 2 件。

## 修正の方向性 hint

すべての修正は `src/` 側の API シグネチャ調整で吸収できる範囲。

1. **`Table<ColumnsShape>` invariance の解消** (select report と同じ): `from`, `insert`, `update`, `delete` の table 引数を generic `<T extends ColumnsShape>(t: Table<T>) => ...` 形に再宣言する。これでグループ A は消える。

2. **`select().from(t)` の戻り型を `T` から導出**: `(1)` ができれば、`from<T>(t: Table<T>): Query<RowOf<T>>` の形で row 型を持たせ、グループ B の `unknown[]` も解消される。グループ D も連鎖で消える。

3. **`db.transaction` の overload を整理**: `_fixtures.ts` の `await db.transaction(async (tx) => ...)` (1 引数版) は通っているので、2 引数版 `db.transaction((tx, c) => ...)` の overload 宣言を追加し、`c` の型 (table の row 型) を per-row tick 仕様 (現在の row proxy) として exposed する必要がある。`per-row-tick.test.ts` 内ではテスト側で `c as { id: number; amount: number }` と局所 cast しているので、`c: unknown` (もしくは `c: any`) であっても TS7006 だけは消せる。最終形は `c: RowOf<PrimaryTable>` が望ましい。

4. なお nested transactions (`tx.transaction(...)`) はテスト側で全て `(tx as { transaction: ... })` で局所 cast 済みのため型エラーは出ていない。これは src 側に未公開 API があることを示唆しており、公開時にシグネチャを揃えると cast を畳める。

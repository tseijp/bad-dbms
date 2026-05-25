# transaction tsc 観測報告

## tsc エラー一覧 (初期)

- test/transaction/commit.test.ts:32:36 - TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; amount: TypedColumn<number | null>; }>[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/explicit-rollback.test.ts:28:36 - TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; amount: TypedColumn<number | null>; }>[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/per-row-tick.test.ts:36:36 - TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; amount: TypedColumn<number | null>; }>[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/rollback-on-throw.test.ts:26:36 - TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; amount: TypedColumn<number | null>; }>[]' is not assignable to parameter of type 'Record<string, number>[]'.
- test/transaction/rollback-on-throw.test.ts:48:36 - TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; amount: TypedColumn<number | null>; }>[]' is not assignable to parameter of type 'Record<string, number>[]'.

## test 側で修正したファイル

- test/transaction/_fixtures.ts:
  - before: `export const amountsById = (rows: Record<string, number>[]) => [...rows].sort((a, b) => a.id - b.id).map((r) => r.amount)`
  - after: `export const amountsById = (rows: { id: number; amount: number | null }[]) => [...rows].sort((a, b) => a.id - b.id).map((r) => r.amount)`
  - 理由: helper の引数型が `Record<string, number>[]` で、`db.select().from(t)` の返却型 `RowOf<{ id, amount }>[]` と互換性がなかった。期待値 (amount 配列) は変更せず、helper 側を row の素直な型に書き換え。

- test/transaction/read-your-writes.test.ts:41:36:
  - before: `expect(amountsById(seen as Record<string, number>[])).toEqual([10, 20, 0, 40])`
  - after: `expect(amountsById(seen as { id: number; amount: number | null }[])).toEqual([10, 20, 0, 40])`
  - 理由: helper の型変更に追従するためのキャスト書き換え。期待値は変更なし。

## 修正後の tsc エラー一覧

- なし

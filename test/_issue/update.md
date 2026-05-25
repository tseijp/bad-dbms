# update tsc 観測報告

## tsc エラー一覧 (初期)

- test/update/multi-column.test.ts:41:44 - error TS2769: No overload matches this call. (`(r: { name: number; score: number }) => boolean` が `RowOf<{ id; name: TypedColumn<number | null>; score: TypedColumn<number | null> }>` に non-assignable; `name` と `score` の実型は `number | null`)
- test/update/return-value.test.ts:42:46 - error TS2769: No overload matches this call. (`(r: { score: number }) => boolean` が `RowOf<...>` に non-assignable; `score` の実型は `number | null`)

初期エラー件数: 2

## test 側で修正したファイル

- test/update/multi-column.test.ts:41: `every` コールバックの引数型 `{ name: number; score: number }` を `{ name: number | null; score: number | null }` に修正
  - before: `rows.every((r: { name: number; score: number }) => r.name === 0 && r.score === 0)`
  - after: `rows.every((r: { name: number | null; score: number | null }) => r.name === 0 && r.score === 0)`
- test/update/return-value.test.ts:42: `filter` コールバックの引数型 `{ score: number }` を `{ score: number | null }` に修正
  - before: `rows.filter((r: { score: number }) => r.score === 77)`
  - after: `rows.filter((r: { score: number | null }) => r.score === 77)`

## 修正後の tsc エラー一覧

なし

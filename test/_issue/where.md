# where tsc 観測報告

## tsc エラー一覧 (初期)

- test/where/row-shape.test.ts:18:33 - error TS2345: Argument of type 'RowOf<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number | null>; }>[]' is not assignable to parameter of type '{ score: number; }[]'. (`scoresOf` の引数型が `{ score: number }[]` だが、行の `score` の実型は `number | null`)

初期エラー件数: 1

## test 側で修正したファイル

- test/where/_fixtures.ts: `scoresOf` の引数型を `{ score: number }[]` から `{ score: number | null }[]` に変更
  - before: `export const scoresOf = (rows: { score: number }[]) => rows.map((r) => r.score)`
  - after: `export const scoresOf = (rows: { score: number | null }[]) => rows.map((r) => r.score)`

## 修正後の tsc エラー一覧

なし

# insert tsc 観測報告

## tsc エラー一覧 (初期)

- test/insert/column-omission.test.ts:23:54 - error TS2345: Argument of type '{ id: number; score: number; }' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number | null>; }>> | InsertRowOfTable<...>[]'.
- test/insert/column-omission.test.ts:37:32 - error TS2339: Property 'v' does not exist on type 'RowOf<unknown>'.
- test/insert/column-omission.test.ts:52:24 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'RowOf<unknown>'.
- test/insert/column-omission.test.ts:58:32 - error TS2339: Property 'kind' does not exist on type 'RowOf<unknown>'.
- test/insert/column-types.test.ts:61:33 - error TS2345: Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>, index: number, array: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>[]) => number'.
- test/insert/column-types.test.ts:88:33 - error TS2345: Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>, index: number, array: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>[]) => number'.
- test/insert/column-types.test.ts:104:24 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'RowOf<{ id: TypedColumn<number>; a: TypedColumn<number | null>; b: TypedColumn<number | null>; c: TypedColumn<number | null>; }>'.
- test/insert/column-types.test.ts:117:33 - error TS2345: Argument of type '(r: { v: string; }) => string' is not assignable to parameter of type '(value: RowOf<{ id: TypedColumn<number>; v: TypedColumn<string | null>; }>, index: number, array: RowOf<{ id: TypedColumn<number>; v: TypedColumn<string | null>; }>[]) => string'.
- test/insert/default.test.ts:63:33 - error TS2345: Argument of type '(r: { seq: number; }) => number' is not assignable to parameter of type '(value: RowOf<{ id: TypedColumn<number>; seq: TypedColumn<number | null>; }>, index: number, array: RowOf<{ id: TypedColumn<number>; seq: TypedColumn<...>; }>[]) => number'.
- test/insert/default.test.ts:93:33 - error TS2345: Argument of type '(r: { v: number; }) => number' is not assignable to parameter of type '(value: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>, index: number, array: RowOf<{ id: TypedColumn<number>; v: TypedColumn<number | null>; }>[]) => number'.
- test/insert/read-consistency.test.ts:53:26 - error TS2339: Property 'n' does not exist on type '{ n: number; }[]'.
- test/insert/read-consistency.test.ts:67:26 - error TS2339: Property 'n' does not exist on type '{ n: number; }[]'.
- test/insert/seed-helpers.test.ts:38:33 - error TS2345: Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: RowOf<unknown>, index: number, array: RowOf<unknown>[]) => number'.
- test/insert/single-row.test.ts:41:24 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'RowOf<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number | null>; }>'.
- test/insert/table-shapes.test.ts:16:33 - error TS2345: Argument of type '(r: { id: number; }) => number' is not assignable to parameter of type '(value: RowOf<unknown>, index: number, array: RowOf<unknown>[]) => number'.
- test/insert/table-shapes.test.ts:57:53 - error TS2345: Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number | null>; }>> | InsertRowOfTable<...>[]'.
- test/insert/table-shapes.test.ts:66:43 - error TS2345: Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<Table<{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number | null>; }>> | InsertRowOfTable<...>[]'.

## test 側で修正したファイル

- なし

(以下の理由により test 側修正は行っていない。観測のみ。)

- `column-omission.test.ts:23` の `db.insert(users).values({ id: 1, score: 10 })` は notNull な `name` を意図的に省略する insert を投げて reject を期待するテスト。値を変えるとテスト意図 (制約違反) を壊すため変更不可。
- `column-omission.test.ts:37,52,58`、`column-types.test.ts:104`、`single-row.test.ts:41` の `rows[0].v` / `rows[0][key]` / `rows[0].kind` 等は src 側の `db.select().from(...)` 戻り値型 (`RowOf<unknown>` または columns 値が `null` 含む RowOf) によって発生する未公開フィールドアクセス。test 側で `as any` 等を入れないと通らないため見送り。
- `column-types.test.ts:61,88,117`、`default.test.ts:63,93`、`seed-helpers.test.ts:38`、`table-shapes.test.ts:16` の `rows.map((r: { v: number }) => r.v)` 系は明示的型注釈と src 側の RowOf<...> 型の構造差異により発生。注釈を外しても `r.v` アクセスでまた失敗する。`as any` を入れない限り通らないため見送り。
- `read-consistency.test.ts:53,67` は `expect(r.n).toBe(0)` だが `r` は配列。当該 `it` は `.skip` が付いており、テスト作者は Drizzle 互換 API (戻り値が単一オブジェクト) を期待してこのアクセスを書いている。assertion 内容変更禁止と意図保持の双方の観点から見送り。
- `table-shapes.test.ts:57,66` の `seed as Record<string, number>[]` 一旦外して観測したが、`it.each` の seed ユニオン型がそのまま `Argument of type '... | ... | ...' is not assignable` と別のエラーになるだけだった。改善しないため戻した。

## 修正後の tsc エラー一覧

- 初期と同一 (test 側無修正のため差分なし)

# schema tsc 観測報告

## tsc エラー一覧 (初期)

- test/schema/column-factory.test.ts:8:61 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/default-fn.test.ts:46:79 - error TS2345: Argument of type '() => number' is not assignable to parameter of type '(() => number | null) & (() => string | null)'.
- test/schema/default.test.ts:46:80 - error TS2345: Argument of type '1' is not assignable to parameter of type 'null'.
- test/schema/primary-key.test.ts:20:59 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/reference.test.ts:17:59 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/reference.test.ts:51:41 - error TS2339: Property '$meta' does not exist on type '{ name: string; }'.
- test/schema/reference.test.ts:77:23 - error TS7022: 'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- test/schema/reference.test.ts:79:67 - error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
- test/schema/reference.test.ts:85:23 - error TS7022: 'nodes' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
- test/schema/reference.test.ts:87:67 - error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
- test/schema/reference.test.ts:91:41 - error TS2339: Property '$meta' does not exist on type '{ name: string; }'.
- test/schema/table-metadata.test.ts:15:61 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/table-metadata.test.ts:16:59 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/table.test.ts:12:61 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.
- test/schema/table.test.ts:55:30 - error TS2339: Property 'userId' does not exist on type 'Table<{ id: TypedColumn<number | null>; }>'.
- test/schema/text-column.test.ts:38:33 - error TS2339: Property 'dataType' does not exist on type 'SqlNode'.
- test/schema/text-column.test.ts:42:33 - error TS2339: Property 'dataType' does not exist on type 'SqlNode'.
- test/schema/unique.test.ts:16:59 - error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'Table'.

## test 側で修正したファイル

- なし

(以下の理由により test 側修正は行っていない。観測のみ。)

- `bad.getTableColumns(t)` / `bad.getTableConfig(t)` のラッパは `t: unknown` で意図的に型を弱めており、Drizzle 互換 API がランタイムで未定義であることを honest に失敗させる狙いで書かれている。tsc を通すには `as any` 等の追加が必要で、これは「型を誤魔化す」方向の修正となるため見送り。
- `default-fn.test.ts:46` と `default.test.ts:46` は `it.each(factoryNames)` のコールバック内で factories のユニオンに対する `.default(...)` / `.$defaultFn(...)` を呼んでいる箇所で、ユニオン型のメソッドシグネチャ交差により発生している。テスト側で `as any` を加えれば消えるが、それも誤魔化し方向のため見送り。
- `reference.test.ts:51,91` の `ref.foreignTable.$meta?.name ?? ref.foreignTable.name` は API 戻り値型 (`{ name: string; }`) に `$meta` が存在しないため発生。誤魔化しの cast を追加しないと TS が通らないため見送り。
- `reference.test.ts:77,85` の `const nodes = table('nodes', { ..., parentId: integer(...).references(() => nodes.id, ...) })` は自己参照で `nodes` の型推論が再帰し implicit any になっている。型注釈を加えるには src 側の Table 型を引いてくる必要があり、test 側だけでは素直に直せないため見送り。
- `table.test.ts:55` `expect(users.userId).toBeUndefined()` は宣言されていないプロパティアクセスに対する strict 検出。`(users as any).userId` を加えれば消えるが誤魔化し方向のため見送り。
- `text-column.test.ts:38,42` `t.c.node.dataType` は API 戻り値型 `SqlNode` に `dataType` が無い。`as any` を加えないと通らないため見送り。
- いずれも src 側の型定義・公開 API シェイプの問題であり、test 側の書き換えだけでは解決できない。

## 修正後の tsc エラー一覧

- 初期と同一 (test 側無修正のため差分なし)

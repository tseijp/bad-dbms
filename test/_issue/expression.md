# expression tsc 観測報告

## tsc エラー一覧 (初期)

- test/expression/arith.test.ts:64:51 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'TypedColumn<number | null>'.
- test/expression/arith.test.ts:74:51 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'TypedColumn<number | null>'.
- test/expression/compare.test.ts:16:51 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'TypedColumn<number | null>'.
- test/expression/compare.test.ts:40:51 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'TypedColumn<number | null>'.
- test/expression/twocol.test.ts:37:51 - error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'TypedColumn<number | null>'.

初期エラー件数: 5

すべて `it.each` の引数 `method: string` を用いた動的メソッド呼び出し `column[method](arg)` 形式で `TypedColumn<number | null>` を index 不可なため発生。

## test 側で修正したファイル

- test/expression/arith.test.ts:62-67: `users.score[method](arg)` を中間変数 `col` 経由の動的アクセスに書き換え
  - before: `const rows = await db.select({ x: users.score[method](arg) }).from(users)`
  - after: `const col = users.score as unknown as Record<string, (a: number) => typeof users.score>` を用いて `col[method](arg)` で参照
- test/expression/arith.test.ts:72-77: 同上 (`t.v[method](arg)` → `col[method](arg)`, col の戻り値型は `typeof t.v`)
- test/expression/compare.test.ts:14-18: 同上 (`users.score[method](arg)` → `col[method](arg)`, 戻り値型 `typeof users.score`)
- test/expression/compare.test.ts:34-42: 同上 (`t.a[method](t.b)` → `col[method](t.b)`, 戻り値型 `typeof t.a`)
- test/expression/twocol.test.ts:31-39: 同上 (`t.a[method](t.b)` → `col[method](t.b)`, 戻り値型 `typeof t.a`)

## 修正後の tsc エラー一覧

なし

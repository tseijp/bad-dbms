# order tsc 観測報告

## tsc エラー一覧 (初期)

- test/order/multi-key.test.ts:67:58 - error TS18046: 'a' is of type 'unknown'.
- test/order/multi-key.test.ts:67:62 - error TS18046: 'b' is of type 'unknown'.
- test/order/multi-key.test.ts:99:45 - error TS2769: No overload matches this call. (`(r: { rank: number }) => boolean` is not assignable; `rank` の実型は `number | null`)
- test/order/single-key.test.ts:52:43 - error TS2345: Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<...>'.
- test/order/single-key.test.ts:52:43 - error TS2352: Conversion of readonly tuple type to 'Record<string, number>[]' may be a mistake.
- test/order/single-key.test.ts:88:43 - error TS2345: Argument of type 'Record<string, number>[]' is not assignable to parameter of type 'InsertRowOfTable<...>'.
- test/order/single-key.test.ts:88:43 - error TS2352: Conversion of readonly tuple type to 'Record<string, number>[]' may be a mistake.
- test/order/text-ordering.test.ts:10:33 - error TS2345: `() => Table<{ id; name }>` is not assignable to `() => Table<{ id; score }>` (`fresh` の `S extends ReturnType<typeof makeScored>` 制約による)
- test/order/text-ordering.test.ts:13:26 - error TS2353: 'name' does not exist in type 'InsertRowOfTable<Table<{ id; score }>>'
- test/order/text-ordering.test.ts:14:26 - error TS2353: 'name' does not exist in type 'InsertRowOfTable<Table<{ id; score }>>'
- test/order/text-ordering.test.ts:15:26 - error TS2353: 'name' does not exist in type 'InsertRowOfTable<Table<{ id; score }>>'
- test/order/text-ordering.test.ts:16:26 - error TS2353: 'name' does not exist in type 'InsertRowOfTable<Table<{ id; score }>>'
- test/order/text-ordering.test.ts:25:70 - error TS2339: Property 'name' does not exist on type 'Table<{ id; score }>'
- test/order/text-ordering.test.ts:30:71 - error TS2339: Property 'name' does not exist on type 'Table<{ id; score }>'
- test/order/text-ordering.test.ts:35:70 - error TS2339: Property 'name' does not exist on type 'Table<{ id; score }>'
- test/order/text-ordering.test.ts:39:41 - error TS2345: 同上 (`fresh(makeNamed)`)
- test/order/text-ordering.test.ts:41:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:42:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:43:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:45:70 - error TS2339: 'name' does not exist on Table
- test/order/text-ordering.test.ts:49:41 - error TS2345: 同上 (`fresh(makeNamed)`)
- test/order/text-ordering.test.ts:51:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:52:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:54:70 - error TS2339: 'name' does not exist on Table
- test/order/text-ordering.test.ts:58:41 - error TS2345: 同上 (`fresh(makeNamed)`)
- test/order/text-ordering.test.ts:60:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:61:34 - error TS2353: 'name' does not exist
- test/order/text-ordering.test.ts:63:70 - error TS2339: 'name' does not exist on Table
- test/order/text-ordering.test.ts:68:68 - error TS2339: 'name' does not exist on Table
- test/order/text-ordering.test.ts:69:71 - error TS2339: 'name' does not exist on Table

初期エラー件数: 30

## test 側で修正したファイル

- test/order/_fixtures.ts: `fresh` のジェネリック制約を `<S extends ReturnType<typeof makeScored>>` から `<S>` に変更
  - before: `export const fresh = <S extends ReturnType<typeof makeScored>>(make: () => S) => { ... }`
  - after: `export const fresh = <S>(make: () => S) => { ... }`
- test/order/single-key.test.ts:52: `seed as Record<string, number>[]` を `[...seed]` に変更 (readonly tuple の不正な cast を解消)
  - before: `await db.insert(t).values(seed as Record<string, number>[])`
  - after: `await db.insert(t).values([...seed])`
- test/order/single-key.test.ts:88: 同上
  - before: `await db.insert(t).values(seed as Record<string, number>[])`
  - after: `await db.insert(t).values([...seed])`
- test/order/multi-key.test.ts:67: `seqOf(rows, 'rank')` の戻り値が `unknown[]` のままだったため `as number[]` を追加
  - before: `const ranks = seqOf(rows, 'rank')`
  - after: `const ranks = seqOf(rows, 'rank') as number[]`
- test/order/multi-key.test.ts:99: filter のコールバック引数型 `{ rank: number }` を `{ rank: number | null }` に修正
  - before: `rows.filter((r: { rank: number }) => r.rank === 1)`
  - after: `rows.filter((r: { rank: number | null }) => r.rank === 1)`

## 修正後の tsc エラー一覧

なし

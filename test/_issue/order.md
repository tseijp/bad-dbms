# order 型安全検証 report

## 検証範囲

`test/order/` 配下の以下 12 本の `.test.ts` を対象に `tsc --noEmit` を実行 (`strict: true` / `target: ESNext` / `module: ESNext` / `moduleResolution: Bundler` / `jsx: react-jsx`)。

- `composed.test.ts`
- `expression-key.test.ts`
- `leaderboard.test.ts`
- `limit.test.ts`
- `multi-key.test.ts`
- `no-leak.test.ts`
- `null-ordering.test.ts`
- `offset.test.ts`
- `pagination.test.ts`
- `single-key.test.ts`
- `text-ordering.test.ts`
- `ties.test.ts`

共通 fixtures は `_fixtures.ts` (`makeScored` / `makeRanked` / `makeNullable` / `makeNamed` / `fresh` / `seqOf`)。

## エラー総数

`test/order/` 配下のみで **271 件** の型エラー。

| エラーコード | 件数 | 概要 |
| --- | --- | --- |
| `TS2345` | 258 | `Table<...>` の `ColumnsShape` 不一致、`seqOf(rows, key)` に `unknown[]` を渡しているなど |
| `TS2339` | 8 | `Property 'name' does not exist on type 'Table<{ id; score }>'` (text-ordering で `fresh(makeNamed)` を渡しても `Table` 型が `Scored` 固定で推論されてしまう) |
| `TS2352` | 2 | `as Record<string, number>[]` の二重ナロー時に `readonly [{...}]` ユニオン側と overlap しないと拒絶 |
| `TS18046` | 2 | `(a, b) => a - b` の `a` `b` が `unknown` |
| `TS2769` | 1 | `rows.filter((r: { rank: number }) => r.rank === 1)` の overload 不一致 (`rows` が `unknown[]`) |

### ファイル別エラー数

| ファイル | 件数 |
| --- | --- |
| `composed.test.ts` | 34 |
| `text-ordering.test.ts` | 32 |
| `pagination.test.ts` | 28 |
| `multi-key.test.ts` | 28 |
| `leaderboard.test.ts` | 27 |
| `no-leak.test.ts` | 23 |
| `limit.test.ts` | 20 |
| `offset.test.ts` | 19 |
| `null-ordering.test.ts` | 19 |
| `expression-key.test.ts` | 16 |
| `single-key.test.ts` | 14 |
| `ties.test.ts` | 11 |

## グルーピング

### グループ A: `Table<...>` が `Table<ColumnsShape>` に代入不可 (168 件)

insert / join と同根。`db.insert(t)` / `db.select().from(t)` 系で頻発。

- `{ id; score }` (scored) — 144 件
- `{ id; rank; score }` (ranked) — 24 件

代表メッセージ:

```
Argument of type 'Table<{ id: TypedColumn<number>; score: Column<number>; }>'
  is not assignable to parameter of type 'Table<ColumnsShape>'.
```

### グループ B: `seqOf(rows, key)` に `unknown[]` を渡せない (86 件)

`_fixtures.ts` の `seqOf` 第一引数が `Record<string, unknown>[]` 固定:

```ts
export const seqOf = (rows: Record<string, unknown>[], key: string) =>
        rows.map((r) => r[key])
```

一方 `db.select().from(t)` の戻り `rows` が `unknown[]` に推論されてしまうため、`seqOf(rows, 'name')` 等の全呼び出しが `Argument of type 'unknown[]' is not assignable to parameter of type 'Record<string, unknown>[]'` で落ちる。テスト 12 ファイル中ほぼ全てに分布。

### グループ C: `text-ordering.test.ts` の `fresh(makeNamed)` 推論失敗 (8 + 4 件)

`_fixtures.ts` の `fresh` シグネチャは:

```ts
export const fresh = <S extends ReturnType<typeof makeScored>>(make: () => S) => { ... }
```

つまり「`makeScored` の戻り値 (= `Table<{ id; score }>`) を extends する S」を要求しているため、`makeNamed` (`Table<{ id; name }>`) は constraint を満たさず、結果として S が `Table<{ id; score }>` に丸められて `t.name` が存在しないことになる。

- `TS2339: Property 'name' does not exist on type 'Table<{ id; score }>'` — 8 件 (text-ordering.test.ts 25/30/35/45/54/63/68/69 行)
- `TS2345: Argument of type '() => Table<{ id; name }>' is not assignable to parameter of type '() => Table<{ id; score }>'` — 4 件

### グループ D: `as const` リテラル配列の二重キャスト (TS2352 2 件)

`single-key.test.ts` 52 / 88 行目:

```ts
await db.insert(t).values(seed as Record<string, number>[])
```

`it.each([...] as const)` で `seed` が `readonly [{...}] | readonly [{...}, {...}] | ...` の細かいリテラル union として推論され、`Record<string, number>[]` への直接アサーションが「sufficiently overlap しない」と拒絶される。`unknown` 経由なら通る、というガイダンス付きの古典的な TS2352。

### グループ E: 配列メソッド callback の暗黙 unknown (TS18046 2 件 / TS2769 1 件)

- `multi-key.test.ts` 67 行 `const sorted = [...ranks].sort((a, b) => a - b)` — `seqOf` の戻り型が `unknown[]` のため `a` `b` が unknown。
- `multi-key.test.ts` 99 行 `rows.filter((r: { rank: number }) => r.rank === 1)` — `rows` が `unknown[]` のため `Array<unknown>.filter` overload と annotated callback が不一致 (TS2769)。

これらもグループ A / B の波及エラー。

## 修正の方向性 hint

> 注: テストコードは変更しない前提で `src/` 側を直す。`_fixtures.ts` も「test 配下だが基本的に触らない」前提でこの report は書いているが、`fresh` のジェネリックは明らかに `<S extends Table<any>>` で十分なため `src/` の型契約とは独立に修正可能。

1. **`Table<...>` 代入問題の解消で 168 件 (グループ A) + 86 件 (グループ B 大半) + 残波及 (TS18046 / TS2769) が一気に消える。**
   - insert / join と同様、`db.insert` / `db.select().from` を `<T extends ColumnsShape>(table: Table<T>) => ...` に。
   - `db.select().from(t)` の戻りが `RowOf<T>[]` (オブジェクト型配列) に伝播すれば、`Record<string, unknown>[]` を期待する `seqOf` に対しても代入可能になる。

2. **`_fixtures.ts` の `fresh<S extends ReturnType<typeof makeScored>>` は構造的制約が強すぎる (グループ C)。**
   - test/order/_fixtures.ts に閉じた話だが、テスト本体は無修正なので、ここの constraint を `<S extends ReturnType<typeof makeScored> | ReturnType<typeof makeRanked> | ReturnType<typeof makeNullable> | ReturnType<typeof makeNamed>>` あるいは `<S extends Table<any>>` に広げる必要がある。
   - これだけで `text-ordering.test.ts` の 12 件 (TS2339 8 + TS2345 4) が消える。
   - もし「fixtures は test 配下扱いで触らない」とするなら、`src/` の `table()` の戻り型がもっと汎用的な base に統一されるよう設計し直す方針もあり得る。

3. **`it.each([...] as const)` での `as Record<string, number>[]` (グループ D) は test 側が「あえて二重キャストでナローを潰している」ため、`src/` 側にできることは無い。**
   - test を変更できない以上、TS2352 2 件は許容するか、`insert(...).values(...)` 側が `readonly` 配列リテラル union を素直に受理できるよう値型を緩める (`ReadonlyArray<Partial<RowOf<T>>>` を受ける等) しか道は無い。後者が綺麗な解。

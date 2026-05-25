# schema 型安全検証 report

## 検証範囲

`test/schema/` 配下の以下 11 本の `.test.ts` を対象に `tsc --noEmit` を実行 (`strict: true` / `target: ESNext` / `module: ESNext` / `moduleResolution: Bundler` / `jsx: react-jsx`)。

- `column-factory.test.ts`
- `column-name.test.ts`
- `default-fn.test.ts`
- `default.test.ts`
- `not-null.test.ts`
- `primary-key.test.ts`
- `reference.test.ts`
- `table-metadata.test.ts`
- `table.test.ts`
- `text-column.test.ts`
- `unique.test.ts`

このディレクトリは「カラム / テーブル定義の構造」を観測する単体テスト群で、`db.insert(...)` などのクエリ API は使わない (= テーブル型を `Table<ColumnsShape>` パラメータに渡す箇所が無い)。そのため他 feature で頻発した `Table<...>` の代入問題はここでは現れない。テスト本体も `(t as any).score.default` のように `as any` で大胆にエスケープして書かれており、構造観測の段階で型が落ちる箇所が極端に少ない。

## エラー総数

`test/schema/` 配下のみで **5 件** の型エラー。

| エラーコード | 件数 | 概要 |
| --- | --- | --- |
| `TS2345` | 1 | `default.test.ts` 46 行: `factories[name]('score').default(1 as any)` の引数 `any` が `never` に代入不可 |
| `TS7022` | 2 | `reference.test.ts` 77 / 85 行: `nodes` 自己参照テーブル定義が初期化子内で自分自身を参照しているため implicit any |
| `TS7024` | 2 | `reference.test.ts` 79 / 87 行: 上記 `() => (nodes as any).id` の arrow が、`nodes` の implicit any を介して return type も implicit any 扱い |

### ファイル別エラー数

| ファイル | 件数 |
| --- | --- |
| `reference.test.ts` | 4 |
| `default.test.ts` | 1 |

他 9 ファイル (`column-factory` / `column-name` / `default-fn` / `not-null` / `primary-key` / `table-metadata` / `table` / `text-column` / `unique`) は **0 件** で通る。

## グルーピング

### グループ A: `factories[name]('score').default(...)` の戻り `never` (TS2345 1 件)

`default.test.ts`:

```ts
const factories = { integer, uint, float, text } as const
type FactoryName = keyof typeof factories
...
const t = table('t', {
        score: factories[name]('score').default(1 as any) // ← (46,80)
})
```

`factories[name]` は `integer | uint | float | text` の union。それぞれの factory が返す `.default(value)` パラメータ型 (`number` / `number` / `number` / `string`) の **共通部分** が `number & string = never` になるため、`1 as any` 経由でも `never` に代入できず拒絶される。
これは TypeScript の関数 union を呼ぶ時の古典的な「引数は intersection になる」問題。

### グループ B: `nodes` 自己参照テーブル定義の implicit any (TS7022 2 + TS7024 2 = 4 件)

`reference.test.ts` 77-80 行 / 85-88 行:

```ts
const nodes = table('nodes', {
        id: integer('id').primaryKey(),
        parentId: integer('parent_id').references(() => (nodes as any).id),
})
```

`nodes` の初期化子内 (`references` の thunk 内) で `nodes` を参照しているが、`table(...)` の戻り型が thunk 経由でも推論できず、TS7022 (`nodes implicitly has type 'any' because it does not have a type annotation`) と TS7024 (`Function implicitly has return type 'any'`) の組が 2 ケース x 2 種類 = 4 件。

`(nodes as any).id` で値レベルは any にしているのに self-reference のため宣言時点の型推論が解けず、`noImplicitAny` (strict) の下で落ちる。

## 修正の方向性 hint

> 注: テスト側は無修正の前提。

1. **グループ A: factory union 呼び出しの引数 intersection 問題**
   - `src/` 側でできることは、factory 群を **共通の基底シグネチャ** (`(name: string) => Column<unknown>` 等) に揃え、`.default(value)` の引数型を union メンバ間で互換にする (例: `number | string` をそのまま受ける汎用 `default` を `Column` の基底に置く) こと。
   - もしくは factory union を `as Factory` のように包んだ型エイリアスで一段抽象化し、ユーザー側で `factories[name]` が常に「ある最大共通 factory 型」を返すようにする。
   - これだけで `default.test.ts(46,80)` の 1 件が消える。
   - 影響範囲は test/schema/default.test.ts のみで、本質的な型契約への影響は小さい。

2. **グループ B: 自己参照テーブル定義の implicit any**
   - test 自身は `() => (nodes as any).id` のように self-reference 部分を `as any` で逃しているが、トップレベル `const nodes` への型注釈が無いため `noImplicitAny` で TS7022 / TS7024 が一塊で出る。
   - `src/` 側の `table(name, columns)` の戻り型を **`references` thunk を含む columns 構造から逆算しなくても確定するシグネチャ** にしておけば self-reference の implicit any は出ない。具体的には `table<T extends ColumnsShape>(name: string, columns: T): Table<T>` のように columns ジェネリックを単純な ColumnsShape にすると、thunk の中身が解決できなくても `nodes` 自身の型は `Table<...>` で確定する。
   - 4 件すべて (TS7022 2 + TS7024 2) がここで解消する。

3. **schema feature の他 9 ファイルは現状で 0 件パスしているため、特段の追加対応は不要。** ただし、これは多くのテストが `as any` を多用していることに由来しており、`src/` 側の型契約が本当に厳格 (例: `getTableColumns` の戻り型を `Record<string, Column<unknown>>` ではなく `T` に追随) になった場合、`as any` の量が減らせる余地はあると思われる。

# expression 型安全検証 report

## 検証範囲

`test/expression/` 配下のテストファイル群について、`tsc --noEmit --strict` で型検証を実施。

対象ファイル (test/expression/):

- `arith.test.ts` (算術演算子の per-row 評価)
- `chain.test.ts` (式の left-to-right chain)
- `compare.test.ts` (比較演算子 → bool)
- `compose.test.ts` (arith + 型変換の合成)
- `convert.test.ts` (toFloat / toInt / toBool)
- `helpers.ts` (test ヘルパ。seedUsers / intTable / floatTable / pairTable / `column()` リーダ)
- `twocol.test.ts` (二つの column 間の算術)
- `usecase.test.ts` (insert/update/delete usecase での式の追従性)

実行コマンド:

```
npx tsc --noEmit --strict --target ESNext --module ESNext \
  --moduleResolution Bundler --jsx react-jsx --jsxImportSource react \
  --skipLibCheck --lib ESNext,DOM test/expression/*.test.ts
```

## エラー総数

- **test/expression/ 由来: 69 件**
- すべて `error TS2345`
- ファイル別内訳:
        | ファイル | エラー件数 |
        | --- | --- |
        | arith.test.ts | 12 |
        | chain.test.ts | 9 |
        | compare.test.ts | 7 |
        | compose.test.ts | 7 |
        | convert.test.ts | 8 |
        | helpers.ts | 4 |
        | twocol.test.ts | 7 |
        | usecase.test.ts | 15 |

## エラー一覧 (グループ別)

### グループ G1: `Table<具象 Columns>` → `Table<ColumnsShape>` (69 / 69)

すべて同じ TS2345。aggregate report / delete report の G1 と同根。

`db.select({ x: <expression> }).from(t)` の `.from(t)` 引数、および helpers.ts の `db.insert(t).values(rows)` の `t` 引数で、具象 columns 型を持つ `Table<{...}>` が `Table<ColumnsShape>` パラメタに渡せない。

ここでは expression 機能を観測しているため、`<expression>` の中身は `users.score.add(5)` / `users.score.gt(20)` / `users.score.toFloat()` / `t.a.mul(t.b)` 等の多様な node 構築が登場するが、**Column の式構築自体は型エラーになっていない** (Column のメソッド呼び出し chain 部分は推論が通っている)。エラーは一律 `.from(t)` の table 引数側で発生する。

代表例:

- `arith.test.ts:11` `await db.select({ x: users.score.add(5) }).from(users)` の `users`
- `arith.test.ts:64` `(users.score as any)[method](arg)` を含む projection の `.from(users)`
- `arith.test.ts:74,79,84` intTable 由来 `t` での `.from(t)`
- `chain.test.ts:9,14,19,24,40,45,46,54,55` 長い chain projection でも全部 `.from(users)` 側で落ちる
- `compare.test.ts:16,21,26,40,45,50,55` boolean 戻り値 projection でも同じ
- `compose.test.ts:8,13,18,23,33,38,39` arith + conversion 合成 projection でも `.from(...)`
- `convert.test.ts:10,15,20,25,30,39,48,53` toFloat / toInt / toBool projection の `.from(...)`
- `helpers.ts:17,28,39,51` seedUsers / intTable / floatTable / pairTable 内の `db.insert(t).values(rows)` (helper 自身)
- `twocol.test.ts:9,14,19,24,37,46,53` two-column 算術 projection
- `usecase.test.ts:11,16,17,18,26,...` update / delete / insert を混ぜた usecase で、`.from(...)` も `db.update(...)` も `db.insert(...)` も `db.delete(...)` も全て同じく落ちる

サブパターン (どの table が落ちているか):

1. `{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number> }` (makeUsers)
2. `{ id: TypedColumn<number>; v: Column<number> }` (intTable / floatTable)
3. `{ id: TypedColumn<number>; a: Column<number>; b: Column<number> }` (pairTable)

すべて「concrete Columns 型」と「`ColumnsShape` (index signature 付き shape)」のミスマッチ。

### 副次的観察: expression 構築・rows 取り出しは型エラーになっていない

- `users.score.add(5)`, `users.score.gt(20)`, `users.score.add(users.id).mul(2)` のような Column メソッド chain は (それ自体は) 型エラー無しで通っている。Column / Expression 側の TS API は self-contained に推論できているらしい。
- `(users.score as any)[method](arg)` のような動的キーアクセスは `as any` で明示回避しているため、これも型エラー無し。
- `column(rows, 'x')` の `rows` は `unknown` を受ける helper シグネチャ (`column(r: unknown, key: string): any[]`) なので、`db.select(...).from(...)` の戻り値型が `unknown[]` だろうと `any[]` だろうとそのまま吸収できている → expression 機能には delete report G2 のような「`unknown[]` → typed array」のエラーは出ていない。
- `usecase.test.ts:27` の `expect(rows).toEqual([{ id: 1, bonus: 22 }, ...])` も runtime expect であり、TS 型エラーには寄与していない。

## 修正の方向性 hint

src 側担当 agent への hint:

- 唯一の本質的な型エラーは G1 (Table 型の index signature 欠落)。aggregate report / delete report と同じ修正方針 (Table の generic 制約緩和、もしくは `db.*` API の `<T extends ColumnsShape>` 化) で 69 件すべて解消するはず。
- expression 機能自体の型 API (Column のメソッド chain) は良好。`.add`, `.gt`, `.toFloat` 等の戻り値型がチェインで保持できているのは特筆点。Column 側を generic な `Expression<T>` 風に整えて行く際にも、現在の chain 推論を壊さないようにすべき。
- helper の `column(r: unknown, key: string): any[]` は意図的に unknown を受けて any[] を返す設計で、test 側で型情報を捨てているため expression 機能テストは「table 引数」以外の型エラーをほぼ生んでいない。これは Drizzle 仕様準拠の評価値を runtime assertion で pin する設計と一貫している。

## まとめ

- 全 69 件が単一原因 (G1)。種類としては aggregate と完全に同型。
- expression 機能専用の型不具合 (Column メソッド chain の戻り値推論など) は **観測されず**。今回浮上したエラーは丸ごと src 側の Table generic 制約の問題に集約される。

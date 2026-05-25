# aggregate 型安全検証 report

## 検証範囲

`test/aggregate/` 配下のテストファイル群について、`tsc --noEmit --strict` で型検証を実施。

対象ファイル (test/aggregate/):

- `aggmut.test.ts`
- `avg.test.ts`
- `count1.test.ts`
- `count2.test.ts`
- `count3.test.ts`
- `distinct.test.ts`
- `helpers.ts` (test ヘルパ。共有 fixture)
- `minmax.test.ts`
- `multiagg.test.ts`
- `sum.test.ts`

実行コマンド:

```
npx tsc --noEmit --strict --target ESNext --module ESNext \
  --moduleResolution Bundler --jsx react-jsx --jsxImportSource react \
  --skipLibCheck --lib ESNext,DOM test/aggregate/*.test.ts
```

## エラー総数

- **test/aggregate/ 由来: 124 件**
- すべて `error TS2345` (Argument of type ... is not assignable to parameter of type)
- ファイル別内訳:
        | ファイル | エラー件数 |
        | --- | --- |
        | aggmut.test.ts | 23 |
        | avg.test.ts | 15 |
        | count1.test.ts | 20 |
        | count2.test.ts | 4 |
        | count3.test.ts | 1 |
        | distinct.test.ts | 18 |
        | helpers.ts | 1 |
        | minmax.test.ts | 18 |
        | multiagg.test.ts | 8 |
        | sum.test.ts | 16 |

参考: 同コマンドは `src/index.ts` 由来のエラーも 12 件出力しているが、これは src 側の責務なので本レポートからは除外する (テスト側は 124 件)。

## エラー一覧 (グループ別)

### グループ G1: `db.select(...).from(users)` 系で Table 型が ColumnsShape にマッチしない (124 / 124)

すべて以下と同型のエラー:

```
error TS2345: Argument of type 'Table<{ id: TypedColumn<number>; ... }>' is not
  assignable to parameter of type 'Table<ColumnsShape>'.
  Type 'Table<{...}>' is not assignable to type 'ColumnsShape'.
    Index signature for type 'string' is missing in type
      'TableBase<{...}> & { id: ...; ... }'.
```

つまり `db.select(...).from(<table>)` / `db.delete(<table>)` / `db.update(<table>)` / `db.insert(<table>)` の引数に渡される `Table<...>` は、`makeUsers()` / `numTable()` / `seedNullable()` 等で組み立てた具象 `{ id: ..., score: ..., v: ..., ... }` をそのまま型引数として持っている。この具象 columns 型に対して `ColumnsShape` (`string` index signature を要求する shape) との比較で「index signature が無い」と判定されて落ちている。

主な発生場面 (代表例):

- `aggmut.test.ts:15` `await db.delete(users).where(eq(users.id, 3))` の `users` 引数
- `aggmut.test.ts:16` `await db.select({ n: count(), s: sum(users.score) }).from(users)` の `.from(users)`
- `avg.test.ts:24` `await db.select({ a: avg(t.v) }).from(t)` の `.from(t)` (numTable 由来)
- `count1.test.ts:42-43` 同一テスト内で `db.select(...).from(users)` を 2 回呼ぶ箇所
- `count1.test.ts:123` `seedNullable` 内 `await db.insert(t).values(rows as any)` (`as any` してもなお Table 型側で TS2345)
- `count1.test.ts:132-159` `seedNullable` 系の `from(t)`
- `count3.test.ts:28` `(db as any).$count` 経由でも `db.delete(users)` の users 引数で落ちる
- `distinct.test.ts:96` `await db.select({ n: count() }).from(t)` の `.from(t)`
- `helpers.ts:25` `await db.insert(t).values(rows)` の `t` 引数 (helper 自身も同じ TS2345)
- `minmax.test.ts:74-77` 同一 it 内で `select(...).from(t)` と `db.delete(t).where(...)` が同居
- `multiagg.test.ts:21,57,60` events テーブル (`{ id; kind; v }`) でも同じ
- `sum.test.ts:68-71` `makeUsers()` + `db.insert(users)` でも同様

### サブパターン分類 (どの table が落ちているか)

実は型の中身を細かく見ると 3 種類の columns shape:

1. `{ id: TypedColumn<number>; name: TypedColumn<number>; score: TypedColumn<number> }` (`makeUsers()` 由来)
2. `{ id: TypedColumn<number>; v: Column<number> }` (`numTable()` 由来 / id は primaryKey, v は default 無し)
3. `{ id: TypedColumn<number>; kind: Column<number>; v: Column<number> }` (`makeEvents()` 由来)
4. `{ id: Column<number>; v: Column<number> }` (`seedNullable()` 由来 / id に primaryKey 付与なし)

どの形でも結論は同じで、「concrete Columns 型」と「`ColumnsShape` = `{[k: string]: Column<any>}` のような index-signature 付き shape」のミスマッチ。

### 呼び出し API 別の出現傾向

すべて TS2345 だが、どの API でトリガされているか:

- `db.select({...}).from(t)` の `.from(...)` 引数: 最多 (約 7 割)
- `db.delete(t)` の引数 (`.where(...)` 連鎖)
- `db.update(t).set(...).where(...)` の `update(t)` 引数
- `db.insert(t).values(...)` の `insert(t)` 引数 (helpers.ts, count1.test.ts:123)

すべて「`Table<具象 ColumnsShape>` を `Table<ColumnsShape>` に渡せない」という同根。

## 修正の方向性 hint

これは test 側のコードに問題があるのではなく、**`src` 側の API 型定義の問題**。本 agent は src を読まないが、ここで観測できる事実だけ整理する:

1. `Table<C extends ColumnsShape>` のように制約付き generic として宣言されている (or されているべき)。`ColumnsShape = Record<string, Column<any>>` 系の index signature を持つ shape のはず。
2. しかし `table('users', { id: integer(...), name: integer(...), ... })` が返す値の型推論結果は、`{ id: TypedColumn<number>; name: TypedColumn<number>; ... }` のような「固定キーだけを持つ object literal 型」になっており、index signature を満たさない。
3. その結果、`Table<{ id: TypedColumn<number>; ... }>` を `Table<ColumnsShape>` の位置 (= `db.select().from(table: Table<ColumnsShape>)` 等の引数) に渡せない。
4. 修正の典型方向 (src 側担当 agent への hint):
   - 方針 A: `db.select`, `db.from`, `db.insert`, `db.delete`, `db.update` を `<T extends ColumnsShape>(table: Table<T>) => ...` のように generic 化して、具象 columns 型をそのまま受け入れる。
   - 方針 B: `table()` ファクトリの返り値型を `Table<C & ColumnsShape>` or `Table<C extends Record<string, Column<any>>>` のように、index signature 互換へ広げる。
   - 方針 C: `ColumnsShape` 自体を `Record<string, Column<any>>` から `{ [k: string]?: Column<any> }` ではなく、具象 columns を許容する型 alias (例えば単に `Record<string, Column<unknown>>` ではなく、`{ readonly [k: string]: Column<any> }` の covariant 位置で許容) に整理。

test 側で抑制したいなら `as any` キャストになるが、test は不変なので推奨できない (count1.test.ts:123 では values 側だけ `as any` してもなお table 引数側で落ちている)。

## 観測されなかった (= test 側に潜む) 型エラー

- aggregate 結果の `unknown` (select の戻り値型) は、テスト側で `aggRow(r: unknown): any` / `scalar(r, alias): unknown` というラッパを通して全て `unknown` → `any` に流しているため、TS2345 以外のエラー (例: `Property 'n' does not exist on type unknown`) は一切出ていない。テスト側のヘルパ設計は「Drizzle 仕様準拠の結果 shape を pin する」ことに集中しており、型側の divergence を意図的に runtime assertion に押し付けている。
- それゆえ、報告されるエラーは丸ごと「`Table<具象>` を `Table<ColumnsShape>` パラメタに渡す」1 種類に集約された。

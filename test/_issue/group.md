# group 型安全検証 report

## 検証範囲

`test/group/` 配下のテストファイル群について、`tsc --noEmit --strict` で型検証を実施。

対象ファイル (test/group/):

- `avg.test.ts` (per-group avg)
- `count.test.ts` (per-group count / countDistinct)
- `groupby1.test.ts` (groupBy の bucketing)
- `groupmut.test.ts` (insert/update/delete usecase での grouping)
- `having.test.ts` (Drizzle 仕様 having 句 / bad-dbms 未実装)
- `helpers.ts` (groupTable / keyTable / labelTable / `byKey`, `groupWith`)
- `minmax.test.ts` (per-group min/max, text 列含む)
- `order.test.ts` (groupBy + orderBy + limit)
- `sum.test.ts` (per-group sum)
- `where.test.ts` (where → groupBy パイプライン)

実行コマンド:

```
npx tsc --noEmit --strict --target ESNext --module ESNext \
  --moduleResolution Bundler --jsx react-jsx --jsxImportSource react \
  --skipLibCheck --lib ESNext,DOM test/group/*.test.ts
```

## エラー総数

- **test/group/ 由来: 91 件**
- すべて `error TS2345`
- ファイル別内訳:
        | ファイル | エラー件数 |
        | --- | --- |
        | avg.test.ts | 8 |
        | count.test.ts | 11 |
        | groupby1.test.ts | 13 |
        | groupmut.test.ts | 14 |
        | having.test.ts | 8 |
        | helpers.ts | 3 |
        | minmax.test.ts | 12 |
        | order.test.ts | 8 |
        | sum.test.ts | 8 |
        | where.test.ts | 6 |

## エラー一覧 (グループ別)

### グループ G1: `Table<具象 Columns>` → `Table<ColumnsShape>` (91 / 91)

すべて TS2345。aggregate / delete / expression report の G1 と同根、「`db.select(...).from(t)` / `db.delete(t)` / `db.update(t)` / `db.insert(t)` の引数に具象 columns 型の `Table<{...}>` を渡すと、`Table<ColumnsShape>` の index signature を満たさず落ちる」。

group 機能特有の `.groupBy(...)`, `.having(...)`, `.orderBy(asc(...))`, `.limit(n)` 連鎖は **それ自体は型エラーにならず**、すべてのエラーは入口の `.from(t)` (および `db.update/insert/delete(t)`) 引数で発生している。これは expression report と同じ観察で、Column / SelectBuilder のメソッド chain 側は内部的に推論できているが、最初の table バインドだけが落ちる構造。

代表例:

- `avg.test.ts:22` `.from(events).groupBy(events.kind)` の `.from(events)`
- `avg.test.ts:60,68,76,84,124,152,164` (groupTable / posts / events での `.from(...)`)
- `count.test.ts:10,15,20,29,34,71,84,90-92,114` 同様の `.from(...)`
- `groupby1.test.ts:13-114` events / posts / groupTable / keyTable すべてで同じ
- `groupmut.test.ts:13-56` insert/update/delete + select の usecase
- `having.test.ts:12,17,22,29,32,42,61,80` `(<select chain> as any).having(...)` で外側を `as any` してもなお `.from(...)` 側で落ちる (8 件はすべて `.from(...)`)
- `helpers.ts:25,36,50` groupTable / keyTable / labelTable 内の `db.insert(t).values(rows)` (text 用 labelTable は既に `as any` キャストしているが、insert(t) の `t` 引数自体が落ちる)
- `minmax.test.ts:19,31,74,94,122,136,150` numeric `v` 列 / `g` グループ列
- `minmax.test.ts:172,180,192,201,213` **text 列を含む labelTable**: `Table<{ id; g; label: Column<string> }>` でも同型に落ちる
- `order.test.ts:12,17,22,28,36,41,58,68` `.from(events).groupBy(...).orderBy(asc(events.kind)).limit(n)` の `.from(...)`
- `sum.test.ts:22,29-33` events / posts / groupTable
- `where.test.ts:11,20,25,30,41,46-50` where → groupBy パイプ

サブパターン (columns shape の中身):

1. `{ id: TypedColumn<number>; kind: Column<number>; v: Column<number> }` (`makeEvents()`)
2. `{ id: TypedColumn<number>; userId: Column<number>; score: TypedColumn<number> }` (`makePosts()`)
3. `{ id: TypedColumn<number>; g: Column<number>; v: Column<number> }` (`groupTable()`)
4. `{ id: TypedColumn<number>; g: Column<number> }` (`keyTable()`)
5. `{ id: TypedColumn<number>; g: Column<number>; label: Column<string> }` (`labelTable()` / text 列)

すべて「concrete Columns 型」と `Table<ColumnsShape>` のミスマッチ。

### 観測されなかったエラー (= 型的に既に通っているもの)

- `db.select({ kind: events.kind, n: count(), a: avg(events.v), s: sum(events.v), lo: min(events.v), hi: max(events.v) })` のような多重 aggregate projection は型エラー無し。
- `.groupBy(events.kind)` `.groupBy(t.g)` などの groupBy 引数 (Column) も型エラー無し。
- `.having(...)` は `as any` キャスト経由で呼び出されているためそもそも型を介していない (having.test.ts:12 等)。bad-dbms 側に `.having` が実装されていないことを runtime で検知する設計。
- `.orderBy(asc(events.kind))` / `.orderBy(desc(sum(events.v)))` / `.limit(n)` も型エラー無し。
- `groupWith(result, 'kind', 0).a` のような結果アクセスは helper 戻り値が `any` のため落ちない。

## 修正の方向性 hint

src 側担当 agent への hint:

- すべて単一原因 (G1)。aggregate / delete / expression report と同じ修正方針 (`Table<C extends ColumnsShape>` 制約 + `db.*` の generic 化) で 91 件すべて解消する。
- group 機能特有の API (`.groupBy`, `.having`, `.orderBy`, `.limit`) の型シグネチャはこのテストセットからは追加の不具合は浮上していない。ただし `.having` は `as any` で迂回されているため、src 側で実装したあかつきには test 側 `as any` キャストを外して再検証する必要がある。
- labelTable (text 列) 経由のテストも他の数値列と完全に同じく落ちており、text/integer による型挙動差は観測されていない。

## まとめ

- 全 91 件が単一原因 G1。今回確認した 4 feature (aggregate 124 / delete 97 (内 G1 約 80) / expression 69 / group 91) を通じて、test 側で発生している型エラーはほぼすべて `Table<具象>` を `Table<ColumnsShape>` パラメタに渡せない問題に集約される。
- group 機能専用の型問題 (groupBy / having / orderBy の戻り型, per-group row の型推論など) は追加で観測されず。bad-dbms の API 側で per-group row 型を返せていないとしても、helper 群 (`groupWith` 等) が `unknown` → `any` で吸収しているため浮上しない。

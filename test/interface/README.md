# interface layer test list

## scope

対象は `src/interface/` 配下の以下 module。

```
sql.ts                 SqlNode 定義 + sql`` template tag
column.ts              uint / float / integer / text + 制約
table.ts               column 集合に $meta を attach
expressions/           eq / and / or / between / not / inArray / ...
functions/             sum / count / avg / min / max / distance ...
compile.ts             evalNode + compilePredicate + compileExpr
plan.ts                planSelect: logical AST ───→ physical AST
database.ts            database({tables}).all(n).transaction()
```

## sql

SqlNode 判別 union と SQL wrapper の factory 群。

### test list

`sql\`...\`` template tag は string 部と式部から `{ kind: 'sql', node: ... }` を返す。

`raw(str) / identifier(name) / placeholder(name) / param(value)` はそれぞれ対応する `type` の SqlNode をラップした SQL wrapper を返す。

`isSQL(v)` は `{ kind: 'sql', node }` 形状の object に対し true、それ以外に対し false。

`wrap(v)` は数値 / 文字列 / boolean を渡したとき `{ type: 'literal', value: v }` の SQL wrapper を返す。すでに SQL wrapper のときは同じ object 参照を返す。

`join(chunks, sep?)` は chunks を区切りで連結した SQL wrapper を返す。

SQL wrapper には `.add / .sub / .mul / .div / .mod / .eq / .ne / .lt / .lte / .gt / .gte / .toFloat / .toInt / .toBool / .at` の chain method が attach されており、戻り値も同じ method 集合を持つ。

## column

column factory と制約 chain。

### test list

`integer(name?)` は `type: 'i32'` の column を返し、`$col.type === 'i32'` かつ byteSize = 4。

`uint(name?)` は `type: 'u32'` の column を返し、byteSize = 4。

`float(name?)` は `type: 'f32'` の column を返し、byteSize = 4。

`text(name?)` は内部的に `type: 'u32'` + `tag: 'str'` を持つ column を返す。

`integer / uint / float / text` は名前引数省略でも呼べる。

`.primaryKey()` chain 後の column は `$col.isPrimary === true`。

`.unique()` chain 後の column は `$col.isUnique === true`。

`.notNull()` chain 後の column は `$col.notNull === true`。

`.default(v)` chain 後の column は `$col.defaultValue === v`。

`.$defaultFn(fn)` / `.defaultFn(fn)` chain 後の column は `$col.defaultFn === fn` で、呼び出し可能。

`.references(() => other)` chain 後の column は `$col.references` に lazy resolver を保持。

`.order(min, max)` chain 後の column は `$col.hasOrder === true` かつ `$col.orderRange === [min, max]`。

column は SQL expression としても評価可能で、`eq(col, 1)` / `col.add(1)` のような渡し先で SqlNode (`type: 'column'`) として解釈される。

## table

column 集合に `$meta` を付与する factory。

### test list

`table(name, schema)` は schema の各 key を column として持つ object を返し、`$meta.name === name`。

`$meta.columns` は schema 定義順の column descriptor 配列。

table を経由した各 column の SqlNode は `node.tableName === name` を持つ (eq / select 等での修飾名解決用)。

## expressions

predicate factory 群。

### test list

`eq(a, b)` は `{ type: 'binop', op: '=', args: [wrap(a), wrap(b)] }` の SQL wrapper を返す。

`ne / lt / lte / gt / gte` は同じ binop の op 名違いを返す。

`and(...conds)` は `{ type: 'binop', op: 'and', args: [...filtered] }` を返し、`undefined` の引数は自動で除外される。

`or(...conds)` も同様に `undefined` を除外する。

`not(cond)` は `{ type: 'unop', op: 'not', args: [cond] }` を返す。

`between(col, lo, hi)` は `{ type: 'func', name: 'between', args: [wrap(col), wrap(lo), wrap(hi)] }` を返す。

`inArray(col, list)` は `{ type: 'binop', op: 'in', args: [wrap(col), { type: 'list', items: list.map(wrap) }] }` 相当を返す。

`isNull(col) / isNotNull(col)` は対応する unop SqlNode を返す。

`asc(col) / desc(col)` は `{ type: 'order', dir, col }` の SqlNode を返す。

## functions

aggregate / vector function factory。

### test list

`count() / count(col) / countDistinct(col)` は `{ type: 'aggregate', name: 'count', distinct, args }` 形状の SqlNode を返す。

`sum / avg / min / max` も対応する name の aggregate SqlNode を返す。

`*Distinct` 系は `distinct: true` を持つ。

`l2Distance / l1Distance / cosineDistance / innerProduct / hammingDistance / jaccardDistance` は `{ type: 'func', name, args: [col, value] }` を返す。

## compile

SqlNode を評価可能な値 / 関数に変換する。

### test list

`evalNode({ type: 'literal', value: 5 }, row)` は 5 を返す。

`evalNode({ type: 'column', name: 'a', tableName: 't' }, row)` は `row.a` を返す。

`evalNode({ type: 'binop', op: '+', args: [...] }, row)` は再帰評価した子の和を返す (`-`, `*`, `/`, `%` 同様)。

`evalNode({ type: 'binop', op: '=', args: [...] }, row)` は両辺の値が等しいときに true。`<`, `<=`, `>`, `>=`, `!=` も同様。

`evalNode({ type: 'binop', op: 'and', args: [...] }, row)` は args 全てが truthy のとき true (variadic、length 任意)。

`evalNode({ type: 'binop', op: 'or', args: [...] }, row)` は args のいずれかが truthy のとき true。

`evalNode({ type: 'unop', op: 'not', args: [x] }, row)` は子の否定を返す。

`evalNode({ type: 'func', name: 'between', args: [v, lo, hi] }, row)` は `lo <= v <= hi`。

`evalNode({ type: 'func', name: 'toFloat', args: [x] }, row)` は子を Number として返す。

`evalNode({ type: 'currentTuple', col, tableName }, row, ctx)` は `ctx.current[col]` を返す。

`compilePredicate(sqlNode, ctx)` は `(row) => boolean` を返し、evalNode の結果を boolean に強制する。

`compileExpr(value, ctx)` は SQL wrapper を渡すと `(row) => evalNode(value, row, ctx)` を返し、scalar を渡すと `() => scalar` を返す。

## plan

logical AST → physical AST の lowering。

### test list

`planSelect({ op: 'Select', table, projection, where, groupBy, orderBy, limit, offset })` は次の構造の physical AST tree を返す。

base は `{ op: 'SeqScan', table }`。

`where` が指定されているとき `Filter` op が SeqScan の上に重なり、`predicate` には `compilePredicate(where)` の結果が入る。

`groupBy` または `projection` に aggregate が含まれているとき `Aggregate` op が乗る。

`projection` が指定されているとき `Projection` op が一番外側に乗り、`fields` には projection の alias 名配列が入る。

`orderBy` が指定されているとき `Sort` op が乗り、`keys` には `{ field, dir }` が入る。

`limit` または `offset` は Projection / Sort の上で row 数を制御する shape として表現される。

`buildProjection(projection)` は alias → SqlNode の map から fields 配列と aggregate 検出フラグを返す。

`tableNameOf(table)` は string / Table object のどちらを渡しても name 文字列を返す。

## database

drizzle-like API の chain と backend 接続。

### test list

`database({ tables: { users, posts } })` は内部で `createDatabase` を呼び、catalog に全 table を `registerTable` する。

`database({ users, posts })` のように tables 配列を直接渡した場合も同じ振る舞い (auto-detect map 形式)。

`db.select().from(users)` は thenable で、`await` すると row 配列を返す。

`db.select({ a: users.id }).from(users).where(...)` は logical Select AST を組み立て、`compile`/`plan` を経て backend に渡る。

`db.select({ s: sum(posts.score) }).from(posts)` のように `groupBy` 無しで aggregate のみ projection した場合、戻り値は配列ではなく単一 row object に unwrap される。

`db.insert(users).values({...})` は thenable で、await すると `{ rowCount: 1 }` を返す。

`db.insert(users).values([{...}, {...}])` の戻り値の rowCount は配列長と一致する。

`db.insert(users).values({...}).returning()` は rid 配列を含む結果を返す。

`db.update(t).set({ a: 1 }).where(eq(t.id, 1))` の戻り値は `[{ updated: n }]`。

`db.delete(t).where(eq(t.id, 1))` の戻り値は `[{ deleted: n }]`。

`db.update(t).set({ a: t.a.add(1) }).where(...)` の setter は SQL expression が `(row) => row.a + 1` に compile される。

`db.transaction(async (tx) => {...})` の中で `tx.insert / tx.update` が呼べ、await 完了で commit、例外で abort される。

`db.transaction(async (tx, c) => {...})` の `c.colName` は `{ type: 'currentTuple', col, tableName }` SqlNode を返す Proxy。

`db.transaction(fn).run(ctx?)` を await すると primary table の全 alive row に対し fn が 1 度ずつ実行され、各 fn 呼び出しの直前に `ctx.current = row` が更新される。

`tick.run(ctx)` の戻り値は引数の `ctx` をそのまま返す (pass-through)。

`database(...).all(n)` は `hasOrder` 制約のある column に対し z-order に沿って n 件の行を生成し、`defaultFn` のある column はその関数で値を生成、`catalog.insertRow(name, row)` を順に呼ぶ。

`database(...).use(adapter)` は adapter を db.adapters 配列に追加し、chain を続行できる (`db` を返す)。

<!--
Roadmap (未実装): WHERE への subquery / EXISTS、CTE、window function、ORDER BY の NULLS FIRST、DISTINCT ON、GROUPING SETS、`update().from(otherTable)` の本格 join、insert ... on conflict はテスト対象外。
-->

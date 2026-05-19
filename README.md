# bad-dbms

TypeScript で書かれた OLAP 向け column-store な relational database。drizzle-like な declarative API と Volcano pull-based executor を載せ、CMU Database Group 講義に沿った catalog / executor / access / storage の四層構成。

将来 gpgpu 系の上位 library から呼び出される前提で、page 単位の I/O と DSM (Decomposition Storage Model) を採用し、固定長 fixed-length offsets で tuple 物理位置を決定する。

## Overview

drizzle-like な declarative API から query plan AST を組み立て、backend が物理 plan に lower して pull-based に execute する OLAP 向け column-store rdbms。tick 単位 bulk commit、tuple 単位の ACID は採用しない。

```
user code (table / column / select / update / ...)
   ↓ logical AST  { op: 'Select' | 'Insert' | 'Update' | 'Delete' | 'InitAll' }
planSelect (interface 側 lowering)
   ↓ physical AST { op: 'SeqScan' | 'Filter' | 'Aggregate' | 'Projection' | 'Sort' | ... }
executor (Volcano pull)
   ↓ rid = [pageId, offset]
access (heap / nbtree / hash / transam)
   ↓ block I/O (relId, forkId, blockNo)
storage (free / page / buffer / smgr / file / lmng)
   ↓ pluggable adapter (memory / OPFS / ...)
```

## Why

OLAP の bulk scan は row-store より column-store が I/O を削減できる。固定長型 (i32 / f32 / u32) のみを基底に置くと tuple の物理位置が `valueSize × offset` で決定論的に算出でき、slot array を持たない packed layout が成立。tombstone は 1 bit / slot の bitmap として page header 直後に集約。

index は user の migration ではなく column 制約 (`primaryKey` / `unique` / `order`) から catalog が自動配置。browser 上で migration を回せない前提を採るため、schema → index の自動構築を必須とする。

## Architecture

bad-dbms は依存方向が一方向の四層構造。

```
┌──────────────────────────────────────────────────────────────────┐
│  src/index.ts            entry。golden path (Game of Life) を保持 │
├──────────────────────────────────────────────────────────────────┤
│  src/interface/          user 向け drizzle-like API + AST 構築    │
│    column.ts             uint / float / integer / text + 制約     │
│    table.ts              column 集合に $meta を attach            │
│    sql.ts                SqlNode 定義 + sql\`\` template tag        │
│    expressions/          eq, and, or, between, not, ...           │
│    functions/            sum, count, avg, min, max, distance ...  │
│    compile.ts            evalNode + compilePredicate + compileExpr│
│    plan.ts               planSelect: logical AST → physical AST   │
│    database.ts           database({tables}).all(n).transaction()  │
├──────────────────────────────────────────────────────────────────┤
│  src/backend/            catalog + executor + entry               │
│    catalog.ts            relation / column / index の schema 管理 │
│    executor.ts           Volcano operator iterator + evalNode     │
│    index.ts              createDatabase: 全層を wire する entry    │
├──────────────────────────────────────────────────────────────────┤
│  src/backend/access/     rid を介した tuple アクセス層              │
│    heap.ts               固定長 record の置き場、rid 採番           │
│    nbtree.ts             B+tree index、forward/backward scan      │
│    hash.ts               linear hashing index、point lookup       │
│    transam.ts            xid 発行 + snapshot 構築                 │
├──────────────────────────────────────────────────────────────────┤
│  src/backend/storage/    byte 単位の物理層                         │
│    page.ts               1 page の header / tombstone / 値域      │
│    free.ts               page ごとの空き bytes の tree            │
│    buffer.ts             clock-sweep + ring buffer の frame pool  │
│    smgr.ts               relation を block 列に抽象化             │
│    file.ts               byte I/O 境界、adapter 差し替え可        │
│    lmng.ts               logical lock + physical latch            │
└──────────────────────────────────────────────────────────────────┘
```

上位は下位の internal に踏み込まない。下位は上位の意味論を持たない。layer 間は `(relId, forkId, blockNo)` と `rid = [pageId, offset]` の 2 種類の identifier だけで会話。

## Storage Model

DSM (Decomposition Storage Model) を一貫採用。1 column が 1 物理 file 相当の page 列を持つ独立した heap。

```
column-store layout (DSM)

cells table = { x: u32, y: u32, a: f32 }

  ┌── heap for column "x" ──┐   ┌── heap for column "y" ──┐   ┌── heap for column "a" ──┐
  │ page 0                  │   │ page 0                  │   │ page 0                  │
  │ ┌───────────────────┐   │   │ ┌───────────────────┐   │   │ ┌───────────────────┐   │
  │ │ header (64 bytes) │   │   │ │ header (64 bytes) │   │   │ │ header (64 bytes) │   │
  │ ├───────────────────┤   │   │ ├───────────────────┤   │   │ ├───────────────────┤   │
  │ │ tombstone bitmap  │   │   │ │ tombstone bitmap  │   │   │ │ tombstone bitmap  │   │
  │ ├───────────────────┤   │   │ ├───────────────────┤   │   │ ├───────────────────┤   │
  │ │ x[0], x[1], ...   │   │   │ │ y[0], y[1], ...   │   │   │ │ a[0], a[1], ...   │   │
  │ └───────────────────┘   │   │ └───────────────────┘   │   │ └───────────────────┘   │
  └─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### Page layout

`PAGE_SIZE = 4096`, `HEADER_SIZE = 64`。header は kind / level / flags / prevPageId / nextPageId / highKey / slotCount / tombstoneOffset / valueOffset / valueSize を packed で持つ。

value area の前に tombstone bitmap を置き、`isAlive(slot)` / `setAlive(slot, alive)` で生死を切る。`capacity(valueSize)` は

```
floor((PAGE_SIZE - HEADER_SIZE) * 8 / (valueSize * 8 + 1))
```

で算出。valueSize=4 (i32 / f32 / u32 共通) なら 1 page あたり 977 slot。

### Access methods

```
access method     responsibility                              key API
─────────────────────────────────────────────────────────────────────────
heap              rid 採番と固定長 record の物理配置          insert(value) → rid
                                                              read(rid) → value
                                                              update(rid, value)
                                                              delete(rid)
                                                              scan(emit)

nbtree            順序付き index、leaf linked list で range   insert(key, rid)
                                                              search(key) → rid
                                                              forward(start, end, emit)
                                                              backward(start, end, emit)
                                                              bulkLoad(sorted)

hash              equi lookup 専用、linear hashing             insert(key, rid)
                                                              lookup(key, emit)
                                                              deleteKey(key, rid?)
                                                              bulkLoad(entries)

transam           xid と snapshot                              begin/commit/abort
                                                              snapshot() → {xmin, xmax, xip}
                                                              isVisible(xid, snap)
```

heap / nbtree / hash は同一の `rid = [pageId, offset]` 形式を共有し、byte 表現には依存しない。access 層を超えた layout 変更が独立に進められる。

heap が rid を発行する唯一の主体。index は leaf に rid を保持するだけで自前の物理 ID 空間を持たない。catalog の `insertRow(name, row)` は column 順に heap を呼び出し、index には heap が返した rid をそのまま渡す直列パイプ。delete 時の各層の役割分担は Internals > rid alignment 参照。

nbtree は Blink-tree 風に prev/next sibling pointer を持つ。`LEAF_CAP = INTERNAL_CAP = 64`。leaf split は右側に新 leaf を切り出して sibling rewire と pivot 伝播を同時に行い、propagateUp が path stack を pop しながら親 internal に entry を挿入。root に到達した時点で path が空なら新 root を確保して meta block の rootPageId を書き換え、高さが 1 増える。merge / borrow は未実装で、delete は leaf slot の tombstone 化のみ。`bulkLoad(sortedEntries)` は事前 sort 済 input を前提に leaf を `LEAF_CAP` まで密に詰め、各 leaf の先頭 key を pivot として上位 level を bottom-up に build (split 0 回 / 全 page 1 回 write)。

hash は postgres hash index 系の linear hashing。primary bucket page + overflow chain (`nextPageId`) で同 hash の entry を保持。load factor (`tuples / nBuckets`) が 1.5 を超えた瞬間に 1 bucket だけ incremental split。`splitPointer` が指す bucket の entry を `level + 1` bit で再 hash して旧 / 新 bucket に振り分け、splitPointer が `1 << level` に達したら 0 に戻して level を 1 増やす。1 insert あたり最大 1 bucket rehash で amortized cost が一定。

transam は xid 発行 + commit log + active set + snapshot 構築の論理層。`begin()` で新 xid を取り `activeTop` に加え、commit / abort で clog を更新して活動集合から外す。`snapshot()` は `xmin = min(activeTop)`, `xmax = nextXid`, `xip = clone(activeTop)` を凍結。`isVisible(xid, snap)` は xid < xmin なら clog の committed のみ可視、xid ≥ xmax なら不可視、xmin ≤ xid < xmax なら xip に含まれず committed のときのみ可視、というルールで判定。sub-transaction は親子連結 list として保持し、savepoint commit / rollback で親に戻る。現状 access 層からは未呼び出しで、bulk-update 主体の golden path では single-thread を前提に snapshot 経由の visibility 判定を skip。

### Storage layers

```
free   ← 「どの page に空きがあるか」                       findPage(neededBytes) → blockNo
                                                            update(blockNo, freeBytes)
                                                            extend() → blockNo

page   ← 「1 page の header / bitmap / value 並び」          createPage(bytes?) → {readValue, writeValue, ...}

buffer ← 「frame pool と pin / unpin」                       pin(relId, forkId, blockNo, hint?)
                                                            unpin(frame, dirty?)
                                                            flush(frame), flushAll()

smgr   ← 「relation を block 列として見る」                  read/write(relId, forkId, blockNo, bytes)
                                                            extend(relId, forkId) → blockNo
                                                            nBlocks(relId, forkId)

file   ← 「byte I/O 境界、adapter 差し替え可」               read/write/sync/close

lmng   ← 「論理 lock + 物理 latch」                          acquireLock(tag, mode, xid)
                                                            acquireLatch(tag, mode)
                                                            releaseAll(xid)
```

fsm (free space map) は per-relation per-fork の `Uint8Array` を leaf に、その上に max-of-children を持つ upper 配列を載せる二層 tree。`floor(freeBytes / 16)` の粗い粒度で空き bytes を保持し、findPage は upper を走査して候補 group を絞ってから leaf を読む。buffer の二段 pool 構造は Internals > Buffer pool の二段構え参照。

## Query Plan

interface が logical AST を組み立て、`planSelect` が physical AST に lower、executor が pull-based iterator で駆動。

### Logical AST (interface が emit)

```ts
{ op: 'Select',   projection, table, where, groupBy, orderBy, limit, offset }
{ op: 'Insert',   table, values, returning? }
{ op: 'Update',   table, set, from?, where? }
{ op: 'Delete',   table, where? }
{ op: 'InitAll',  count, tables, adapters }
```

`where` と `set` は SqlNode のまま渡し、lowering 時に `(row) => boolean` または `(row) => any` の関数に compile する。

### Physical AST (executor が consume)

```ts
{ op: 'SeqScan',        table }
{ op: 'IndexScan',      table, indexName, range }
{ op: 'Filter',         child, predicate: (row) => boolean }
{ op: 'Projection',     child, fields: string[] }
{ op: 'NestedLoopJoin', left, right, predicate }
{ op: 'HashJoin',       left, right, leftKey, rightKey }
{ op: 'Aggregate',      child, groupBy, aggs: [{ name, kind, field }] }
{ op: 'Sort',           child, keys: [{ field, dir }] }
{ op: 'Update',         table, predicate, setters }
{ op: 'Delete',         table, predicate }
```

executor の各 operator は `{ next(): row | null, close() }` を返す pull iterator。`next` は子 iterator の `next` を呼び、必要な変換を施してから返す。LIMIT 相当は Sort や Aggregate の出力を Projection が打ち切る形で表現。

executor 自身は同期 iterator だが、外向きの `backend.execute(ast)` は async wrapper (`Promise<any[]>`) で iterator を `drain` した配列を返す。`InitAll` op だけ executor を経由せず `index.ts` 層で `catalog.registerTable` を回す。空 row の場合も `[]` を返し、null / undefined にはならない。aggregate-no-groupBy-zero-input のときは executor の `makeAggregate` が synthetic 0-row を 1 つ emit (count = 0 / sum = 0 / min = Infinity / max = -Infinity)。

### Lowering 例

```
select({ s: sum(cells.a) })
  .from(cells)
  .where(and(
    between(cells.x, c.x.sub(1), c.x.add(1)),
    between(cells.y, c.y.sub(1), c.y.add(1)),
  ))
                │
                ▼ planSelect
{ op: 'Projection', fields: ['s'],
  child: { op: 'Aggregate', groupBy: [], aggs: [{name:'s', kind:'sum', field:'a'}],
    child: { op: 'Filter', predicate: <compiled fn>,
      child: { op: 'SeqScan', table: 'cells' } } } }
```

## API

drizzle-orm に倣った declarative API。`table()` で schema を、`column()` で型と制約を、`database()` で実体を作る。

### Schema

```ts
import { table } from './interface/table'
import { uint, float, integer, text } from './interface/column'

const cells = table('cells', {
        x: uint('x').order(0, 16),
        y: uint('y').order(0, 16),
        a: float('a').$defaultFn(() => (Math.random() < 0.1 ? 0 : 1)),
})
```

column factory:

```
uint(name?)     → u32 (4 bytes)
integer(name?)  → i32 (4 bytes)
float(name?)    → f32 (4 bytes)
text(name?)     → 内部は u32 として保持、将来 dictionary encoding で文字列を code 化
```

column 修飾:

```
.primaryKey()           → catalog 側で nbtree index を自動配置
.unique()               → catalog 側で nbtree index を自動配置
.order(min, max)        → catalog 側で nbtree index を自動配置 + .all(n) の座標 hint として orderRange を保持
.default(value)         → .all(n) の row 生成で value を埋める
.$defaultFn(() => v)    → .all(n) の row 生成で fn() を呼ぶ (alias: .defaultFn)
.notNull()              → $col.notNull に flag (現状 catalog は読まない)
.references(() => col)  → $col.references に metadata (現状 catalog は読まない)
```

column は SQL expression としても振る舞い、`.add`/`.sub`/`.mul`/`.div`/`.mod`/`.eq`/`.ne`/`.lt`/`.lte`/`.gt`/`.gte`/`.toFloat`/`.toInt`/`.toBool`/`.at(i)` を chain できる。

### Database

```ts
import { database } from './interface/database'

const db = await database({ cells })
        .use(myAdapter())
        .all(W * H)
```

`database({ tables })` は table map を受け取り、内部で `createDatabase()` を立てて catalog に register。`use(adapter)` は下流 library (描画 engine など) が拾うための pass-through array に push するだけで、bad-dbms 本体は中身を見ない。`all(n)` は各 table に n 行の初期 row を生成し、`catalog.insertRow(name, row)` を per-row で呼ぶ。生成規則は次の通り。

```
.order(min, max) 列が 2 本ある場合     1 本目を x = i % wMax、2 本目を y = floor(i / wMax) % hMax として 2D 格子を埋める
.order(min, max) 列が 1 本 / 3 本以上  各 order 列を i % orderRange[1] で埋める (簡易 fallback)
それ以外の列                           $col.defaultFn ? defaultFn() : ($col.defaultValue ?? 0)
```

### Transaction

```ts
const tick = db.transaction(async (tx, c) => {
        const result = await tx
                .select({ s: sum(cells.a) })
                .from(cells)
                .where(
                        and(
                                between(cells.x, c.x.sub(1), c.x.add(1)),
                                between(cells.y, c.y.sub(1), c.y.add(1))
                        )
                )
        const s = result.s ?? 0
        await tx
                .update(cells)
                .set({ a: or(eq(s, 3), and(eq(c.a, 1), eq(s, 4))).toFloat() })
                .from(cells)
                .where(and(eq(c.x, cells.x), eq(c.y, cells.y)))
})

await tick.run({})
```

`db.transaction(fn)` は `{ run(extra?) }` を返す。`run(extra)` は primary table の全 row を 1 行ずつ走査し、`fn(tx, c)` を per-row で呼ぶ。第二引数 `c` は currentTuple proxy で、`c.x` / `c.a` のような property access が `{type:'currentTuple', col:'x', tableName:'cells'}` の SqlNode を返す。`fn` 内の SQL 式は `c` の closure を持ち、各 row 評価時に `ctx.current` から値を resolve。

`run(extra)` は `extra` をそのまま return。下流 (rendering 等) が継続 chain を組むためのパイプ。

### Select / Insert / Update / Delete

```ts
await db.select({ x: cells.x, a: cells.a }).from(cells)
await db.select({ s: sum(cells.a) }).from(cells).groupBy(cells.x)

await db.insert(cells).values([{ x: 0, y: 0, a: 1 }, { x: 1, y: 0, a: 0 }])
await db.update(cells).set({ a: 0 }).where(eq(cells.x, 5))
await db.delete(cells).where(lt(cells.a, 0.5))
```

各 builder は thenable。`await` でそのまま実行が走り、結果は以下。

```
Select         配列 [{...row}]。Aggregate のみで group by 無しの場合は単一の row object に unwrap
Insert         { rowCount: n } を返す。.returning() を付けると rid 配列
Update         [{ updated: n }]
Delete         [{ deleted: n }]
```

## Internals

### SqlNode 一覧

```ts
type SqlNode =
        | { type: 'column',       name, dataType, tableName? }
        | { type: 'literal',      value, encoder? }
        | { type: 'raw',          value }
        | { type: 'identifier',   name }
        | { type: 'placeholder',  name }
        | { type: 'binop',        op, args: SQL[] }   // +, -, *, /, %, =, !=, <, <=, >, >=, and, or, in
        | { type: 'unop',         op, args: [SQL] }   // not, isNull, isNotNull, exists, notExists
        | { type: 'func',         name, args: SQL[] } // toFloat, toInt, toBool, between, at, distance, ...
        | { type: 'aggregate',    name, distinct, args: SQL[] } // count, sum, avg, min, max
        | { type: 'list',         items: SQL[] }
        | { type: 'order',        dir: 'asc' | 'desc', col: SQL }
        | { type: 'table',        name }
        | { type: 'currentTuple', col, tableName }
```

`{ kind: 'sql', node: SqlNode }` の wrapper を経由するため、`isSQL(v)` の判定と `.add` / `.sub` / `.toFloat` などの chain method の attach はすべて wrapper 側で行う。

binop は `args: SQL[]` の可変長配列。二項演算 (`=`, `<`, `+` 等) は `args.length === 2`、論理結合 (`and`, `or`) は variadic で同じ shape を共有。`and(a, b, c, d)` を nest 無しで表現。evalNode 側も `args.every` / `args.some` の uniform な走査で評価。

`func` は単一 row 上の純粋関数 (`toFloat`, `between`, `at`, distance 系)。evalNode が再帰的に args を解いて即値化。`aggregate` は複数 row の reduction (`count`, `sum`, `avg`, `min`, `max`) で、executor の Aggregate operator が groupBy ごとに state を持ち updateAgg / finalAgg を呼ぶ。type 分離により evalNode の責務は pure func 評価に限定し、aggregate は operator 経路に閉じる。

### `currentTuple`

`db.transaction(fn).run(ctx)` の `fn` 第二引数 `c` は Proxy。任意 property access が `{ type:'currentTuple', col, tableName }` SqlNode を返し、evalNode 内で `ctx.current[col]` を読む。

transaction loop は

```
for each row of primary table:
    ctx.current = row
    await fn(tx, c)
```

の構造。`c.x.sub(1)` のような expression は AST build 時には未確定のまま (col 名と tableName だけ持つ)、eval 時に `ctx.current.x - 1` に解決。

AST build 時点で「現在の row」が未定なため、Proxy の get-trap で property access を SqlNode に変換し、closure 経由で transaction loop の row を参照する形を採用。同じ AST tree を全 row に対して再評価する形式が成立し、interface 側だけで currentTuple を解決できるため、executor は SqlNode の存在を知らずに済む。

### Update / Delete の関数化境界

`planSelect` が Select の `where` を `(row) => boolean` に compile して `Filter` に乗せるのと並行して、`runUpdate` / `runDelete` も interface 側で `where` を predicate に、`set` の各値を setter (`(row) => any`) に変換してから physical Update / Delete op に乗せる。currentTuple を含む式は interface の closure (`ctx.current`) を関数値に閉じ込めるため、executor は SqlNode を受け取らず `predicate` / `setters` の関数だけで動く。

### `compile.ts` / `plan.ts` 分離

`compile.ts` = `evalNode` (SqlNode → 値) + `compilePredicate` / `compileExpr` (SqlNode → 関数)、`plan.ts` = `planSelect` + `buildProjection` + `tableNameOf`。`database.ts` は builder / dispatch / lifecycle のみ。evalNode は currentTuple / column / literal / binop / unop / func / list を 1 関数で網羅し、aggregate / order / table は値化せず executor の Aggregate / Sort operator と plan 側の `tableNameOf` が処理。

### catalog の自動 index 配置

```
column 制約                          access method     index 名
──────────────────────────────────────────────────────────────────
primaryKey() / unique() / order()    nbtree            <table>_<col>_idx
それ以外                             index 無し
```

`isPrimary` / `isUnique` / `hasOrder` のいずれかが立つ column に対し、catalog が空 nbtree を作成。hash index は equi lookup 専用で、catalog の自動経路には現状乗らない。

### rid alignment (DSM の不変条件)

DSM では 1 row が複数 heap に跨る。catalog の `insertRow(name, row)` は column 順に各 heap へ `insert(value)` を発行。同 table の全 column は valueSize = 4 で揃うため、各 heap の fsm は同型の状態遷移を辿り、insert を同期的に直列で呼ぶ限り `(blockNo, slot)` が全 column で一致。

`heap.update(rid, value)` は同一 slot を再利用し row 構造を破壊しない。`heap.delete(rid)` は executor の `makeDelete` が全 column heap に dispatch、index 側 entry は `deleteKey(key, rid?)` で別途 tombstone 化。

### interface ↔ catalog の境界属性

`database.ts > registerTables` が `$col` を catalog の `register(name, def)` に正規化する。def に渡る項目と interface 側にだけ留まる項目。

```
def に渡る          type / isPrimary / isUnique / hasOrder
interface 内に留まる  orderRange / defaultFn / defaultValue / notNull / references / tag
```

留まる側を catalog 経路に流す再設計は Roadmap 参照。

### Buffer pool の二段構え

```
buffer pool
  ├── normal frames  ─── clock-sweep replacement
  │                      pin/unpin で usage counter を上下
  │                      hint = 'normal' のとき選択
  │
  └── ring frames    ─── 単純な循環 buffer
                         hint = 'bulk_read' / 'bulk_write' / 'vacuum' で選択
                         大量 scan / vacuum 中の hot frame 汚染を回避
```

`pin(relId, forkId, blockNo, hint?)` は cache hit なら同じ frame を返し、miss なら hint に応じた pool から victim を選び `smgr.read` で load する。

### Storage relId の組み立て

```
storageRelOf(relId, forkId) = relId * 10000 + forkId

例:  relations  = { cells: { relId: 1 } }
     columns    = [
         { name: 'x', forkId: 10 },    storage relId 10010
         { name: 'y', forkId: 11 },    storage relId 10011
         { name: 'a', forkId: 12 },    storage relId 10012
     ]
     indexes    = [
         { columnIdx: 0, forkId: 1000 },   storage relId 11000  (nbtree on x)
         { columnIdx: 1, forkId: 1001 },   storage relId 11001  (nbtree on y)
     ]
```

heap 内部の `HEAP_FORK = 0` と組み合わせ、最終的な file id は `${storageRel}.0`。column / index ごとに独立した file を作る形式で、relation 単位での truncate や fork 単位での I/O が直交。

## File Layout

責務は Architecture セクション参照。

```
projects/bad-dbms/
├── README.md
├── src/
│   ├── index.ts                    entry / golden path
│   ├── interface/
│   │   ├── column.ts
│   │   ├── table.ts
│   │   ├── sql.ts
│   │   ├── expressions/{conditions,select}.ts
│   │   ├── functions/{aggregate,vector}.ts
│   │   ├── compile.ts
│   │   ├── plan.ts
│   │   └── database.ts
│   └── backend/
│       ├── index.ts
│       ├── catalog.ts
│       ├── executor.ts
│       ├── access/{heap,nbtree,hash,transam}.ts
│       └── storage/{page,free,buffer,smgr,file,lmng}.ts
└── package.json
```

## Roadmap

未着手項目。trigger は「golden path がこれ無しに進めない瞬間」。phase は固定せず、必要になったものから着手。

```
dictionary encoding      $col.tag === 'str' を catalog が認識して dictionary heap を別 fork に確保。
                         insertRow が string → hash → code 変換、read が逆変換。
                         trigger: 文字列 column を golden path に乗せる時

OPFS adapter             createFileAdapter() の adapter pattern に OPFS / Durable Object / Node fs 実装を追加。
                         file.ts の 7 関数 (read/write/sync/close/list/exists/size) を満たす差し替え。
                         trigger: state を tab 越しに永続化する時、または node bench を回す時

snapshot read            tick 内の read 集合を読み取り専用 view に凍結する API。
                         buffer pool の COW frame で実装。
                         trigger: GoL semantics を sequential update から simultaneous update に直す時

worker thread            page directory を持つ親 thread が child worker に scan を分配、
                         per-thread buffer pool で並列実行。message queue で同期。
                         trigger: scan が CPU bound になった時

lock / latch wiring      heap / nbtree / hash の page write で lmng.acquireLatch、commit / abort で releaseAll。
                         single-thread の現状では race source 無しのため未配線。
                         trigger: worker thread を入れる瞬間

external partitioning    HashJoin / Aggregate の build side が memory 超過時に h1 hash で disk spill、
                         probe phase で bucket 単位に hash table 再構築。
                         trigger: build side が buffer pool に収まらない workload が出た時

vacuum                   tombstone 化 slot の物理回収、page compaction、nbtree の bottom-up rebuild。
                         dead 比率の高い page を background で compact。
                         trigger: 永続化 adapter で file size 増大が visible になった時

orderRange を catalog に  register(def) の def に orderRange を追加し、IndexScan の default range として使う経路。
                         現状は interface の generateInitRows 内に閉じる。
                         trigger: catalog が cost-based に IndexScan を選ぶ判断材料を持ちたい時
```

### 明示的に non-goal

時間と精度のトレードオフから、現時点で意図的に作らないもの。

```
tuple 単位の ACID         OLAP / bulk update 前提で tick 単位 commit に倒す
distributed replication   単一 process / 単一 thread で動くものを先に固める
ANSI SQL parser           drizzle-like AST 経由で済むため SQL 文字列のパースは作らない
GIN / GiST / SP-GiST      vector / inverted / spatial index は射程外
WAL / crash recovery      永続化 adapter が transaction を保証する想定で WAL を持たない
```

## Status

現在 golden path として Conway's Game of Life を `src/index.ts` に保持。16 × 16 grid に対し、各 cell ごとに 3 × 3 近傍の `sum(cells.a)` を select し、生存ルールに従って `cells.a` を update する 1 tick が貫通する。

```ts
// src/index.ts (抜粋)
const cells = table('cells', {
        x: uint('x').order(0, W),
        y: uint('y').order(0, H),
        a: float('a').$defaultFn(() => (Math.random() < 0.1 ? 0 : 1)),
})

export const setup = async () => {
        const db = await database({ cells }).all(W * H)
        const tick = db.transaction(async (tx: any, c: any) => {
                const result = await tx
                        .select({ s: sum(cells.a) })
                        .from(cells)
                        .where(
                                and(
                                        between(cells.x, c.x.sub(1), c.x.add(1)),
                                        between(cells.y, c.y.sub(1), c.y.add(1))
                                )
                        )
                const s = (result as any).s ?? 0
                await tx
                        .update(cells)
                        .set({ a: or(eq(s, 3), and(eq(c.a, 1), eq(s, 4))).toFloat() })
                        .from(cells)
                        .where(and(eq(c.x, cells.x), eq(c.y, cells.y)))
        })
        return { db, tick }
}

export const runTicks = async (n: number) => {
        const { db, tick } = await setup()
        for (let i = 0; i < n; i++) await tick.run({})
        return db
}
```

interface → backend → access → storage の四層を貫通し、AST build → planSelect → executor → heap / nbtree → buffer → smgr → file まで実コードで結線済。

backend の `createDatabase()` は in-memory adapter を default として持ち、外部から `fileAdapter` を渡せば永続化 backend へ差し替え可能。`db.stats()` で relation ごとの page 数と buffer pool の cache 状況が取れる。

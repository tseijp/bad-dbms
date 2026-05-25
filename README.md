# bad-dbms

TypeScript で書かれた OLAP 向け relational database。

## Overview

drizzle-like な declarative API から query plan AST を組み立て、
backend が物理 plan に lower して pull-based に execute する OLAP 向け Tuple-Oriented Storage。
tick 単位 bulk commit、tuple 単位の ACID は採用しない。

```sql
user code (table / column / select / update / ...)
   ↓ logical AST  { op: 'Select' | 'Insert' | 'Update' | 'Delete' }
planSelect (interface 側 lowering)
   ↓ physical AST { op: 'SeqScan' | 'Filter' | 'Aggregate' | 'Projection' | 'Sort' | ... }
executor (Volcano pull)
   ↓ rid = [pageId, offset]
access (heap / nbtree)
   ↓ block I/O (relId, forkId, blockNo)
storage (free / page / buffer / smgr)
   ↓ pluggable adapter (memory / OPFS / ...)
```

## Why

OLAP の bulk scan は row-store より column-store が I/O を削減できる。
固定長型 (i32 / f32 / u32) のみを基底に置くと tuple の物理位置が
`valueSize × offset` で決定論的に算出でき、slot array を持たない packed layout が成立。
tombstone は 1 bit / slot の bitmap として page header 直後に集約。

index は user の migration ではなく column 制約 (`primaryKey` / `unique` / `order`) から catalog が自動配置。
browser 上で migration を回せない前提を採るため、schema ───→ index の自動構築を必須とする。

## Architecture

bad-dbms は依存方向が一方向の四層構造。
ファイル単位の責務は次のとおり。

```sql
src/interface/          user 向け drizzle-like API + AST 構築
  column.ts             uint / float / integer / text + 制約
  table.ts              column 集合に $meta を attach
  sql.ts                SqlNode 定義 + chain method の attach
  infer.ts              library user 向け型推論 (TypedColumn / Table / Database / ...)
  types.ts              library 内部の AST / Column / Table 型
  expressions/          eq, and, or, between, not, ...
  functions/            sum, count, avg, min, max, asc, desc, ...
  compile.ts            compileNode + compilePredicate + compileExpr
  plan.ts               planSelect: logical AST ───→ physical AST
  introspect.ts         getTableColumns / getTableConfig
  database.ts           database({tables}) + transaction()
─────────────────────────────────────────────────────────────────
src/backend/            catalog + executor + entry
  catalog.ts            relation / column / index の schema 管理
  executor/             Volcano operator iterator 群
    index.ts            executor entry (operator dispatch)
    scan.ts             SeqScan / NamedScan
    join.ts             NestedLoopJoin
    group.ts            Aggregate / Sort / Distinct / Limit / Projection
    modify.ts           Insert / Update / Delete
    utils.ts            共有 helper
  adapter/              file adapter 群 (memory / nodejs / cloudflare / ...)
  index.ts              createBackend: 全層を wire する entry
─────────────────────────────────────────────────────────────────
src/backend/access/     rid を介した tuple アクセス層
  heap.ts               固定長 record の置き場、rid 採番
  nbtree.ts             B+tree index、forward/backward scan
─────────────────────────────────────────────────────────────────
src/backend/storage/    byte 単位の物理層
  page.ts               1 page の header / tombstone / 値域
  free.ts               page ごとの空き bytes の tree
  buffer.ts             clock-sweep + ring buffer の frame pool
  smgr.ts               relation を block 列に抽象化
```

上位は下位の internal に踏み込まない。
下位は上位の意味論を持たない。
layer 間は `(relId, forkId, blockNo)` と `rid = [pageId, offset]` の 2 種類の identifier だけで会話。

## Storage Model

DSM (Decomposition Storage Model) を一貫採用。
1 column が 1 物理 file 相当の page 列を持つ独立した heap。

```sql
column-store layout (DSM)

cells table = { x: u32, y: u32, a: f32 }

  ┌─heap for column "x"─┐   ┌─heap for column "y"─┐   ┌─heap for column "a"─┐
  │ page 0              │   │ page 0              │   │ page 0              │
  │ ┌─────────────────┐ │   │ ┌─────────────────┐ │   │ ┌─────────────────┐ │
  │ │header (64 bytes)│ │   │ │header (64 bytes)│ │   │ │header (64 bytes)│ │
  │ ├─────────────────┤ │   │ ├─────────────────┤ │   │ ├─────────────────┤ │
  │ │tombstone bitmap │ │   │ │tombstone bitmap │ │   │ │tombstone bitmap │ │
  │ ├─────────────────┤ │   │ ├─────────────────┤ │   │ ├─────────────────┤ │
  │ │x[0], x[1], ...  │ │   │ │y[0], y[1], ...  │ │   │ │a[0], a[1], ...  │ │
  │ └─────────────────┘ │   │ └─────────────────┘ │   │ └─────────────────┘ │
  └─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

### Page layout

`PAGE_SIZE = 4096`, `HEADER_SIZE = 64`。
header は kind / level / flags / prevPageId / nextPageId / highKey / slotCount / tombstoneOffset / valueOffset / valueSize を packed で持つ。

value area の前に tombstone bitmap を置き、`isAlive(slot)` / `setAlive(slot, alive)` で生死を切る。
`capacity(valueSize)` は

```sql
floor((PAGE_SIZE - HEADER_SIZE) * 8 / (valueSize * 8 + 1))
```

で算出。
valueSize=4 (i32 / f32 / u32 共通) なら 1 page あたり 977 slot。

### Access methods

```sql
access method  responsibility       key API
──────────────────────────────────────────────────────────────
heap           rid 採番と           insert(value) ───→ rid
               固定長 record の     read(rid) ───→ value
               物理配置             update(rid, value)
                                    delete(rid)
                                    scan(emit)
nbtree         順序付き index       insert(key, rid)
               leaf linked list で  search(key) ───→ rid
               range                forward(start, end, emit)
                                    backward(start, end, emit)
                                    bulkLoad(sorted)
```

heap / nbtree は同一の `rid = [pageId, offset]` 形式を共有し、
byte 表現には依存しない。access 層を超えた layout 変更が独立に進められる。

heap が rid を発行する唯一の主体。
index は leaf に rid を保持するだけで自前の物理 ID 空間を持たない。
catalog の `insertRow(name, row)` は column 順に heap を呼び出し、
index には heap が返した rid をそのまま渡す直列パイプ。
delete 時の各層の役割分担は Internals > rid alignment 参照。

nbtree は Blink-tree 風に prev/next sibling pointer を持つ。
`LEAF_CAP = INTERNAL_CAP = 64`。
leaf split は右側に新 leaf を切り出して sibling rewire と pivot 伝播を同時に行い、
propagateUp が path stack を pop しながら親 internal に entry を挿入。
root に到達した時点で path が空なら新 root を確保して meta block の rootPageId を書き換え、高さが 1 増える。
merge / borrow は未実装で、delete は leaf slot の tombstone 化のみ。
`bulkLoad(sortedEntries)` は事前 sort 済 input を前提に leaf を `LEAF_CAP` まで密に詰め、
各 leaf の先頭 key を pivot として上位 level を bottom-up に build (split 0 回 / 全 page 1 回 write)。

### Storage layers

```sql
free   ←─── 「どの page に空きがあるか」
            findPage(neededBytes) ───→ blockNo
            update(blockNo, freeBytes)
            extend() ───→ blockNo

page   ←─── 「1 page の header / bitmap / value 並び」
            createPage(bytes?) ───→ {readValue, writeValue, ...}

buffer ←─── 「frame pool と pin / unpin」
            pin(relId, forkId, blockNo, hint?)
            unpin(frame, dirty?)
            flush(frame), flushAll()

smgr   ←─── 「relation を block 列として見る」
            read/write(relId, forkId, blockNo, bytes)
            extend(relId, forkId) ───→ blockNo
            nBlocks(relId, forkId)
            adapter pattern で永続化先 (memory / OPFS / Durable Object / S3 / fs) を差し替え
```

fsm (free space map) は per-relation per-fork の `Uint8Array` を leaf に、
その上に max-of-children を持つ upper 配列を載せる二層 tree。
`floor(freeBytes / 16)` の粗い粒度で空き bytes を保持し、
findPage は upper を走査して候補 group を絞ってから leaf を読む。
buffer の二段 pool 構造は Internals > Buffer pool の二段構え参照。

## Query Plan

interface が logical AST を組み立て、`planSelect` が physical AST に lower、executor が pull-based iterator で駆動。

### Logical AST (interface が emit)

```sql
{ op: 'Select',   projection, table, where, groupBy, having, orderBy, limit, offset, distinct, joins }
{ op: 'Insert',   table, values, returning? }
{ op: 'Update',   table, set, where, returning? }
{ op: 'Delete',   table, where, returning? }
```

`where` / `having` / `set` は SqlNode のまま渡し、lowering 時に `(row) => boolean` または `(row) => any` の関数に compile する。

### Physical AST (executor が consume)

```sql
{ op: 'SeqScan',        table }
{ op: 'NamedScan',      table, name }
{ op: 'Filter',         child, predicate: (row) => boolean }
{ op: 'Projection',     child, fields, projectors }
{ op: 'NestedLoopJoin', left, right, rightName, predicate, kind }
{ op: 'Aggregate',      child, groupBy, aggs: [{ name, kind, field, distinct }] }
{ op: 'Sort',           child, keys: [{ field, dir, eval? }] }
{ op: 'Distinct',       child }
{ op: 'Limit',          child, limit?, offset? }
{ op: 'Insert',         table, values, returning? }
{ op: 'Update',         table, predicate, setters, returning? }
{ op: 'Delete',         table, predicate, returning? }
```

executor の各 operator は `{ next(): Promise<row | null>, close() }` を返す async pull iterator。
`next` は子 iterator の `next` を呼び、必要な変換を施してから返す。
LIMIT は専用 `Limit` op で limit / offset を別々に管理。

`backend.execute(ast)` は iterator を `drain` して `Promise<Row[]>` を返す。
空 row の場合も `[]` を返し、null / undefined にはならない。
aggregate-no-groupBy-zero-input のときは Aggregate operator が
synthetic 0-row を 1 つ emit (count = 0 / sum = 0 / min = Infinity / max = -Infinity)。

### Lowering 例

```sql
db.select({ totalPosts: count() })
  .from(posts)
  .where(eq(posts.userId, 1))
                │
                ▼ planSelect
{ op: 'Projection', fields: ['totalPosts'],
  child: { op: 'Aggregate', groupBy: [], aggs: [{name:'totalPosts', kind:'count', field:''}],
    child: { op: 'Filter', predicate: <compiled fn>,
      child: { op: 'SeqScan', table: 'posts' } } } }
```

## API

drizzle-orm に倣った declarative API。
`table()` で schema を宣言し、`database()` で connection を開き、`select` / `insert` / `update` / `delete` で query を組む。
import は `import { ... } from 'bad-dbms'` を想定し、`table` / `column` / `condition` / `aggregate` / `database` / `introspect` をすべて 1 entrypoint から取得。

### Schema declaration

```ts
import { table, integer, uint, float, text } from 'bad-dbms'

const users = table('users', {
        id: integer('id').primaryKey(),
        name: text('name').notNull(),
        email: text('email').unique(),
        score: float('score').default(0),
        createdAt: integer('created_at').$defaultFn(() => Date.now()),
})

const posts = table('posts', {
        id: integer('id').primaryKey(),
        userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        score: float('score').default(0),
})
```

column factory:

```sql
integer(name?, config?)  ───→ i32 (4 bytes, 数値)
uint(name?, config?)     ───→ u32 (4 bytes, 非負整数)
float(name?, config?)    ───→ f32 (4 bytes, 浮動小数)
text(name?, config?)     ───→ u32 + tag='str' (内部で intern した string id)
column(type, name?, cfg) ───→ 上記 factory の下層 (任意 ColumnType 直指定)
dataTypeOf(type, tag?)   ───→ 'integer' | 'float' | 'text' の宣言文字列
```

column 修飾 (chain method):

```sql
.primaryKey()                       主キー、catalog が nbtree index を自動配置
.unique()                           unique 制約、nbtree index を自動配置
.notNull()                          NOT NULL 制約 (型からも null を剥がす)
.default(value)                     挿入時の既定値 (リテラル固定)
.$defaultFn(() => v)                挿入時の既定値 (関数評価、alias: .defaultFn)
.references(() => col, opts?)       外部キー宣言、opts = { onDelete?, onUpdate? }
```

column は SQL expression としても振る舞い、以下の chain method を持つ:

```sql
.add(x) .sub(x) .mul(x) .div(x) .mod(x)             算術
.eq(x) .ne(x) .lt(x) .lte(x) .gt(x) .gte(x)         比較
.toFloat() .toInt() .toBool()                       型変換
```

### Database connection

```ts
import { database } from 'bad-dbms'
import { createCloudflareAdapter } from 'bad-dbms/adapter/cloudflare'

const db = database({ users, posts })
const dbPersisted = database({ users, posts }, { file: createCloudflareAdapter(env.KV) })
const dbCustom = database({ users, posts }, { adapter: 'memory' })
```

`database(schema)` は in-memory adapter で動く connection を返す。
永続化したい場合は第 2 引数 config に adapter を渡す。

config 一覧 (`DatabaseConfig`):

```sql
execute        (ast) => Row[]  外部 executor を差し込む拡張口 (省略時は内蔵 backend)
pageSize       number          1 page あたりの bytes (default 4096)
frameCount     number          buffer pool の normal frame 数 (default 64)
file           FileAdapter     永続化 adapter (createMemoryAdapter / createCloudflareAdapter / ...)
adapter        AdapterKind     'memory' | 'nodejs' | 'bun' | 'deno' | 'browser' | 'cloudflare' | ...
adapterOptions AdapterOptions  adapter ごとの追加 option (dir / kv / s3 / bucket / ...)
```

`db` の surface:

```sql
db.select(fields?)         select builder
db.selectDistinct(fields?) DISTINCT select builder
db.insert(table)           insert builder
db.update(table)           update builder
db.delete(table)           delete builder
db.transaction(fn)         multi-statement transaction
db.$count(table, where?)   count(*) の shortcut
db.tables                  渡した table 集合をそのまま返す
db.backend                 内蔵 backend handle (catalog / smgr / buffer / fsm)
```

### Queries

#### select

```ts
const all = await db.select().from(users)
const byId = await db.select().from(users).where(eq(users.id, 1))
const projected = await db.select({ id: users.id, name: users.name }).from(users)
const distinct = await db.selectDistinct({ userId: posts.userId }).from(posts)
const aggregated = await db
        .select({ avgScore: avg(posts.score) })
        .from(posts)
        .groupBy(posts.userId)
        .having(gt(avg(posts.score), 50))
const ordered = await db.select().from(posts).orderBy(desc(posts.score), asc(posts.id)).limit(10).offset(20)
const joined = await db
        .select({ user: { name: users.name }, post: { title: posts.title } })
        .from(users)
        .leftJoin(posts, eq(users.id, posts.userId))
```

chain method:

```sql
.from(table)                        FROM
.where(cond)                        WHERE
.groupBy(...cols)                   GROUP BY
.having(cond)                       HAVING (aggregate 後の filter)
.orderBy(...cols)                   ORDER BY (asc / desc で wrap)
.limit(n)                           LIMIT
.offset(n)                          OFFSET
.innerJoin(table, on)               INNER JOIN
.leftJoin(table, on)                LEFT JOIN
.rightJoin(table, on)               RIGHT JOIN
.fullJoin(table, on)                FULL JOIN
```

戻り値は row 配列。`.groupBy` 無しで aggregate のみを projection した場合は単一 row object に unwrap される。

#### insert

```ts
await db.insert(users).values({ id: 1, name: 'Alice', email: 'a@example.com' })
await db.insert(users).values([
        { id: 2, name: 'Bob', email: 'b@example.com' },
        { id: 3, name: 'Carol', email: 'c@example.com' },
])
const rows = await db.insert(users).values({ id: 4, name: 'Dave' }).returning()
```

`.values()` は単一 row でも row 配列でも受ける。
`.returning()` を付けると insert された row 全体の配列を返す (型は `RowOfTable<T>[]`)。
省略時は `{ rowCount: n, changes: n }` を返す。

#### update

```ts
await db.update(posts).set({ score: 0 }).where(eq(posts.userId, 1))
await db
        .update(posts)
        .set({ score: posts.score.add(1) })
        .where(lt(posts.score, 10))
const updated = await db.update(users).set({ name: 'X' }).where(eq(users.id, 1)).returning()
```

`set` の値はリテラルか SQL expression。expression なら row ごとに評価。
`.returning()` で更新後 row 配列。省略時は `{ rowCount: n, changes: n }`。

#### delete

```ts
await db.delete(posts).where(eq(posts.id, 5))
await db.delete(users).where(isNull(users.email))
const removed = await db.delete(posts).where(eq(posts.userId, 1)).returning()
```

`.returning()` で削除前 row 配列。省略時は `{ rowCount: n, changes: n }`。

### Conditions

`condition` 系はすべて `SQL<boolean>` を返し、`where` / `having` / join `on` に渡せる。

```sql
eq(a, b)               a = b
ne(a, b)               a != b
gt(a, b)               a > b
gte(a, b)              a >= b
lt(a, b)               a < b
lte(a, b)              a <= b
and(...conds)          AND (variadic, undefined を無視)
or(...conds)           OR (variadic, undefined を無視)
not(cond)              NOT
inArray(col, values)   IN
notInArray(col, vals)  NOT IN
isNull(value)          IS NULL
isNotNull(value)       IS NOT NULL
between(col, min, max) BETWEEN
notBetween(col, ...)   NOT BETWEEN
like(col, pattern)     LIKE
notLike(col, pattern)  NOT LIKE
ilike(col, pattern)    ILIKE (大文字小文字無視)
```

```ts
where(and(eq(users.id, 1), or(isNull(users.email), like(users.name, 'A%'))))
```

### Order

```sql
asc(col)               ASC sort key
desc(col)              DESC sort key
```

```ts
.orderBy(asc(users.name), desc(users.createdAt))
```

### Aggregates

```sql
count(expr?)           COUNT(expr) または COUNT(*) (expr 省略時)
countDistinct(expr)    COUNT(DISTINCT expr)
sum(expr)              SUM
sumDistinct(expr)      SUM(DISTINCT)
avg(expr)              AVG
avgDistinct(expr)      AVG(DISTINCT)
max(expr)              MAX
min(expr)              MIN
```

```ts
import { count, sum, avg, min, max, countDistinct } from 'bad-dbms'

db.select({ total: count() }).from(users)
db.select({ avgScore: avg(posts.score), maxScore: max(posts.score) }).from(posts)
```

### Introspection

```sql
getTableColumns(table) ───→ Record<string, Column>  column 集合を key 順で取得
getTableConfig(table)  ───→ TableConfig             { name, columns, primaryKeys, foreignKeys, uniqueConstraints, indexes, checks }
dataTypeOf(type, tag?) ───→ string                  data type の表示名
```

drizzle 互換 helper。schema を実行時に走査するときに使う。

### Transactions

```ts
await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: 10, name: 'Eve' })
        await tx.update(posts).set({ score: 100 }).where(eq(posts.userId, 10))
})
```

`tx` は `db` と同じ surface (`select` / `insert` / `update` / `delete` / `transaction` / `rollback`) を持つ。
callback の返り値が `await db.transaction(...)` の結果になる。
`tx.rollback()` を呼ぶと throw 経由で transaction が abort され snapshot に戻る。
内部例外が出ても catalog snapshot から自動 restore。

per-row 走査 mode として、callback が第 2 引数を受ける variant がある。

```ts
const tick = db.transaction((tx, c) => {
        return tx.update(users).set({ active: 1 }).where(eq(users.id, c.id))
})
await tick.run()
```

primary table の各 row に対して callback を呼び、`c.colName` が「現在 row の値」として SQL 式に組み込まれる。

### Raw SQL helpers

```sql
make(node)             SqlNode を SQL<T> wrapper に attach
wrap(value)            任意値を SQL に変換 (既に SQL ならそのまま)
isSQL(value)           SQL guard
```

低レイヤーで AST node を直接構築するときに使う。通常は expression / condition / aggregate helper で十分。

### 戻り値の規約

```sql
Select  Row[]
        aggregate のみ + group by 無しの場合は単一 row object に unwrap
Insert  { rowCount: n, changes: n }
        .returning() を付けると Row[]
Update  { rowCount: n, changes: n }
        .returning() を付けると Row[]
Delete  { rowCount: n, changes: n }
        .returning() を付けると Row[]
```

### 型推論 (library user 視点)

```ts
import type { Database, RowOfTable, InsertRowOfTable, SchemaOf } from 'bad-dbms'

type UserRow = RowOfTable<typeof users>          // { id: number; name: string; email: string | null; ... }
type UserInsert = InsertRowOfTable<typeof users> // notNull 列は必須、それ以外は optional
type UsersSchema = SchemaOf<typeof users>        // column 集合
```

`db.select().from(users)` の戻りは `RowOfTable<typeof users>[]`、
`db.select({ avg: avg(posts.score) }).from(posts)` の戻りは `{ avg: number }[]` として推論される。

## Internals

### SqlNode 一覧

```ts
type SqlNode =
        | { type: 'column'; name; dataType; tableName? }
        | { type: 'literal'; value }
        | { type: 'binop'; op; args: SQL[] } // +, -, *, /, %, =, !=, <, <=, >, >=, and, or, in, like, ilike
        | { type: 'unop'; op; args: SQL[] } // not, isNull, isNotNull
        | { type: 'func'; name; args: SQL[] } // toFloat, toInt, toBool, between
        | { type: 'aggregate'; name; distinct; args: SQL[] } // count, sum, avg, min, max
        | { type: 'list'; items: SQL[] }
        | { type: 'order'; dir: 'asc' | 'desc'; col: SQL }
        | { type: 'table'; name }
```

`{ kind: 'sql', node: SqlNode }` の wrapper を経由するため、
`isSQL(v)` の判定と `.add` / `.sub` / `.toFloat` などの chain method の attach はすべて wrapper 側で行う。

binop は `args: SQL[]` の可変長配列。
二項演算 (`=`, `<`, `+` 等) は `args.length === 2`、
論理結合 (`and`, `or`) は variadic で同じ shape を共有。
`and(a, b, c, d)` を nest 無しで表現。
`compileNode` 側も `args.every` / `args.some` の uniform な走査で評価。

`func` は単一 row 上の純粋関数 (`toFloat` / `toInt` / `toBool` / `between`)。
`compileNode` が再帰的に args を解いて即値化。
`aggregate` は複数 row の reduction (`count`, `sum`, `avg`, `min`, `max`) で、executor の Aggregate operator が groupBy ごとに state を持ち update / final を呼ぶ。
type 分離により compileNode の責務は pure func 評価に限定し、aggregate は operator 経路に閉じる。

### per-row transaction の cursor proxy

`db.transaction(fn)` が第 2 引数 `c` を取る per-row variant では、`c` は Proxy で実装されており、
SqlNode を発行せず **JavaScript 値そのもの** を返す。
transaction loop は primary table の各 row を `_ctx.current` にセットし、
`c.colName` で `_ctx.current[colName]` を直接返す。

```sql
for each row of primary table:
    _ctx.current = row
    await fn(tx, proxy(row))
```

```ts
db.transaction(async (tx, c) => {
        const neighbors = await tx.select({ total: count() }).from(posts).where(eq(posts.userId, c.id))
        if (neighbors.total > 10) await tx.update(users).set({ active: 1 }).where(eq(users.id, c.id))
})
```

`c.id` は callback 内で常に「現在 row の id (値)」として展開される。
condition helper (`eq(users.id, c.id)`) はその値をリテラルとして SQL に焼き込むため、
executor は専用 SqlNode を知らずに済む。

### Update / Delete の関数化境界

`planSelect` が Select の `where` を `(row) => boolean` に compile して `Filter` に乗せるのと並行して、`database.ts` の `_run` も `where` を predicate に、`set` の各値を setter (`(row) => unknown`) に変換してから physical Update / Delete op に乗せる。
SqlNode は interface の closure に閉じ込め、executor は `predicate` / `setters` の関数だけで動く。

### `compile.ts` / `plan.ts` 分離

`compile.ts` = `compileNode` (SqlNode ───→ 関数) + `compilePredicate` / `compileExpr`、`plan.ts` = `planSelect` (logical ───→ physical lowering)。
`database.ts` は builder / dispatch / lifecycle のみ。
compileNode は column / literal / binop / unop / func / list を 1 関数で網羅し、aggregate / order / table は関数化せず executor の Aggregate / Sort operator と plan 側の `tableNameOf` が処理。

### catalog の自動 index 配置

```sql
column 制約          access method  index 名
─────────────────────────────────────────────────────────────
primaryKey / unique  nbtree         <table>_<col>_idx
それ以外             index 無し
```

`isPrimary` / `isUnique` のいずれかが立つ column に対し、catalog が空 nbtree を作成。

### rid alignment (DSM の不変条件)

DSM では 1 row が複数 heap に跨る。
catalog の `insertRow(name, row)` は column 順に各 heap へ `insert(value)` を発行。
同 table の全 column は valueSize = 4 で揃うため、各 heap の fsm は同型の状態遷移を辿り、insert を同期的に直列で呼ぶ限り `(blockNo, slot)` が全 column で一致。

`heap.update(rid, value)` は同一 slot を再利用し row 構造を破壊しない。
`heap.delete(rid)` は executor の Delete operator が全 column heap に dispatch、null 管理用の codec set からも該当 rid を除去する。

### interface ↔ catalog の境界属性

`database.ts > registerTables` が `$col` を catalog の `register(name, def)` に正規化する。

```sql
def に渡る  name / type / isPrimary / isUnique / notNull / isText / defaultValue / defaultFn / references
```

text 列は catalog 側で intern table を持ち、id ↔ string の往復で固定長 storage に落とす。

### Buffer pool

```sql
buffer pool
  └── frames  ─── clock-sweep replacement
                  pin/unpin で usage counter を上下
                  dirty frame は victim 化前に smgr.write で flush
```

`pin(relId, forkId, blockNo)` は cache hit なら同じ frame を返し、miss なら usage = 0 の victim を選んで `smgr.read` で load する。
bulk scan 用の ring buffer (vacuum / bulk_load 時の hot frame 汚染回避) は今後の拡張ポイント。

### Storage relId の組み立て

```sql
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

heap 内部の `HEAP_FORK = 0` と組み合わせ、最終的な file id は `${storageRel}.0`。
column / index ごとに独立した file を作る形式で、relation 単位での truncate や fork 単位での I/O が直交。

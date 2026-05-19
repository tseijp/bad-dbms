# backend layer test list

## scope

対象は `src/backend/` 直下の以下 3 module。

```
catalog.ts   relation / column / index の schema 管理
executor.ts  Volcano operator iterator + evalNode
index.ts     createDatabase: 全層を wire する entry
```

## catalog

table 定義から system schema を自動構築する。

### test list

`register(name, def)` で渡した column descriptor 配列が `resolve(name)` で復元できる (column 順、type、byteSize、forkId、isPrimary、isUnique、hasOrder)。

`registerTable(tableObj)` は `tableObj.$meta.columns[i].$col` を読み取り、`register(name, def)` と同じ relation 状態を構築する。

`isPrimary` または `isUnique` が立つ column に対して、catalog は自動で nbtree index descriptor を 1 件生成する (`<table>_<col>_idx`)。

`hasOrder` が立つ column に対しても自動で nbtree index descriptor を生成する。

上記いずれの制約も立っていない column に対しては index descriptor が生成されない。

`tupleDescriptor(rel)` は `{ columns: [{name, type, byteSize, forkId, heap, indexes}] }` の構造を返し、executor が必要とする情報を含む。

`insertRow(name, row)` は column 順に各 column の heap へ `insert(value)` を発行し、全 column で得られる rid の `[blockNo, slot]` が一致する (DSM rid alignment)。

`insertRow` で得た rid を使って `tupleDescriptor` 経由で全 column heap に `read(rid)` すると、insert した row が復元できる。

自動生成された index は初回 `bulkLoad` が走り、`insertRow` 完了直後の `search(key)` で同じ rid を引ける。

`scanTable(nameOrTable, emit)` は table の全 alive rid を emit し、emit callback が false を返した時点で停止する。

`resolve(name)` は文字列名と `Table` object のどちらを渡しても同じ relation descriptor を返す。

## executor

Volcano pull-based iterator。

### test list

`SeqScan { table }` は当該 table の column 0 の heap を scan して全 alive rid を順に next() で返す。

`Filter { child, predicate }` は子 iterator から受け取った row のうち `predicate(row) === true` のものだけを next() で返す。

`Projection { child, fields }` は子 iterator の row から `fields` に含まれる column 名だけを取り出した object を next() で返す。

`Sort { child, keys }` は子 iterator の全 row を集めてから keys に従って並べ、next() で順に返す。

`Aggregate { child, groupBy: [], aggs: [{name, kind:'count'}] }` は子 iterator の row 数を 1 row の `{ name: count }` として返す。

`Aggregate` の kind が `sum / avg / min / max` のとき、field 上の値で正しく集約された 1 row を返す。

`Aggregate { groupBy: ['k'] }` は groupBy key ごとに 1 row 出力し、各 row に groupBy key と aggregate の結果を含む。

`groupBy = []` かつ input row が 0 件かつ aggregate が指定された場合、`makeAggregate` は synthetic 0-row を 1 件 emit する (count = 0 など)。

`NestedLoopJoin { left, right, predicate }` は left の各 row と right の各 row の cross 組について predicate を評価し、true となった組を merge して返す。

`HashJoin { left, right, leftKey, rightKey }` は左を build、右を probe する形で結合し、`leftKey === rightKey` の組を返す。

`Update { table, predicate, setters }` は table の全 rid を走査し、`predicate(row) === true` の row について `setters[col](row)` の戻り値で対応 column の heap を `update`、結果として `{ updated: n }` を返す。

`Delete { table, predicate }` は table の全 rid を走査し、`predicate(row) === true` の rid について全 column heap に `heap.delete(rid)` を dispatch、結果として `{ deleted: n }` を返す。

`Insert { table, values }` は values 配列の各 row について `catalog.insertRow(name, row)` を呼び、`{ rowCount: n }` を返す。`.returning()` 経路では rid 配列も返せる。

evalNode は `column / literal / binop / unop / func / list / currentTuple / raw / identifier / placeholder` の各 SqlNode を 1 関数で評価し、`column` は `node.name` から row 値を、`binop` / `unop` は `args[]` から再帰評価する。

evalNode の `binop` で op が `and` / `or` のとき、`args` の length が 2 以上でも `every` / `some` で評価される (variadic 対応)。

evalNode の `currentTuple` は `ctx.current[node.col]` を読む。`ctx` 未指定なら undefined を返す。

drain した executor の戻り値は空のとき `[]` であり、null / undefined ではない。

## index (entry)

createDatabase が全層を wire する。

### test list

`createDatabase(config)` は `{ catalog, execute, transaction, stats, flush }` を返し、すべて関数 / object。

`execute(ast)` は `Promise<any[]>` を返す async 関数。

`{ op: 'InitAll', count, tables }` を `execute` に渡すと `catalog.registerTable` が tables の全 table に対して呼ばれる。

`{ op: 'Select', table, ... }` を `execute` に渡すと、planSelect で lower された physical AST が executor を回って row 配列を返す。

`{ op: 'Insert', table, values }` を `execute` に渡すと、対象 table に row が挿入され、戻り値が `{ rowCount: values.length }` を含む。

`{ op: 'Update', table, predicate, setters }` を `execute` に渡すと、predicate を満たす row の対応 column heap の値が setter の戻り値で書き換わる。

`{ op: 'Delete', table, predicate }` を `execute` に渡すと、predicate を満たす rid が全 column heap で alive=false になる。

`transaction(fn)` は `transam.begin` を呼び、fn の resolve 時に `transam.commit`、reject 時に `transam.abort` を呼ぶ。

`stats()` は catalog から page 数 / tuple 数 / index 深さの集計値を返す。

`flush()` は buffer.flushAll() を呼んで dirty frame をすべて smgr 経由で書き出す。

config の `fileAdapter` / `pageSize` / `frameCount` / `ringCount` が省略されたとき、それぞれの default 値で全層が wire される。

<!--
Roadmap (未実装): partial index、column pruning に基づく projection 経路、external partition hash join、parallel scan、column store compression、external sort spill はテスト対象外。
-->

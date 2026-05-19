# access layer test list

## scope

対象は `src/backend/access/` の以下 4 module。

```
heap.ts     rid 採番 + 固定長 record の物理配置
nbtree.ts   B+tree (Blink-tree 風)、forward/backward range scan
hash.ts     linear hashing、equi lookup 専用
transam.ts  xid 発行 + commit log + snapshot
```

rid は `[pageId, offset]` 形式。byte 表現には依存しない。

## heap

table 本体の最終データ置き場。

### test list

`insert(value)` は `[pageId, offset]` 形式の rid を返す。

`insert(v1) ───→ insert(v2)` の連続呼び出しで返る rid は、同一 page 内なら `offset` が単調増加。

`read(rid)` は直前に `insert(value)` で書いた値を返す。

`update(rid, newValue)` 直後の `read(rid)` は newValue を返し、rid は同一値のまま再利用される。

`delete(rid)` 直後の `read(rid)` は undefined (または alive 判定で除外) を返す。

`delete(rid)` 後、その slot は `scan(emit)` の emit から除外される。

`scan(emit)` は alive な全 `(rid, value)` を一度ずつ emit する。

`scan(emit)` の emit callback が `false` を返した時点で残りの slot に対する emit は走らない (打ち切り)。

1 page の `capacity` を超える件数を `insert` すると、自動で次の block を `smgr.extend` で確保し、rid の `pageId` が次の値に切り替わる。

`bulkLoad(values)` は append-only path で全 value を順に詰め、入力順に対応する rid 配列を返す。

`delete` 後の slot に対する `update` は no-op (alive 化はしない / 値は更新しない) として扱われる。

## nbtree

順序付き index。Blink-tree 風に prev/next sibling pointer を持つ。

### test list

初回 `createNBTree(...)` 時点で meta block (block 0) と空 leaf root (block 1) が `smgr.extend` で確保され、meta の slot 0 に rootPageId = 1 が書かれる。

`insert(key, rid)` 後の `search(key)` は同じ key で挿入した rid を返す。

未挿入 key に対する `search(key)` は undefined を返す。

`insert` を `LEAF_CAP` 件未満で繰り返している間は leaf split が発生せず、root の pageId は 1 のまま不変。

`LEAF_CAP` を超える件数を順序通り insert すると leaf split が発生し、新 leaf が右側に確保され、`nextPageId` / `prevPageId` で sibling pointer がつながる。

leaf split で生まれた新しい pivot key は親 internal に propagateUp され、internal の `slotCount` が +1 される。

root が full の状態で更に split が起きると新 root が確保され、meta block の rootPageId が新 root の pageId に書き換えられ、tree の高さが 1 増える。

`forward(start, end, emit)` は `start <= key <= end` の rid を leaf sibling pointer 経由で昇順に emit する。

`forward` の emit callback が false を返した時点で残り leaf への走査が停止する。

`backward(start, end, emit)` は同じ範囲を降順に emit する。

`bulkLoad(sortedEntries)` は事前 sort 済 input から split を 1 回も起こさず leaf を `LEAF_CAP` まで密に詰め、bottom-up で上位 level を build する。

`bulkLoad` 完了後の `search(key)` は input にあった key を rid と共に返し、`forward(min, max, emit)` で全件が昇順に emit される。

## hash

linear hashing、equi lookup 専用。

### test list

初回 `createHashIndex(...)` 時点で meta block が確保され、`nBuckets / splitPointer / level` が初期値で書かれる。

`insert(key, rid)` を行い、`lookup(key, emit)` で同じ rid が emit される。

同一 key に複数 rid を `insert` した後、`lookup(key, emit)` はそれら全 rid を順に emit する。

`lookup` の emit callback が false を返した時点で同 bucket / overflow chain の残り走査が停止する。

`equal` factory 引数が false を返す key に対する `lookup` は emit を発生させない。

1 bucket の primary page が満杯になると `nextPageId` で新 overflow block が連結され、続く `insert` は overflow chain 末尾に書かれる。

総 entry 数 / nBuckets が 1.5 を超えた瞬間に incremental split が 1 bucket だけ走り、`splitPointer` が +1。

`splitPointer` が `1 << level` に達した直後の `insert` で splitPointer が 0 に戻り、level が +1 される。

`deleteKey(key)` は当該 key の slot を tombstone (`setAlive(slot, false)`) 化し、続く `lookup(key, emit)` は当該 rid を emit しない。

`bulkLoad(entries)` は input の全 entry が `lookup` 可能になる。

## transam

xid 発行と snapshot 構築。

### test list

`begin()` は新しい xid を返し、clog 上で `in_progress` 状態。

`begin` 連続呼び出しで返る xid は単調増加。

`commit()` 直後、直前の `current()` の xid は clog 上で `committed`、`current()` は null。

`abort()` 直後、直前の `current()` の xid は clog 上で `aborted`、`current()` は null。

`snapshot()` は `xmin / xmax / xip(Set) / cid / takenAt` を持ち、`xmin` は取得時点で活動中の最小 top xid、`xmax` は次に発番される xid、`xip` は取得時点の活動集合の凍結 copy。

snapshot 取得後に別 transaction が `begin` / `commit` / `abort` しても、その snapshot object の `xmin / xmax / xip` の値は変化しない (凍結性)。

`isVisible(xid, snap)` は `xid < snap.xmin` かつ clog が `committed` なら true、それ以外で `committed` でも `xid >= snap.xmax` または `snap.xip` に含まれるなら false。

`savepoint(name)` は親 xid を持つ sub-state を作り `current()` がそれを返し、`parent` link 経由で親 state に辿れる。

`releaseSavepoint(name)` / `rollbackSavepoint(name)` は対応する sub-state を畳んで `current()` を親に戻す。

`xidStatus(xid)` は clog に存在する xid の現在 status (`in_progress` / `committed` / `aborted`) を返す。

<!--
Roadmap (未実装): nbtree merge / borrow、page checksum 検証、parallel worker thread への lock/latch wiring、vacuum / squeeze はテスト対象外。
-->

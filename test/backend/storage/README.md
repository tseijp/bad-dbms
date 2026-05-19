# storage layer test list

## scope

対象は `src/backend/storage/` の以下 6 module。

```
file.ts    byte I/O 境界
page.ts    1 page の header / tombstone / 値域
buffer.ts  frame pool (clock-sweep + ring)
free.ts    page ごとの空き bytes を表す tree
smgr.ts    relation を block 列として抽象化
lmng.ts    logical lock + physical latch
```

## file

物理 byte 列の読み書きを adapter 経由で抽象化する境界。

### test list

書き込み済み offset から `length` だけ read すると、書き込んだ byte 列が同じ並びで返る。

write 領域を超えた offset から read すると、領域外は 0 で埋められた `Uint8Array` が返る。

未書き込み id に対する read は length と等しい長さの 0 埋め `Uint8Array` を返す。

既存 buffer の末尾を越える offset へ write すると underlying buffer が必要な長さに自動拡張され、続く read で拡張後の byte が読める。

adapter を別実体に差し替えても `createFile(adapter)` の戻り値の API surface (`read / write / sync / close / exists / size`) は同一の signature で振る舞う。

`size(id)` は書き込み済みの最大 offset + length と一致する。

`exists(id)` は一度でも write を受けた id に対して true、それ以外は false を返す。

## page

`PAGE_SIZE = 4096`, `HEADER_SIZE = 64`、tombstone bitmap、固定長 packed value area で構成された 1 page の解釈。

### test list

`createPage()` 引数なしで生成した page の header は kind / level / flags / prevPageId / nextPageId / highKey / slotCount / tombstoneOffset / valueOffset / valueSize の各 field が初期値で読める。

`setHeader(partial)` で kind / valueSize 等を書き換えた直後の `getHeader()` は書き換えた値だけが反映され、他の field は不変。

`writeValue(slot, type, v)` で書いた `slot` を `readValue(slot, type)` で読むと書き込み値と同じ値が返る (`i32` / `u32` / `f32` 3 型それぞれ)。

`setAlive(slot, true)` 直後の `isAlive(slot)` は true、`setAlive(slot, false)` 直後の `isAlive(slot)` は false。

`setAlive` で生死を切り替えた slot 以外の slot の `isAlive` 値は変化しない (tombstone bitmap が slot 単位で独立)。

`capacity(valueSize)` は `floor((PAGE_SIZE - HEADER_SIZE) * 8 / (valueSize * 8 + 1))` を返し、`valueSize = 4` で 977。

`liveCount()` は alive な slot 数と一致し、`setAlive(slot, true/false)` の遷移ごとに 1 ずつ増減する。

leaf page で `writeLeafEntry(slot, key, rid)` した後の `readLeafEntry(slot)` は `{ key, ridPageId, ridOffset }` を返し、書き込んだ key と rid に一致する。

internal page で `writeInternalEntry(slot, key, childPageId)` した後の `readInternalEntry(slot)` は同じ key と childPageId を返す。

`HEADER_SIZE = 64` で固定された position に書かれた header byte の中に、tombstone bitmap も value area の byte もはみ出さない (`tombstoneOffset >= HEADER_SIZE`, `valueOffset >= tombstoneOffset + ceil(capacity / 8)`)。

## buffer

frame pool は clock-sweep の normal pool と bulk hint 用 ring pool の二段構え。

### test list

`pin(relId, forkId, blockNo)` を初回呼び出しすると cache miss として `smgr.read(relId, forkId, blockNo)` が呼ばれ、その byte 列を持つ frame が返る。

同じ `(relId, forkId, blockNo)` を続けて `pin` すると同一 frame が返り、`smgr.read` は再度呼ばれない (cache hit)。

`pin` のたびに対象 frame の `pinCount` が +1、`unpin(frame)` のたびに -1 され、`pinCount` は呼び出し回数の差と一致。

`unpin(frame, true)` で dirty 通知した frame は `flush(frame)` 時に `smgr.write` が呼ばれる。`unpin(frame, false)` で dirty 通知していない frame に対しては `flush(frame)` が `smgr.write` を呼ばない。

normal pool の全 frame が pin され使用中になった状態で、normal hint の新しい `pin` を発行すると、`pinCount = 0` かつ `usage = 0` の frame を clock-sweep で victim として再利用する。

`hint = 'bulk_read' | 'bulk_write' | 'vacuum'` の `pin` は ring pool 側の frame を循環的に割り当て、normal pool の frame は victim にしない。

`flushAll()` 呼び出し後、dirty フラグが立っていた全 frame について `smgr.write` が呼ばれている。

`pin` で取得した frame の `bytes` プロパティの長さは pageSize と一致する。

## free

per-relation per-fork の free space map (`Uint8Array` leaf + max-of-children upper)。

### test list

新しい relation+fork に対する初回 `findPage(relId, forkId, neededBytes)` は -1 を返す (どの block も登録されていない)。

`extend(relId, forkId)` は `smgr.extend(relId, forkId)` を呼んで返ってきた blockNo を返し、その block の free 値を最大値で初期化する。

`update(relId, forkId, blockNo, freeBytes)` 直後の `findPage(relId, forkId, X)` は、`X <= freeBytes` なら当該 blockNo を返す。

`findPage` が候補無し (どの block の free 値も needed を満たさない) のとき -1 を返す。

`update` が leaf の値を書き換えた後、upper 配列が max-of-children を再計算しており、root から `findPage` が降りても整合性が取れている。

複数 block を保持する relation+fork で、`needed` を満たす block が複数あるとき、`findPage` はそのいずれかを返す (どちらでも可)。

同じ relation+fork に対し別 relation+fork の `update` を発行しても、対象 relation+fork の `findPage` 結果は変化しない (per relation+fork で独立)。

## smgr

`(relId, forkId, blockNo)` を file 上の byte offset に翻訳する dispatcher。

### test list

`extend(relId, forkId)` は handle.nBlocks を +1 して新しい blockNo を返し、その block を pageSize 分の 0 byte で書き込んだ状態にする。

`extend` 直後の `nBlocks(relId, forkId)` は extend 前 + 1 と一致する。

`write(relId, forkId, blockNo, bytes)` した直後の `read(relId, forkId, blockNo)` は書き込んだ byte 列と完全一致した `Uint8Array` を返す (長さ pageSize)。

異なる `(relId, forkId)` への write は互いに干渉しない (file path `${relId}.${forkId}` で完全に分離)。

同一 relation の異なる fork (`0 = main`, `1 = fsm`, `2..N = index`) は独立に伸縮し、片方の `extend` が他方の `nBlocks` を変化させない。

`getHandle(relId, forkId)` は同一 `(relId, forkId)` に対し常に同一 handle object 参照を返す (handle cache)。

`truncate(relId, forkId, nBlocks)` は handle.nBlocks をその値に切り詰める。

## lmng

logical lock (transaction 粒度) と physical latch (operation 粒度) を同一 module で扱う。

### test list

未取得 tag に対する `acquireLock(tag, mode, xid)` は即座に resolve する Promise を返す。

shared lock を保持中の tag に対し、別 xid からの shared lock 要求は即座に resolve する。

shared lock を保持中の tag に対し、別 xid からの exclusive lock 要求は pending となり、保持側が `releaseLock` した瞬間に resolve する。

exclusive lock を保持中の tag に対し、別 xid からの shared / exclusive 要求は pending となる。

`releaseAll(xid)` は当該 xid が保持していた全 lock を解放し、待機していた他 xid の Promise が解決できる状態にする。

waits-for graph が cycle を形成する状況で、最後に待機列に入った xid (= 最若 xid) の Promise が deadlock として reject される。

`acquireLatch(tag, 'read')` は同 tag の read を複数同時に取得でき、戻り値 boolean が true。

`acquireLatch(tag, 'write')` は read / write を 1 件でも保持中なら false を返し、保持者が `releaseLatch` した後の再要求は true を返す。

`releaseLatch(tag, mode)` の呼び出しが対応する acquire の counter を 1 減らす。

<!--
Roadmap (未実装): WAL flush boundary、checkpoint、page checksum、shared buffer ring の dynamic resize、latch の blocking 版、deadlock 検出の autovacuum cancellation などはテスト対象外。
-->

src/backend/storage/buffer/README

# Shared Buffer Access Rules についての注釈

shared disk buffer には 2 つの独立した access control メカニズムが存在します。
すなわち、reference count (別名 pin count) と buffer content lock です。 (実際には、
3 番目の access control level も存在します。relation に属する任意の page に合法的に
アクセスする前に、その relation に対する適切な種類の lock を保持していなければ
なりません。relation-level lock についてはここでは扱いません。)

Pins: buffer に対して何らかの操作を行う前に、その buffer に対して "pin を保持" (reference count をインクリメント)
していなければなりません。pin されていない buffer は、いつでも reclaim されて
別の page のために再利用される対象となるため、それに触れることは安全ではありません。通常、pin は ReadBuffer によって取得され、
ReleaseBuffer によって解放されます。単一の backend が
同じ page を同時に複数回 pin することは許容されており、実際よく行われます。buffer manager は
これを効率的に処理します。pin を長時間
保持することは許容されています --- 例えば、sequential scan は現在の page に対する pin を、
その page 上のすべての tuple の処理が完了するまで保持し続けます。これは、もしそのスキャンが join の outer scan である場合、
かなり長い時間になる可能性があります。同様に、btree index scan は
現在の index page に対する pin を保持することがあります。これが許容されるのは、通常の
operation では page の pin count が 0 になるのを決して待たないからです。 (そのような待機が必要となる
ものはすべて代わりに relation-level lock を取得することによって処理されるため、
それを先に取得しておいたほうが良いのです。) しかし、pin
は transaction 境界を越えて保持することはできません。

Buffer content lock: buffer lock には 3 種類あります。shared、
share-exclusive、exclusive です:
a) 複数の backend が同じ buffer に対して shared lock を保持できます
(代わりに READ lock と呼ばれる場合もあります)
b) 1 つの backend が buffer に対して share-exclusive lock を保持しているときに、複数の
backend が share lock を保持できます
c) exclusive lock は、他の誰かが shared、
share-exclusive、または exclusive lock を保持することを防ぎます。
(代わりに WRITE lock と呼ばれる場合もあります)

これらの lock は短期間で使用することを意図しています。長く保持すべきではありません。
buffer lock は LockBuffer() によって取得・解放されます。単一の backend が
同じ buffer に対して複数の lock を取得しようとしても _動作しません_。
buffer を lock しようとする前に、その buffer を pin する必要があります。

Buffer access rule:

1. tuple を求めて page を scan するには、pin と少なくとも share lock を保持しなければなりません。
   shared buffer 内の tuple の commit status (XID と status bit) を調べる場合も同様に、
   pin と少なくとも share lock を保持しなければなりません。

2. tuple が興味深い (現在の transaction から可視である) ことを判定したら、
   content lock を解放しつつ、buffer pin を保持している限り
   tuple の data にアクセスし続けることができます。これは
   一般的に heap scan で行われていることです。なぜなら、heap_fetch によって返される tuple は
   shared buffer 内の tuple data へのポインタを含んでいるからです。したがって、pin が保持されている間
   tuple が消失することはありません (規則 #5 を参照)。その状態は
   変化する可能性がありますが、可視性の初回判定が行われた後はそれは問題にならないと仮定されています。

3. tuple を追加したり、既存の tuple の xmin/xmax フィールドを変更するには、
   対象となる buffer に対する pin と exclusive content lock を保持しなければなりません。
   これにより、可視性チェックを行っている間に他の誰かが tuple の部分的に更新された状態を
   見てしまうことを防ぎます。

4. page 上の非クリティカルな情報 ("hint bits") は、
   page に share-exclusive lock と pin のみを保持した状態で変更可能です。すでに share lock のみを保持している場合
   このような変更を行うには、BufferBeginSetHintBits() と
   BufferFinishSetHintBits() (複数の hint bit を設定する場合) または
   BufferSetHintBits16() (単一の hint bit を設定する場合) を使用します。

例えば heapam の場合、share-exclusive lock を使うと、buffer に share-exclusive lock と
pin のみを保持した状態で、tuple の commit status bit
(つまり、HEAP_XMIN_COMMITTED、HEAP_XMIN_INVALID、
HEAP_XMAX_COMMITTED、または HEAP_XMAX_INVALID を t_infomask に OR する) を更新できます。これが許容されるのは、ほぼ同時刻に
その tuple を見ている別の backend も同じ bit を
field に OR するため、競合する更新の risk はほとんどないかゼロだからです。さらに、
仮に競合が発生したとしても、1 つの bit-update が失われて後で再度行う必要があるという程度のことです。これら 4 つの bit は
単なる hint (pg_xact 内の transaction status lookup の結果をキャッシュしているもの) であるため、
競合する更新によって 0 にリセットされても大きな損害はありません。
ただし、HEAP_XMIN_INVALID と HEAP_XMIN_COMMITTED の両方を設定することによって
tuple は frozen されることに注意してください。これはクリティカルな更新であり、それに応じて
exclusive buffer lock が必要です (またこれは WAL-log を取らなければなりません)。

5. page 上の tuple を物理的に削除したり free space を compact するには、
   pin と exclusive lock を保持し、_かつ_ exclusive lock を保持している間に、buffer の shared reference count が
   1 である (つまり、他の backend が pin を保持していない) ことを観察しなければなりません。これらの条件が満たされていれば、exclusive lock が解放されるまで
   他の backend は page scan を実行できず、また、
   再度調べると期待しているような既存の tuple への reference を
   他の backend が保持していることもありません。cleanup 実行中に別の backend が
   buffer を pin する (refcount をインクリメントする) かもしれませんが、
   shared または exclusive content lock を取得するまでは、実際に page を調べることはできないことに注意してください。

規則 #5 で必要となる lock を取得するには、bufmgr の routine
LockBufferForCleanup() または ConditionalLockBufferForCleanup() を使用します。これらはまず
exclusive lock を取得し、その後、shared pin count が現在

1. でない場合、ConditionalLockBufferForCleanup() は exclusive lock を解放して
   false を返します。一方、LockBufferForCleanup() は exclusive lock を解放
   (ただし caller の pin は保持) し、別の backend から signal されるまで待機し、
   その後再試行します。signal は、UnpinBuffer が
   shared pin count を 1 に減らしたときに発生します。上記のとおり、この操作は lock を取得するまでにかなり待つ
   必要があるかもしれませんが、並行 VACUUM の場合これは大した問題ではありません。現在の実装は、
   特定の shared buffer に対する pin-count-1 の単一の waiter のみをサポートします。これは
   VACUUM の用途には十分です。なぜなら、いずれにせよ単一の relation に対して並行に複数の VACUUM を
   実行することは許可されていないからです。recovery や VACUUM 外で cleanup lock を取得しようとする者は、
   関数の条件付きバリアントを使用しなければなりません。

2. buffer を write out するには、share-exclusive lock が保持されている必要があります。これは、
   buffer が write out されている間に buffer が変更されることを防ぎます。さもなければ、
   checksum が破損したり、direct-IO 使用時に OS や device level で問題が発生する可能性があります。

## Buffer Manager の内部ロック

PostgreSQL 8.1 より前は、shared buffer manager 自体のすべての operation は
単一のシステム全体の lock、BufMgrLock によって保護されていましたが、
当然ながらこれは contention の源であることが判明しました。新しい locking 方式では、
一般的なコードパスでシステム全体の exclusive lock を取得することを避けています。
その動作は次のとおりです:

- BufMappingLock というシステム全体の LWLock があり、これは概念的には
  buffer tag (page identifier) から buffer への mapping を保護しています。
  (物理的には、buf_table.c が維持する hash table を保護するものと考えられます。)
  あるタグに対する buffer が存在するかどうかを調べるには、
  BufMappingLock の share lock を取得するだけで十分です。見つかった buffer (もしあれば) は
  BufMappingLock を解放する前に pin しなければならないことに注意してください。
  任意の buffer の page assignment を変更するには、
  BufMappingLock の exclusive lock を保持しなければなりません。この lock は buffer の
  header field を調整し、buf_table hash table を変更する間ずっと保持しなければなりません。exclusive lock を必要とする唯一の一般的な
  operation は、まだ shared buffer に存在しない page を読み込むことであり、これは少なくとも kernel call と
  通常 I/O の待機を必要とするため、いずれにしても遅い処理になります。

- PG 8.2 以降、BufMappingLock は NUM_BUFFER_PARTITIONS 個の
  独立した lock に分割され、それぞれが buffer tag 空間の一部を保護します。これにより、
  通常のコードパスでの contention をさらに削減できます。
  特定の buffer tag が属する partition は、tag の hash value の
  下位 bit から決定されます。上記の規則は、各 partition に対して
  独立して適用されます。複数の partition を同時に lock する必要がある場合、
  deadlock の risk を避けるために partition 番号順に lock する必要があります。

- 独立したシステム全体の spinlock、buffer_strategy_lock は、
  置換用の buffer を選択する operation の相互排他を提供します。ここで spinlock が
  使用されるのは、lightweight lock よりも効率のためです。buffer_strategy_lock を保持している間は、他のいかなる種類の lock も
  取得すべきではありません。これは、buffer replacement が複数の backend において
  妥当な並行性で行われることを可能にするために不可欠です。

- 各 buffer header には spinlock が含まれており、その buffer header の field を
  調べたり変更したりするときに取得しなければなりません。これにより、
  ReleaseBuffer のような operation がシステム全体の lock を取得することなく、ローカルな状態変更を
  行うことが可能になります。LWLock ではなく spinlock を使用するのは、
  lock を数命令以上保持する必要がある場合がないからです。

buffer header の spinlock は buffer 内に保持されている data へのアクセスを制御しないことに注意してください。
各 buffer header にはまた LWLock、すなわち
"buffer content lock" が含まれており、これが buffer 内の data にアクセスする権利を表します。
これは上記の規則に従って使用されます。

- BM_IO_IN_PROGRESS フラグは一種の lock として機能し、buffer に対する I/O の完了を待機するために使用されます (14 以前のリリースでは、
  per-buffer LWLock を伴っていました)。read や write を開始する process がフラグを set します。
  I/O が完了すると、それを開始した process によって行われたものであれ、
  別の process によって行われたものであれ、フラグは削除され、buffer の condition variable が
  signal されます。I/O の完了を待つ必要がある process は、
  BufferDesc->io_wref を使って非同期 I/O を待つか、buffer の condition variable で sleep して BM_IO_IN_PROGRESS が
  解除されるのを待つことができます。

## Normal Buffer Replacement Strategy

リサイクルする victim buffer を選ぶために、単純な clock-sweep アルゴリズムを使用しています。
その動作は次のとおりです:

各 buffer header には usage counter が含まれており、buffer が pin されるたびに
(小さな制限値まで) インクリメントされます。(これは buffer header spinlock のみを必要とし、
buffer reference count をインクリメントするためにいずれにせよ取得しなければならないので、
ほぼコストはありません。)

"clock hand" は、nextVictimBuffer という buffer index で、
利用可能なすべての buffer を循環的に移動します。nextVictimBuffer は
buffer_strategy_lock によって保護されています。

victim buffer を取得する必要がある process のアルゴリズム:

1. buffer_strategy_lock を取得します。

2. nextVictimBuffer が指す buffer を選択し、次回のために
   nextVictimBuffer を循環的に進めます。buffer_strategy_lock を解放します。

3. 選択した buffer が pin されているか、0 でない usage count を持っている場合、それは
   使用できません。usage count をデクリメントし (0 でない場合)、
   buffer_strategy_lock を再取得し、ステップ 3 に戻って次の buffer を調べます。

4. 選択した buffer を pin し、return します。

(選択された buffer が dirty の場合、リサイクルする前にそれを write out する必要があることに注意してください。
その間に誰かがその buffer を pin した場合、諦めて別の buffer を試す必要があります。
しかしこれは基本的な select-a-victim-buffer アルゴリズムの関心事ではありません。)

## Buffer Ring Replacement Strategy

VACUUM や大規模な sequential scan のように、大量の page を一度だけアクセスする必要がある
query を実行する場合、異なる戦略が使用されます。
そのような scan によってのみ触れられた page は、すぐにまた必要になる可能性が低いので、
通常の clock-sweep アルゴリズムを実行して buffer cache 全体を吹き飛ばす代わりに、
通常の clock-sweep アルゴリズムを使って小さな buffer の ring を allocate し、
その buffer を scan 全体で再利用します。これはまた、そのような
statement によって発生する write traffic の多くが backend 自身によって行われ、
他の process に push off されないことを意味します。

sequential scan の場合、256KB の ring が使用されます。これは L2 cache に収まるくらい
小さいため、OS cache から shared buffer cache への page transfer が効率的になります。
さらに小さくても多くの場合十分ですが、ring は scan で同時に pin される
すべての page を収容できるだけの大きさである必要があります。256KB
は他の backend が synchronized seq scan に参加できるよう、小さな cache trail を
残すのにも十分なはずです。ring buffer が dirty にされ LSN が
更新された場合、通常は buffer を再利用する前に WAL を write して flush する必要がありますが、
この場合は代わりに buffer を ring から discard して、
(後で) 通常の clock-sweep アルゴリズムを使って replacement を選択します。
したがって、この戦略は read-only (または最悪でも hint bit を更新する) の scan に対して最も効果的に機能します。
bulk UPDATE や DELETE のように scan 中のすべての page を変更する scan では、ring 内の buffer は常に dirty に
なり、ring 戦略は事実上 normal strategy に degrade します。

VACUUM は sequential scan と同様に ring を使用しますが、この ring のサイズは
vacuum_buffer_usage_limit GUC によって制御されます。dirty な page は ring から取り除かれ
ません。代わりに、buffer の再利用を可能にするために必要に応じて WAL が flush されます。8.3 で buffer ring strategy が導入される前は、VACUUM の buffer は
freelist に送られていましたが、これは事実上 1 buffer の buffer ring だったため、
過度の WAL flush をもたらしていました。

Bulk write は VACUUM と同様に動作します。現在これは
COPY IN と CREATE TABLE AS SELECT にのみ適用されます。 (seqscan UPDATE と DELETE に
bulkwrite strategy を使用させることは興味深いかもしれません?) Bulk write には
16MB の ring size を使用します (ただし shared_buffers の 1/8 を超えません)。
それより小さいサイズでは COPY が WAL flush のために頻繁に block されることが示されています。
background vacuum が独自の WAL flush によって遅くなることは許容できますが、
COPY がそれに左右されないことを望むため、
buffer arena の一部をもう少し使わせています。

## Background Writer の処理

background writer は、すぐに recycle される可能性の高い page を write out するように設計されており、
これによって active な backend から write 作業を offload します。
これを行うために、nextVictimBuffer の現在の位置から循環的に前方に scan し
(これは変更しません!)、dirty で pin されておらず正の usage count が
ない buffer を探します。そのような buffer があれば pin し、
write し、release します。

nextVictimBuffer を読むことが atomic action だと仮定できるなら、
writer は write する buffer を探すために buffer_strategy_lock を取得する
必要すらありません。各 buffer header の spinlock を dirty bit を check する
のに十分な時間だけ取得すれば良いのです。その仮定がなくても、writer は
変数の値を読むのに十分な時間だけ lock を取得すればよく、
buffer を scan している間ずっと取得する必要はありません。 (これは PG 8.0 と比較して writer の
contention cost の非常に大きな改善です。)

background writer は、buffer を write out する間 buffer に shared content lock を取得します
(また、buffer の内容を disk に flush する他のすべての者もそうしなければなりません)。
これにより、disk に転送される page image が合理的に一貫していることが保証されます。
1 つや 2 つの hint-bit update を見逃すかもしれませんが、buffer access rule の項で述べたのと
同じ理由から、それは問題ではありません。

8.4 以降、background writer は、潜在的に延長された recovery を実行する必要がある場合に
recovery モード中に開始します。これは normal processing と同等のサービスを提供しますが、
書き込む checkpoint は技術的には restartpoint です。

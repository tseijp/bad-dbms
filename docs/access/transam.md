src/backend/access/transam/README

# The Transaction System

PostgreSQL の transaction system は 3 層構造のシステムである。最下層は
low-level な transaction と subtransaction を実装し、その上に mainloop の
control code が位置する。さらにその上で、user から見える transaction と
savepoint が実装されている。

中間層の code は postgres.c から、各 query の処理前後、または error 検出後に
呼び出される。

    	StartTransactionCommand
    	CommitTransactionCommand
    	AbortCurrentTransaction

一方、user は SQL command である BEGIN、COMMIT、ROLLBACK、SAVEPOINT、
ROLLBACK TO、または RELEASE を発行することで system の状態を変更できる。
traffic cop はこれらの呼び出しを以下の toplevel routine へ redirect する。

    	BeginTransactionBlock
    	EndTransactionBlock
    	UserAbortTransactionBlock
    	DefineSavepoint
    	RollbackToSavepoint
    	ReleaseSavepoint

system の現在の状態に応じて、これらの関数は実際の transaction system を
起動するために low level な関数を呼び出す。

    	StartTransaction
    	CommitTransaction
    	AbortTransaction
    	CleanupTransaction
    	StartSubTransaction
    	CommitSubTransaction
    	AbortSubTransaction
    	CleanupSubTransaction

加えて、transaction 内では CommandCounterIncrement が呼び出されて command
counter が増加し、これにより同一 transaction 内の後続 command が先行 command の
効果を「見る」ことができる。これは transaction block 内の各 query の後で
CommitTransactionCommand によって自動的に行われるが、一部の utility 関数は、
同一 utility command 内の後続操作から（通常は system catalog に対する）一部の
操作が見えるようにするため、内部でもこの処理を実行する。（例えば DefineRelation
では heap を作成した後にこの処理が行われ、pg_class row を可視化して lock できる
ようにしている。）

例えば以下の user command 列を考えてみる。

1.     BEGIN
2.     SELECT * FROM foo
3.     INSERT INTO foo VALUES (...)
4.     COMMIT

メイン処理 loop では、これにより以下の関数呼び出し列が生じる。

     /  StartTransactionCommand;
    /       StartTransaction;

1. < ProcessUtility; << BEGIN
   \ BeginTransactionBlock;
   \ CommitTransactionCommand;

      / StartTransactionCommand;

2. / PortalRunSelect; << SELECT ...
   \ CommitTransactionCommand;
   \ CommandCounterIncrement;

      / StartTransactionCommand;

3. / ProcessQuery; << INSERT ...
   \ CommitTransactionCommand;
   \ CommandCounterIncrement;

      / StartTransactionCommand;
      / ProcessUtility; << COMMIT

4. < EndTransactionBlock;
   \ CommitTransactionCommand;
   \ CommitTransaction;

この例の要点は、StartTransactionCommand と CommitTransactionCommand が state に
応じた賢い振る舞いを必要とすることを示すことである -- これらは
BeginTransactionBlock と EndTransactionBlock の間の呼び出しでは
CommandCounterIncrement を呼び出すべきであり、これらの呼び出しの外側では
通常の start、commit、または abort 処理を行う必要がある。

さらに、「SELECT \* FROM foo」が abort 条件を引き起こしたとする。この場合
AbortCurrentTransaction が呼び出され、transaction は abort 状態に置かれる。
この状態では、transaction 終了文または ROLLBACK TO <savepoint> command を除いて
user input はすべて無視される。

transaction の abort は 2 通りの方法で発生する。

1. 何らかの内部要因（syntax error 等）で system が終了する
2. user が ROLLBACK を入力する

これらを区別しなければならない理由は、以下の 2 つの状況によって示される。

        case 1                                  case 2
        ------                                  ------

1. user が BEGIN を入力 1) user が BEGIN を入力
2. user が何かを実行 2) user が何かを実行
3. user が結果を気に入らず 3) 何らかの理由で system が abort
   ABORT を入力 (syntax error 等)

case 1 では、transaction を abort してデフォルト状態に戻したい。
case 2 では、同じ transaction block の一部であるさらなる command が続く
可能性がある。COMMIT または ROLLBACK が見えるまで、これらの command を
無視しなければならない。

内部 abort は AbortCurrentTransaction によって処理され、user による abort は
UserAbortTransactionBlock によって処理される。両方とも実際の作業はすべて
AbortTransaction に依存する。唯一の違いは、AbortTransaction の処理後に入る
state である。

- AbortCurrentTransaction は TBLOCK_ABORT 状態を残し、
- UserAbortTransactionBlock は TBLOCK_ABORT_END 状態を残す。

low-level な transaction abort 処理は 2 つの phase に分かれている。

- AbortTransaction は transaction が失敗したと認識した時点で直ちに実行される。
  他の backend を不必要に遅延させないため、すべての shared resource (lock など) を
  解放する必要がある。
- CleanupTransaction は最終的に user の COMMIT または ROLLBACK command を確認した
  時点で実行される。これは後片付けを行い、transaction から完全に抜け出す。
  特に、この時点までは TopTransactionContext を破棄してはならない。

また、transaction が commit されたとき、すぐには close されないことに注意して
ほしい。むしろ TBLOCK_END 状態に置かれ、これは query 処理が完了した後
CommitTransactionCommand が呼ばれたとき、transaction を close しなければならない
ことを意味する。この区別は微妙だが重要である。なぜなら、これは制御が transaction
を open にしたまま xact.c の code から戻ることを意味し、main loop が同じ
transaction 内での処理を継続できるからである。したがって、ある意味で
transaction commit も 2 つの phase で処理されている。最初は EndTransactionBlock
で、2 番目は CommitTransactionCommand（ここで実際に CommitTransaction が
呼び出される）である。

xact.c の残りの code は、transaction と subtransaction の作成と終了を支援する
routine である。例えば AtStart_Memory は main transaction 開始時に memory
subsystem の初期化を担当する。

## Subtransaction Handling

subtransaction は TransactionState 構造体の stack を用いて実装されており、
それぞれが親 transaction の struct への pointer を持つ。新しい subtransaction を
open する際には PushTransaction が呼ばれ、現在の transaction を親 link とする
新しい TransactionState を作成する。StartSubTransaction は新しい TransactionState
を適切な値で初期化し、他の subsystem（AtSubStart routine）を適切に初期化する
役割を担う。

subtransaction を close する際には、CommitSubTransaction を呼び出す
（subtransaction が commit する場合）か、AbortSubTransaction と
CleanupSubTransaction を呼び出す（abort する場合）必要がある。どちらの場合も
PopTransaction が呼ばれ、system は親 transaction に戻る。

subtransaction の処理に関する重要な点として、1 つの user command に応答して
複数のものを close する必要があるかもしれない、ということが挙げられる。これは、
savepoint には名前があり、最後に open されたものとは限らない savepoint を名前で
commit または rollback できるためである。また、COMMIT または ROLLBACK command は
stack 全体を close できなければならない。これは、utility command の subroutine が
すべての state stack entry を commit-pending または abort-pending として mark し、
main loop が CommitTransactionCommand に到達したときに実際の作業を行う、という
やり方で処理する。このようにする主な利点は、state stack entry を pop する際に
error が発生しても、残りの stack entry は終了するために必要な処理を依然として
示しているという点である。

ROLLBACK TO <savepoint> の場合、savepoint 名で識別されるものまでのすべての
subtransaction を abort し、その後、同じ名前でその subtransaction レベルを
再作成する。したがって、内部的にはまったく新しい subtransaction である。

他の subsystem は「internal」subtransaction を開始することが許可されており、
これは BeginInternalSubTransaction によって処理される。これは例えば PL/pgSQL で
例外処理を実装するためである。ReleaseCurrentSubTransaction と
RollbackAndReleaseCurrentSubTransaction により、subsystem は前述の subtransaction
を close できる。これと savepoint/release path の主な違いは、各 subroutine で
state 遷移全体を即座に実行する点であり、CommitTransactionCommand まで一部の作業を
遅らせるのではない、という点である。もう 1 つの違いは、明示的な transaction block
が確立されていない場合でも BeginInternalSubTransaction は許可されているが、
DefineSavepoint は許可されない、という点である。

## Transaction and Subtransaction Numbering

transaction と subtransaction は、最初にそれを必要とする何か（典型的には
tuple の insert/update/delete だが、XID の割り当てが必要な他の場所もいくつか
存在する）を実行した時点でのみ、永続的な XID を割り当てられる。subtransaction が
XID を必要とする場合、常にまずその親に XID を割り当てる。これにより、子
transaction が親より後の XID を持つという不変条件が維持される。これは多くの
箇所で前提とされている。

XID に対する lock の取得や pg_subtrans および PGPROC への entry 登録などの
副次的処理は、XID が割り当てられる時点で行われる。

XID を持たない transaction も、lock の保持などさまざまな目的のために識別される
必要がある。この目的のため、各 top-level transaction に「virtual transaction ID」
すなわち VXID を割り当てる。VXID は procNumber と backend ローカルの counter の
2 つの field から形成される。この配置により、shared memory の競合なしに
transaction 開始時に新しい VXID を割り当てることができる。backend 終了直後に
VXID が再利用されないよう、backend 終了時に最後のローカル counter 値を
shared memory に保存し、backend 開始時には同じ PGPROC slot の前の値から
初期化する。これらの counter はすべて shared memory の再初期化時にゼロに戻るが、
VXID は disk 上のどこにも現れないので問題ない。

内部的には、backend は XID の有無にかかわらず subtransaction を識別する方法が
必要である。ただし、このニーズは親の top transaction が続く間だけのものである。
そのため SubTransactionId が存在し、これは CommandId と幾分似ており、各 top
transaction の開始時に reset される counter から生成される。top-level transaction
自体は SubTransactionId 1 を持ち、subtransaction は ID 2 以上を持つ。
（ゼロは InvalidSubTransactionId のために予約されている。）subtransaction は
独自の VXID を持たず、親の top transaction の VXID を使用することに注意。

## Interlocking Transaction Begin, Transaction End, and Snapshots

transaction の開始/終了と snapshot 取得という頻繁な処理に関わる overhead と lock
contention の量を最小化するよう、最大限の努力を払っている。残念ながら、
transaction の commit 順序について一貫性を保証する必要があるため、ある程度の
interlocking は必要である。例えば、xact A の UPDATE が xact B の同一 row に
対する先行 update によって block されており、xact B が commit 処理中である一方、
xact C が snapshot を取得している、という場合を考える。xact A は B が lock を
解放した直後に完了して commit できる。xact C の GetSnapshotData が xact B を
依然として running と見なすなら、xact A も running と見なさなければならない。
さもなくば、2 つの tuple バージョン（B によって delete されたものと A によって
insert されたもの）が見えてしまう。これが悪いもう 1 つの理由は、C が（A によって
insert された row 内の）B による以前の変更を見ることになり、database 内の他の
場所で B の変更が一切見えないのは一貫性がないからである。

形式的に言うと、正しさの要件は次の通りである。「snapshot A が transaction X を
committed と見なし、transaction X の snapshot のいずれかが transaction Y を
committed と見なしているなら、snapshot A は transaction Y も committed と
見なさなければならない」。

実際に強制しているのは、commit/rollback と snapshot 取得との厳密な直列化である。
すなわち、snapshot を取得している間、いかなる transaction も running transaction
集合から脱出することを許さない。（このルールは一貫性のために必要な以上に強い
ものだが、enforce するのが比較的単純で、後述する他の問題にも役立つ。）この
実装は、GetSnapshotData が ProcArrayLock を shared mode で取得し（これにより
複数の backend が並列に snapshot を取得できる）、一方で ProcArrayEndTransaction は
transaction 終了時（commit または abort のいずれか）に ProcGlobal->xids[] entry を
clear する際に ProcArrayLock を exclusive mode で取得しなければならない、という
ものである。（context switch を減らすため、複数の transaction がほぼ同時に commit
する場合、1 つの backend が ProcArrayLock を取得して複数 process の XID を一度に
clear する。）

ProcArrayEndTransaction は shared な latestCompletedXid 変数を進める間も lock を
保持する。これにより GetSnapshotData は snapshot の xmax として
latestCompletedXid + 1 を使用できる。この xid 値以上の transaction で、snapshot が
completed と見なすべきものは存在し得ない。

要するにルールは、latestCompletedXid を fetch した時点から snapshot の構築を
終えた時点まで、いかなる transaction も現在 running な transaction 集合を
抜けてはならない、ということである。ただしこの制限は XID を持つ transaction
にのみ適用される --- read-only transaction は他者の snapshot にも
latestCompletedXid にも影響しないので、ProcArrayLock を取得せずに終了できる。

transaction の開始自体は、これらの考慮事項との interlocking はない。transaction
開始時に即座に XID を割り当てなくなったためである。しかし、XID を割り当てると
決定した場合、GetNewTransactionId は XidGenLock を解放する前に新しい XID を
shared ProcArray に store しなければならない。これにより、latestCompletedXid 以下の
すべての top-level XID が、ProcArray に存在するか、もはや running ではないかの
いずれかであることが保証される。（この保証は subtransaction の XID には適用されない。
subxid 配列に格納する場所がない可能性があるためである。代わりに、それらが存在するか、
overflow flag が設定されていることを保証する。）backend が XID を
ProcGlobal->xids[] に格納する前に XidGenLock を解放してしまうと、別の backend が
より後の XID を allocate して commit し、最初の backend の XID が ProcArray で
可視になる前に latestCompletedXid がそれを通過する可能性がある。これは後述するように
ComputeXidHorizons を壊すことになる。

GetNewTransactionId は ProcArrayLock を取得せずに ProcGlobal->xids[]（または subxid
配列）に XID を store できるようになっている。これはかつて deadlock を避けるために
必要だったが、もはやそうではない。ただし、性能上は依然として有益である。これにより
XID の fetch/store が atomic であることに依存している。さもなければ、他の backend が
部分的に set された XID を見る可能性がある。これは、ProcArray の xid field を読む
側は、複数回読んでも毎回同じ答えが得られると仮定するのではなく、値を一度だけ fetch
することに注意しなければならない、ということも意味する。（こうするときは
volatile 修飾子付きの pointer を使用して、C compiler に指示通りに正確に動作させること。）

shared な ProcArray を使用するもう 1 つの重要な処理は ComputeXidHorizons である。
これは system 全体で active な MVCC snapshot のうち最も古い xmin の下界を決定
しなければならない。各 backend は自身の snapshot の最小 xmin を MyProc->xmin に
通知するか、現在 live な snapshot がない場合（例えば transaction の合間や、新しい
transaction の snapshot をまだ set していない場合）はゼロを通知する。
ComputeXidHorizons は有効な xmin field の MIN() を取る。これは ProcArrayLock を
shared lock でのみ取得して行うため、GetSnapshotData を並行して行う他の backend との
間に潜在的な race condition がある。すなわち、これから xmin を set しようとしている
並行 backend が、ComputeXidHorizons の決定する値より小さい xmin を計算しないことを
確実にしなければならない。これは、有効な xmin だけでなくすべての active な XID も
MIN() 計算に含めることで保証する。transaction が exclusive ProcArrayLock を
取得せずに終了できないというルールにより、shared ProcArrayLock の並行保持者は
同じ現在 active な XID の最小値を計算することが保証される。特に最古のものを含め、
いかなる xact も、こちらが shared ProcArrayLock を保持している間は終了できない。
したがって、ComputeXidHorizons の最小 active XID の view は、並行する
GetSnapshotData のものと同じになり、過大評価を生み出すことはあり得ない。active な
transaction がまったくない場合、ComputeXidHorizons は latestCompletedXid + 1 を
使用する。これは並行または後続の GetSnapshotData 呼び出しによって計算される可能性のある
xmin の下界である。（この値より小さい XID は、上述の XidGenLock の interlock により
ProcArray に出現することはないと分かっている。）

GetSnapshotData は性能上 critical であるため、正確な oldest-xmin 計算を行わない
（v14 までは行っていた）。snapshot の内容は他の backend の xid のみに依存し、
それらの xmin には依存しない。backend の xmin は xid よりはるかに頻繁に変わる
ため、GetSnapshotData に xmin を見させると不必要な cacheline ping-pong が大量に
発生する可能性がある。代わりに GetSnapshotData は近似 threshold を更新する
（1 つはそれより古い delete 済み row がすべて削除可能であることを保証するもの、
もう 1 つはそれより新しい delete 済み row が削除できないと判定するもの）。
GlobalVisTest\* はこれらの threshold を使って不可視判定を行い、必要なら
ComputeXidHorizons に fallback する。

なお、GetSnapshotData の 2 つの並行実行が自身の snapshot に対して同じ xmin を
計算することは確実だが、ComputeXidHorizons によって計算される horizons には
そのような保証はないことに注意。これは、XID を持たない transaction が（ProcArrayLock を
取得することなく）非同期で MyProc->xmin を clear することを許可しているためで、
ある実行は最古であった xmin を見る一方、別の実行はそれを見ないかもしれない。
これは問題ない。threshold は valid な下界であれば十分だからである。前述のように、
xid field の fetch/store が atomic であると既に仮定しているので、xmin についても
同様に仮定することに追加の risk はない。

## pg_xact and pg_subtrans

pg_xact と pg_subtrans は、transaction 関連情報の永続的な (on-disk) storage である。
それぞれ memory には限られた数の page しか保持されないため、多くの場合実際に disk
から読み出す必要はない。しかし、長時間 running な transaction や、transaction を
open したまま idle 状態の backend がある場合、この情報を disk から読み書きできる
必要があるかもしれない。これらはまた、server 再起動を跨いで情報を永続させることも
可能にする。

pg_xact は XID が割り当てられた各 transaction の commit status を記録する。
transaction は in progress、committed、aborted、または「sub-committed」の状態を
取り得る。この最後の状態は、もはや running ではない subtransaction であって、
その親がまだ state を更新していない、ということを意味する。subtransaction の
transaction status を subcommit に更新する必要はないので、main transaction の
commit まで延期できる。transaction を sub-committed として mark することの主な
役割は、transaction status が複数の clog page にまたがる場合に atomic な commit
protocol を提供することである。その結果、transaction status が複数の page に
またがるときは常に two-phase commit protocol を使用しなければならない。第 1 phase は
subtransaction を sub-committed として mark し、その後、top level transaction と
そのすべての subtransaction を（その順序で）committed として mark する。したがって、
abort していない subtransaction は、すでに完了していても in-progress として現れ、
subcommit status は main transaction の commit の間の非常に短い遷移状態として
現れる。subtransaction の abort は発生し次第、常に clog に mark される。
transaction status がすべて単一の CLOG page に収まる場合、中間の sub-commit 状態を
介在させずに、それらをすべて atomic に committed として mark する。

savepoint は subtransaction を用いて実装される。subtransaction は transaction の
中の transaction であり、その commit/abort status はそれ自身が commit したかどうか
だけでなく、親 transaction が commit したかどうかにも依存する。1 つの transaction
内で複数の savepoint を実装するために無制限の transaction の nesting depth を許可
しているので、ある特定の subtransaction の commit state は、すべての祖先 transaction
の commit status に依存する。

「subtransaction parent」(pg_subtrans) 機構は、XID を持つ各 transaction について、
その親 transaction の TransactionId を記録する。この情報は subtransaction に XID が
割り当てられ次第格納される。top-level transaction には親がないので、pg_subtrans
entry はデフォルト値のゼロ (InvalidTransactionId) のままになる。

pg_subtrans は、対象の transaction がまだ running かどうかをチェックするために
使用される --- transaction の main Xid は ProcGlobal->xids[] に記録され、PGPROC->xid
に copy が置かれるが、subtransaction の任意の nesting を許可しているため、すべての
Xid を shared memory に収めることはできない。そのため disk に格納する必要がある。
ただし、各 transaction について、その transaction tree に属することが分かっている
Xid の「cache」を保持しているので、cache が overflow したことが分かっている場合を
除き、pg_subtrans を見るのをスキップできる。詳細は storage/ipc/procarray.c を
参照のこと。

slru.c は pg_xact と pg_subtrans の両方を支える機構である。これは in-memory な
buffer page に対する LRU policy を実装する。pg_xact の高 level な routine は
transam.c に実装されており、low-level な関数は clog.c にある。pg_subtrans は完全に
subtrans.c に含まれている。

## Write-Ahead Log Coding

WAL subsystem (code 内では XLOG とも呼ばれる) は crash recovery を保証するために
存在する。また、point-in-time recovery を提供するためや、log shipping による
hot-standby replication にも使用できる。設計の自明でない側面についてのいくつかの
注記を以下に示す。

write AHEAD log の基本的な前提は、log entry が、それが記述する data-page の
変更よりも先に stable storage に到達しなければならない、ということである。これに
より、log の最後まで replay することで、部分的に実行された transaction がない
一貫した状態にたどり着くことが保証される。これを保証するため、各 data page
(heap か index か) には、その page に影響を与える最新の XLOG record の LSN
(log sequence number --- 実際は WAL file 上の位置) が mark される。bufmgr が
dirty page を書き出す前に、少なくとも page の LSN まで xlog が disk に flush されて
いることを保証しなければならない。この低 level の相互作用は、必要になるまで XLOG
I/O を待たないことで性能を向上させる。LSN check は shared-buffer manager にのみ
存在し、temp table 用の local buffer manager には存在しない。したがって temp table
に対する操作は WAL-logged であってはならない。

WAL の replay 中、page の LSN を check することで、現在の log entry が記録する変更が
すでに適用されているかどうかを検出できる（page LSN が log entry の WAL 位置以上
ならば適用済み）。

通常、log entry には page（または小さな page 群）に対する単一の incremental update
を redo するのにちょうど十分な情報が含まれる。これは、filesystem と hardware が
data page の write を atomic な動作として実装している場合にのみ機能し、page が
部分的に書き込まれた破損状態で残らないことが前提となる。実際にはこれは多くの場合
維持できない前提なので、変更された page を完全に再構成できるよう追加情報を log
する。checkpoint 後のある page に影響を与える最初の WAL record には、その page
全体の copy が含まれるようになり、update を redo する代わりにその page copy を
restore することで replay を実装する。（これは data storage そのものよりも信頼性が
高い。WAL record の CRC の有効性を check できるからである。）「checkpoint 後の最初の
変更」は、page の古い LSN が最後の checkpoint 時点 (RedoRecPtr) の WAL の末尾より
前にあるかどうかを記録することで検出できる。

WAL-logged action を実行する一般的な schema は以下の通りである。

1. 変更する data page を含む shared buffer を pin し、exclusive lock する。

2. START_CRIT_SECTION() （次の 3 step の間の error はすべて PANIC を引き起こさなければ
   ならない。shared buffer に WAL log されていない変更が含まれており、それが disk に
   到達しないことを保証しなければならないからである。当然、critical section を
   開始する前に、page に十分な空き領域があるかどうかなどの条件を check すべきである。）

3. shared buffer に必要な変更を適用する。

4. MarkBufferDirty() で shared buffer を dirty として mark する。（これは WAL record
   が挿入される前に行わなければならない。SyncOneBuffer() の note を参照。）
   MarkBufferDirty() で buffer を dirty として mark するのは、WAL record を書き込む
   場合のみであることに注意。下記の Writing Hints を参照。

5. relation が WAL-logging を必要とする場合、XLogBeginInsert と XLogRegister\* 関数を
   使って WAL record を build し、insert する（下の「Constructing a WAL record」を
   参照）。次に、返された XLOG 位置を使って page の LSN を update する。例えば、

          	XLogBeginInsert();
          	XLogRegisterBuffer(...)
          	XLogRegisterData(...)
          	recptr = XLogInsert(rmgr_id, info);

          	PageSetLSN(dp, recptr);

6. END_CRIT_SECTION()

7. buffer の lock を解除し、unpin する。

複雑な変更（例えば multilevel index insertion など）は通常、一連の atomic-action
WAL record によって記述する必要がある。中間状態は self-consistent でなければならず、
replay が任意の 2 つの action の間で中断されても system が完全に機能することを
保証する。例えば btree index では、page の split には新しい page の allocate と、
親 btree level への新しい key の insert が必要だが、locking の理由により、これは
2 つの別々の WAL record に分けて反映しなければならない。最初の record を replay して
新しい page を allocate し tuple を move するときには、key がまだ親に insert されて
いないことを示す flag を page に set する。2 番目の record を replay すると flag は
clear される。この中間状態は通常運用中は他の backend からは決して見えない。子 page に
対する lock が 2 つの action をまたいで保持されているからである。しかし 2 番目の WAL
record を書き込む前に operation が中断されると見える状態となる。検索 algorithm は
中間状態でも normal に動作するが、insert が incomplete-split flag が set された page
に遭遇すると、続行する前に key を親に insert することで中断された split を完了させる。

## Constructing a WAL record

WAL record は、すべての WAL record type に共通な header、record 固有のデータ、
そして変更されたデータ block に関する情報から構成される。各変更された data block は
ID 番号で識別され、option で block に関連付けられた record 固有のデータをさらに
持つことができる。XLogInsert が block の full-page image を取る必要があると判断した
場合、その block に関連付けられたデータは含まれない。

WAL record を構築するための API は 5 つの関数で構成される。XLogBeginInsert、
XLogRegisterBuffer、XLogRegisterData、XLogRegisterBufData、XLogInsert である。
まず XLogBeginInsert() を呼ぶ。次に XLogRegister\* 関数を使って、変更されたすべての
buffer と、変更を replay するために必要な data を register する。最後に XLogInsert()
を呼んで構築された record を WAL に insert する。

    XLogBeginInsert();

    /* この WAL-logged action の一部として変更される buffer を register */
    XLogRegisterBuffer(0, lbuffer, REGBUF_STANDARD);
    XLogRegisterBuffer(1, rbuffer, REGBUF_STANDARD);

    /* WAL record に常に含まれる data を register */
    XLogRegisterData(&xlrec, SizeOfFictionalAction);

    /*
     * buffer に関連付けられた data を register する。full-page image が取られた
     * 場合は、この data は record に含まれない。
     */
    XLogRegisterBufData(0, tuple->data, tuple->len);

    /* buffer に関連付けられたさらなる data */
    XLogRegisterBufData(0, data2, len2);

    /*
     * よし、WAL record に含めるすべての data と buffer が register された。
     * record を insert する。
     */
    recptr = XLogInsert(RM_FOO_ID, XLOG_FOOBAR_DO_STUFF);

API 関数の詳細：

void XLogBeginInsert(void)

    XLogRegisterBuffer と XLogRegisterData の前に呼び出される必要がある。

void XLogResetInsertion(void)

    WAL record 構築 workspace から、現在 register されているすべての data と buffer
    を clear する。これは XLogBeginInsert() をすでに呼び出したが、結局 record を
    insert しないと決めた場合にのみ必要である。

void XLogEnsureRecordSpace(int max_block_id, int ndatas)

    通常、WAL record 構築 buffer には以下の制限がある。

    * 使用可能な最大 block ID は 4 である（5 つの block reference を許可）
    * register されるデータの最大 20 chunk

    これらのデフォルト制限は、いくつかの on-disk 構造を変更するほとんどの record
    type に対して十分である。より多くのデータを必要とする、またはより多くの buffer を
    変更する必要があるまれな場合は、XLogEnsureRecordSpace() を呼び出してこれらの
    制限を引き上げることができる。XLogEnsureRecordSpace() は XLogBeginInsert() の
    前に、critical section の外で呼ばれる必要がある。

void XLogRegisterBuffer(uint8 block_id, Buffer buf, uint8 flags);

    XLogRegisterBuffer は data block に関する情報を WAL record に追加する。
    block_id は redo routine でこの page reference を識別するために使われる
    任意の番号である。redo 時に page を再検索するために必要な情報 ---
    relfilelocator、fork、block number --- は WAL record に含まれる。

    最後の checkpoint 以降このバッファが最初に変更された場合、XLogInsert は自動的に
    page の内容の full copy を含める。torn-page hazard を避けるため、action によって
    変更されるすべての buffer を XLogRegisterBuffer で register することが重要である。

    flag は、buffer の内容が WAL record にいつ、どのように含まれるかを制御する。
    通常、最後の checkpoint 以降 page が変更されておらず、かつ full_page_writes=on
    または online backup が進行中の場合にのみ full-page image が取られる。
    REGBUF_FORCE_IMAGE flag を使用して、常に full-page image が含まれることを強制
    できる。これは例えば page の大部分を rewrite する operation で、詳細を追跡する
    価値がない場合に有用である。torn page から保護する必要がないまれな場合には、
    REGBUF_NO_IMAGE flag を使って full page image の取得を抑制できる。REGBUF_WILL_INIT
    も full page image を抑制するが、redo routine は古い page 内容を見ずに、ゼロから
    page を再生成しなければならない。page の再初期化は、full page image と同様に
    torn page hazard から保護する。

    REGBUF_STANDARD flag は他の flag と一緒に指定でき、page が standard な page layout に
    従っていることを示す。これにより pd_lower と pd_upper の間の領域が image から
    除外され、WAL の volume が削減される。

    REGBUF_KEEP_DATA flag が与えられた場合、XLogRegisterBufData() で register された
    per-buffer data は、full-page image が取られても WAL record に含まれる。

void XLogRegisterData(const void \*data, int len);

    XLogRegisterData は WAL record に任意のデータを含めるために使用される。
    XLogRegisterData() が複数回呼ばれた場合、data は append され、redo routine には
    1 つの連続した chunk として利用可能になる。

void XLogRegisterBufData(uint8 block_id, const void \*data, int len);

    XLogRegisterBufData は、XLogRegisterBuffer() で先に register された特定の buffer に
    関連付けられた data を含めるために使用される。XLogRegisterBufData() が同じ
    block ID で複数回呼ばれた場合、data は append され、redo routine には 1 つの
    連続した chunk として利用可能になる。

    insert 時に buffer の full-page image が取られた場合、REGBUF_KEEP_DATA flag が
    使われない限り、その data は WAL record に含まれない。

## Writing a REDO routine

REDO routine は、WAL record に含まれる data と page reference を使って page の
新しい状態を再構成する。xlogreader.c/h の record decoding 関数と macro を使って、
record から data を抽出できる。

複数の page に対する変更を記述する WAL record を replay する際は、並行する
Hot Standby query が一貫性のない状態を見ないよう、page を適切に lock するように
注意しなければならない。2 つ以上の buffer lock を同時に保持する必要がある場合は、
適切な順序で page を lock し、すべての変更が完了するまで lock を解放してはならない。

PageSetLSN/PageGetLSN() は、action が serialise されていることが分かっている場合
にのみ使用すべきであることに注意。recovery 中に data block を変更できるのは Startup
process だけなので、Startup process は serialise の問題を心配せずに PageGetLSN() を
実行できる。その他すべての process は、exclusive な buffer lock を保持するか、shared
lock と buffer header lock を保持するか、relation 上の AccessExclusiveLock を保持しな
がら shared buffer を経由せず直接 data block に書き込んでいる場合にのみ
PageSet/GetLSN を呼び出さなければならない。

## Writing Hints

場合によっては、先行する WAL record を書き込まずに data block に追加情報を書き込む
ことがある。これは、データが crash 後に再構成可能であり、action が単に性能を最適化
する手段である場合にのみ行うべきである。hint を書き込む際には、ブロックを dirty
として mark するために MarkBufferDirtyHint() を使用する。

buffer が clean で checksum が使用されている場合、MarkBufferDirtyHint() は
XLOG_FPI_FOR_HINT record を insert して、hint を含む full page image が取られる
ことを保証する。これは、dirty 化された page を書き出すときの部分 page 書き込みを
避けるためである。recovery 中は WAL は書き込まれないので、recovery 中は hint による
block の dirty 化を単に skip する。

WAL record を最適化により省略すると決めた場合、MarkBufferDirty() への呼び出しは
すべて MarkBufferDirtyHint() に置き換える必要がある。さもなくば、部分 page 書き込み
の risk にさらされることになる。

heap page における all-visible hint (PD_ALL_VISIBLE) は特殊なケースである。なぜなら
それはある面では durable な変更のように扱われ、別の面では hint として扱われる
からである。これは、heap page に関連付けられた visibilitymap (VM) bit が set されて
いれば、heap page 自体に PD_ALL_VISIBLE が set されている、という不変条件を満たさ
なければならない。PD_ALL_VISIBLE の clear は、この不変条件を維持するため、常に
完全に durable な変更として扱われる。さらに、checksum または wal_log_hints が
有効な場合、PD_ALL_VISIBLE の set も torn page から保護するため、完全に durable な
変更として扱われる。

しかし、checksum も wal_log_hints も有効でない場合、変更が PD_ALL_VISIBLE のみ
であれば torn page は問題にならないので、heap の full page image は取られず、
heap page の LSN は update されない。注意：この最適化を適用する際、関連する WAL
record が存在しても heap page の LSN を update するのは正しくない。なぜなら、後続の
page modifier（例えば無関係な UPDATE）が、full page image は不要であると誤って
信じ込む可能性があるからである。

## Write-Ahead Logging for Filesystem Actions

前 section では、shared buffer 内の page 内容のみを変更する action を WAL-log する
方法を説明した。そのタイプの action では、実際の変更を開始する前に、起こりうる
すべての error case (例えば page 上の空き領域不足) を check することが一般に可能
である。したがって、変更と関連する WAL log record の作成を critical section で
くるむことで「atomic」にすることができる --- 途中で失敗する確率は十分に低いので、
発生した場合 PANIC は受け入れ可能である。

明らかに、log するべき action 内で失敗確率が大きいケース、例えば新しい file や
database の作成などには、このアプローチは機能しない。PANIC は望ましくないし、
特に action を行ったと記述する WAL record をすでに書き込んだ後で PANIC するのは
望ましくない --- もしそうすると record の replay でおそらく再び失敗し再び PANIC
することになり、失敗は recoverable でなくなる。これは「変更を記述する WAL を変更の
前に書き込む」という通常の WAL ルールが機能しないことを意味し、そのようなケースには
異なる設計が必要である。

この問題を抱える基本的な filesystem action がいくつかある。それぞれをどのように扱う
かは以下の通りである。

1. 既存の table に disk page を追加する。

この action は WAL-log されない。table の末尾にゼロの page を書き込むことで table を
拡張する。filesystem が空間を割り当てたことを確実にするため、この write は実際に
実行する必要がある。write が失敗した場合は通常通り error 出力できる。空間が
割り当てられたと分かれば、1 つ以上の通常の WAL-logged な action を介して page を
初期化して埋めることができる。ファイルを拡張した後 WAL entry を書き出す前に crash
する可能性があるので、table または index で all-zeroes な page を発見した場合は
non-error 条件として扱う必要がある。そのような場合は、その空間を単に再利用のために
再要求できる。

2. 新しい table を作成する。これには filesystem に新しい file が必要である。

file の作成を試み、成功すれば実行したという WAL record を作る。成功しない場合は
単に error を throw できる。file は作成したが、それに関する WAL をまだ disk に
書き込んでいない window があることに注意。この window の間に crash すると、
ファイルは「orphan」として disk 上に残る。database 再起動時に pg_class に
committed entry を持たない file を検索することで、そのような orphan を cleanup する
ことは可能だが、crash の forensic analysis に有用な data を削除する可能性があるため、
現時点では行われていない。orphan file は無害である --- 最悪でも少し disk 空間を
無駄にするだけである --- なぜなら、新しい relfilenumber OID を allocate する際に
on-disk な衝突を check しているからである。したがって、cleanup は実際には必要ではない。

3. table を削除する。これには失敗する可能性のある unlink() が必要である。

ここでのアプローチは、最初に operation を WAL-log し、実際の unlink() 呼び出しの
失敗は error 条件ではなく warning として扱う、というものである。再び、これにより
orphan file が残る可能性があるが、代替策と比較すれば安価である。DROP TABLE
transaction が commit するまで実際に unlink() を実行できないので、いずれにせよ
error を throw することは問題外である。（注目に値するのは、file 削除に関する WAL
entry は実際には削除を行う transaction の commit record の一部である、という点である。）

4. database と tablespace の作成と削除。これには directory と directory tree 全体の
   作成と削除が必要である。

これらのケースは個々の file 作成と同様に扱われる。すなわち、まず action を試み、
成功した場合に WAL entry を書き込む。当然ながら、無駄になりうる disk 空間の潜在的な
量はかなり大きくなる。作成のケースでは、作成が失敗した場合に directory tree を再度
削除しようと試み、無駄空間の risk を減らす。削除 operation の途中での失敗は、
corrupt な database をもたらす：DROP は失敗したものの、データの一部はとにかく
失われている。しかしこれについてできることはほとんどない。いずれにせよ、それは
おそらく user がもはや必要としない data であった。

これらすべてのケースで、WAL replay が元の action を redo できない場合は panic して
recovery を abort しなければならない。DBA は手動で cleanup（例えば disk 空間を解放
する、あるいは directory permission を修正する）してから recovery を再起動する必要が
ある。これは、元の action が成功裏に行われるまで WAL entry を書き込まない理由の
一部である。

## Skipping WAL for New RelFileLocator

wal_level=minimal の場合、変更が ROLLBACK によって unlink される relfilenumber を
変更するなら、in-tree な access method はその変更に対して WAL を書き込まない。
RelationNeedsWAL() を呼ばずに WAL を書き込む code は、このケースを check しなければ
ならない。この skip は必須である。WAL を書き込む変更が、同じ block に対する WAL
を skip する変更に先行する場合、REDO は WAL を skip した変更を上書きする可能性が
ある。WAL を書き込む変更が同じ block に対する WAL を skip する変更の後に続く場合、
関連する問題が発生する。WAL record に full-page image が含まれない場合、REDO は
page が record 挿入の直前の内容と一致することを期待する。WAL を skip する変更は
disk にまったく到達しない可能性があり、full_page_writes=off の下では REDO の期待を
破る。いかなる access method についても、CommitTransaction() は commit を記録する
前に影響を受ける block を write し fsync する。

将来の access method でも同じことを行うのが望ましい。ただし、他に 2 つのアプローチが
機能し得る。第 1 に、access method は FlushRelationBuffers() と smgrimmedsync() を
呼ぶことで、ある fork を WAL を skip する状態から WAL を書き込む状態へ不可逆的に
遷移させることができる。第 2 に、access method は permanent な relation に対して
無条件に WAL を書き込むことを選択できる。これらのアプローチの下では、access method
の callback は RelationNeedsWAL() に反応する関数を呼んではならない。

これは、replay によって新しい relfilenumber に格納されたバイトが変更される WAL
record にのみ適用される。XLOG_SMGR_CREATE のような relfilenumber に関する他の
record には適用されない。個々の relfilenumber の level で動作するので、
RelationNeedsWAL() は緊密に結合された relation 間で異なり得る。
「CREATE TABLE t (); BEGIN; ALTER TABLE t ADD c text; ...」を考えてほしい。
ここで ALTER TABLE は TOAST relation を追加する。TOAST relation は WAL を skip
するが、それを所有する table はしない。ALTER TABLE SET TABLESPACE は table が
WAL を skip する原因となるが、その index には影響しない。

## Asynchronous Commit

PostgreSQL 8.3 から asynchronous commit を行うことが可能になっている --- すなわち
commit の WAL record が fsync されるのを待たない。synchronous_commit = off の場合
asynchronous commit を実行する。commit の LSN まで XLogFlush() を実行する代わりに、
shared memory に LSN を記録するだけである。その後 backend は他の作業を続行する。
LSN は asynchronous commit に対してのみ記録し、abort に対しては記録しない。abort
record を flush する必要はまったくない。crash 後はとにかく transaction は abort
されたものと見なされるからである。

transaction が relation を削除している場合、commit record が disk に到達してから
relation が filesystem から削除されることを保証するため、常に synchronous commit を
強制する。また、roll-back できない副作用（例えば filesystem 変更）を持つ特定の
utility command は、filesystem 変更が行われたが transaction が committed であると
保証されていない window を最小化するため、sync commit を強制する。

walwriter は定期的に（wal_writer_delay を介して）起き上がるか、（latch を介して、
これは asynchronous に commit する backend によって set される）起こされて、
XLogBackgroundFlush() を実行する。これは、完全に埋められた最後の WAL page の位置を
check する。それが前進している場合、変更されたすべての buffer をその時点まで write
するので、full load 時には全 buffer のみを write することになる。activity に
break があり現在の WAL page が以前と同じである場合、最新の asynchronous commit の
LSN を調べ、必要なら（つまり現在の WAL page 内にあれば）その時点まで write する。
前回の flush から wal_writer_delay 以上経過した、または wal_writer_flush_after
ブロック以上 write された場合、WAL も現在位置まで flush される。この配置自体が、
async commit record が transaction 完了から最大でも wal_writer_delay の 2 倍後に
disk に到達することを保証する。ただし XLogFlush に対しても full buffer を「flexibly」
write/flush することを許している（つまり、循環 WAL buffer 領域の末尾で wrap around
しない）。これは、複数の WAL page が walwriter サイクルごとに埋められる高負荷の下で
発行される write 数を最小化するためである。これにより、最悪ケースの遅延は 3 つの
wal_writer_delay サイクル分となる。

asynchronous commit を考える際の他にもいくつかの微妙な点がある。第 1 に、CLOG の
各 page について、その page に影響を与える最新 commit の LSN を記憶しておかなければ
ならない。通常の relation page に対して行うのと同じ「write の前に WAL を flush する」
ルールを enforce できるようにするためである。さもなくば commit の record が WAL
record より先に disk に到達する可能性がある。再び、abort record はこの考慮事項に
入れる必要はない。

実際は、clog page ごとに複数の LSN を格納する。これは visibility test 中に
transaction status の hint bit を set する方法に関連している。relation page に
transaction-committed な hint bit を set し、その record を commit の WAL record の
前に disk に到達させてはならない。visibility test は通常 buffer share lock を
保持しながら行われるので、WAL 同期を保証するために page の LSN を変更するオプションは
ない。代わりに、transaction に関連付けられた LSN まで WAL をまだ flush していない
場合は、hint bit の設定を defer する。これには、flush されていない各 async commit の
LSN を追跡することが必要である。この data を clog buffer に関連付けるのが便利である。
clog page を書き出す前に WAL を flush するので、commit status を保持する clog page が
memory にとどまっている間より長く transaction の LSN を覚えておく必要はないからで
ある。しかし、各 clog 位置に LSN を格納するナイーブなアプローチは魅力的ではない。
LSN は 2-bit な commit status field の 32 倍の大きさであるため、各 8K clog buffer
page に対して追加で 256K の shared memory が必要になる。代わりに、page ごとに
少数の LSN を格納することを選んでおり、各 LSN はその page 上の連続する transaction ID
範囲内の任意の transaction commit に関連付けられた最高の LSN である。これにより
storage を節約できるが、transaction hint bit の設定にいくらか不要な遅延が生じる
可能性があるという代償を伴う。

同じ cache された LSN を共有する transaction は何個 (N 個) にすべきか？ system の
workload が小さな async-commit transaction だけで構成される場合、N は walwriter
サイクルあたりの transaction 数と同程度にするのが妥当である。これがとにかく
transaction が真に committed となる（したがって hintable となる）粒度だからである。
最悪のケースは、sync-commit な xact が少し後に commit する async-commit な xact と
cache された LSN を共有する場合である。最初の xact を disk に sync する cost を
支払ったにもかかわらず、2 番目の xact が sync されるまで（最大で 3 つの walwriter
サイクル後）その出力を hint することができない。これは N (group size) を可能な限り
小さく保つ理由となる。当面は group size を 32 に設定しており、これは LSN の cache
空間を実際の clog buffer 空間と同サイズにする（BLCKSZ とは独立して）。

synchronous commit と asynchronous commit の transaction を同時に走らせられるのは
有用だが、これの安全性はすぐには明らかでないかもしれない。T1 と T2 の 2 つの
transaction があると仮定する。Log Sequence Number (LSN) は transaction commit が
記録される WAL シーケンス内の点なので、LSN1 と LSN2 はそれらの transaction の
commit record である。T2 が T1 によって行われた変更を見ることができるなら、T2 が
commit する時には LSN2 が LSN1 の後に続くことが真でなければならない。したがって
T2 が commit するとき、T1 によって行われたすべての変更も今 WAL に記録されている
ことが確実である。これは T1 が asynchronous であろうと synchronous であろうと真で
ある。その結果、synchronous commit によって書き込まれたデータを危険にさらすことなく、
asynchronous commit と synchronous commit を同時に動作させても安全である。
top level transaction の commit 時にのみ disk への最終 write が発生するので、
sub-transaction はここでは重要ではない。

data block への変更は、WAL が data block の LSN の位置まで flush されない限り disk
に到達できない。安全でないデータを disk に書き込もうとする試みは write を発生させ、
それと先行する transaction によって書き込まれたすべての data の安全性を保証する。
data block と clog page はどちらも LSN によって保護される。

temp table への変更は WAL-log されないので、T1 の commit より先に disk に到達する
可能性があるが、temp table の内容はとにかく crash を生き延びないので、これは
気にしない。

新しい relfilenumber に対して WAL を skip する database write も安全である。
これらのケースでは、T1 の commit より前に data が disk に到達することは完全に
あり得る。T1 は何らかの interlock なしにそれを disk まで fsync するからである。
ただし、これらのパスはすべて、T1 が commit するまで他の transaction から見えない
data を write するように設計されている。したがって状況は通常の WAL-logged な
update と違わない。

## Transaction Emulation during Recovery

Recovery 中、transaction の変更を発生した順序で replay する。この replay の一部
として、いくつかの transactional な動作を emulate し、read only な backend が MVCC
snapshot を取得できるようにする。これは、replay 中の transaction に属する XID の
list を保持することで行う。これにより、database write のための WAL record を記録した
各 transaction は、commit するまで配列内に存在する。さらなる詳細は procarray.c の
コメントに記載されている。

多くの action は WAL record をまったく書き込まない。例えば read only transaction で
ある。これらは recovery 中の MVCC に影響を与えないので、それらがまったく発生しな
かったかのように扱える。Subtransaction の commit も WAL record を書き込まず、lock
の待機者が親 transaction の完了を待つ必要があるため、その効果はごくわずかである。

すべての transactional な動作が emulate されるわけではない。例えば transaction entry を
lock table に挿入しないし、メモリ上に transaction stack を保持することもしない。
Clog、multixact、commit_ts の entry は通常通り作成される。Subtrans は recovery 中も
保持されるが、transaction tree の詳細は無視され、すべての subtransaction は top-level
の TransactionId を直接参照する。commit は atomic なので、これは正しい lock 待ち
動作を提供しつつ subtransaction の emulation を大幅に簡素化する。

recovery 時の locking 機構に関するさらなる詳細は、Lock rmgr code のコメントに
記載されている。

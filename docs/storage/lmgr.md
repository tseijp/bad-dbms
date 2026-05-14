src/backend/storage/lmgr/README

# Locking の概要

Postgres は 4 種類の interprocess lock を使用します:

- Spinlocks。これらは _非常に_ 短期間の lock を意図しています。lock を
  数十命令以上保持する場合、またはあらゆる種類の kernel call (あるいは些細でない
  subroutine 呼び出し) をまたぐ場合は、spinlock を使用しないでください。
  spinlock は主に lightweight lock の infrastructure として使用されます。
  hardware の atomic-test-and-set 命令が利用可能な場合は、それを使用して
  実装されます。待機中の process は lock を取得できるまで busy-loop します。
  deadlock 検出、エラー時の自動 release、その他の便利機能はありません。
  1 分程度経っても lock を取得できない場合は timeout が発生します
  (これは意図された lock 保持時間と比較するとほぼ永遠の長さなので、これは
  確実に error 状態です)。

- Lightweight locks (LWLocks)。これらの lock は通常、shared memory 内の
  data structure へのアクセスを interlock するために使用されます。LWLock は
  exclusive と shared の両方の lock mode (shared object に対する read/write と
  read-only アクセス) をサポートします。deadlock 検出はありませんが、
  LWLock manager は elog() recovery 中に保持中の LWLock を自動的に release
  するため、LWLock を保持したままエラーを発生させても安全です。LWLock の
  取得や release は、lock に contention がなければ非常に高速です (数十命令程度)。
  process が LWLock を待たなければならない場合は、CPU 時間を消費しないように
  SysV semaphore で block します。待機中の process は到着順に lock を付与
  されます。timeout はありません。

- Regular locks (別名 heavyweight locks)。regular lock manager は
  table-driven な semantics を持つ多様な lock mode をサポートし、完全な
  deadlock 検出と transaction 終了時の自動 release を備えています。
  regular lock はすべての user-driven な lock 要求に使用されるべきです。

- SIReadLock predicate locks。詳細は別途 README-SSI ファイルを参照してください。

spinlock または lightweight lock の取得は、そのような lock がすべて release
されるまで、query cancel と die() interrupt を保留にします。ただし、regular
lock にはそのような制限はありません。また、regular lock を待っている間は
query cancel と die() interrupt を受け入れることができますが、spinlock や
LW lock を待っている間は受け入れません。したがって、待機時間が数秒を超える
可能性がある場合に LW lock を使用するのは良い考えではありません。

この README ファイルの残りの部分では、regular lock manager について詳細に
説明します。

## Lock の Data Structure

Lock method は全体的な locking 動作を記述します。現在、lock method には
DEFAULT と USER の 2 つがあります。

Lock mode は lock の種類 (read/write または shared/exclusive) を記述します。
原則として、各 lock method は異なる衝突ルールを持つ独自の lock mode のセットを
持つことができますが、現在 DEFAULT と USER method は同一の lock mode セットを
使用します。詳細は src/include/storage/lock.h を参照してください。
(lock mode はコードやドキュメントの一部では lock type とも呼ばれます。)

shared memory に lock を記録するための主な方法は 2 つあります。primary な
メカニズムは 2 つの主要な structure を使用します: per-lockable-object の
LOCK struct、および per-lock-and-requestor の PROCLOCK struct です。
LOCK object は、現在 lock が保持されているか要求されている lockable object
ごとに存在します。PROCLOCK struct は、各 LOCK object に対して lock を保持
または要求している backend ごとに存在します。

また、backend が非常に特定の特性を持つ限られた数の lock を記録するために
使用できる特殊な「fast path」メカニズムもあります: それらは DEFAULT
lockmethod を使用しなければならず、database relation (shared relation
ではなく) の lock を表していなければならず、衝突する可能性が低い「weak」
lock (AccessShareLock、RowShareLock、または RowExclusiveLock) でなければ
ならず、そして system が衝突する lock が存在し得ないことを迅速に検証
できなければなりません。詳細は下記の「Fast Path Locking」を参照してください。

各 backend はまた、現在保持または要求している lockable object と lock mode
ごとに、非共有の LOCALLOCK structure を保持します。共有 lock structure は、
lockable object/lock mode/backend ごとに 1 つの lock grant のみを許可します。
しかし、backend 内部では、同じ lock が transaction 内で複数回要求され、
おそらく release される可能性があり、また transactionally と session-wide の
両方で保持される可能性もあります。内部要求カウントは LOCALLOCK に保持される
ため、それらを変更するために共有 data structure にアクセスする必要はありません。

---

lock manager の LOCK object には以下が含まれます:

tag -
shared memory の lock hash table で lock を hash するために使用される
キーフィールドです。tag の内容は本質的に個々の lockable object を定義します。
サポートされている lockable object の型については include/storage/lock.h を
参照してください。これは別個の struct として宣言されており、常に正しい
バイト数をゼロクリアできるようにしています。compiler が struct に挿入する
可能性がある alignment-padding バイトもゼロクリアすることが重要です。
そうでないと hash 計算が random になります。(現在、padding バイトがないように
struct LOCKTAG を慎重に定義しています。)

grantMask -
この bitmask は、指定された lockable object に対して現在どのタイプの lock が
保持されているかを示します。新しい lock 要求が既存の保持されている lock 型と
衝突するかどうかを判定するために (lock table の conflict table と照合して)
使用されます。衝突は、grantMask と要求された lock 型に対する conflict table
entry との bitwise AND 演算によって決定されます。grantMask の bit i は
granted[i] > 0 の場合にのみ 1 です。

waitMask -
この bitmask は待機中の lock 型を示します。waitMask の bit i は
requested[i] > granted[i] の場合にのみ 1 です。

procLocks -
これは、lock object に関連付けられたすべての PROCLOCK struct の shared memory
queue です。granted と waiting の両方の PROCLOCK がこのリストに含まれることに
注意してください (実際、同じ PROCLOCK が既に granted な lock を持ち、さらに
多くの lock を待っていることもあります!)。

waitProcs -
これは、別の backend がこの lock を release するまで待機している (sleep して
いる) backend に対応するすべての PGPROC structure の shared memory queue です。
process structure は、lock が release されたときに起こされるべきかどうかを
判定するために必要な情報を保持します。

nRequested -
この lock が取得を試みられた回数のカウントを保持します。このカウントには、
衝突のため sleep させられた process による試みも含まれます。また、たとえば
backend process が最初に read を取得してから write を取得した場合、同じ
backend を 2 回カウントします。(ただし、backend 内で同じ lock/lock mode を
複数回取得しても、ここでは複数回カウントされません。それらは backend の
LOCALLOCK structure にのみ記録されます。)

requested -
各タイプの lock が何回試みられたかのカウントを保持します。lock type の
定義済み定数に対応するため、1 から MAX_LOCKMODES-1 までの要素のみが
使用されます。requested[] の値の合計は nRequested と等しくなるはずです。

nGranted -
この lock が正常に取得された回数のカウントを保持します。このカウントには
衝突により待機中の試みは含まれません。それ以外のカウントルールは nRequested と
同じです。

granted -
各タイプの lock が現在何個保持されているかのカウントを保持します。ここでも、
1 から MAX_LOCKMODES-1 までの要素のみが使用されます (0 は使用されません)。
また、requested[] と同様に、granted[] の値の合計は nGranted の値と等しく
なるはずです。

常に 0 <= nGranted <= nRequested、および各 i に対して
0 <= granted[i] <= requested[i] であるべきです。すべての request count が
ゼロになると、LOCK object は不要になり、free できます。

---

lock manager の PROCLOCK object には以下が含まれます:

tag -
shared memory の PROCLOCK hash table で entry を hash するために使用される
キーフィールドです。これは別個の struct として宣言されており、常に正しい
バイト数をゼロクリアできるようにしています。compiler が struct に挿入する
可能性がある alignment-padding バイトもゼロクリアすることが重要です。
そうでないと hash 計算が random になります。(現在、padding バイトがないように
struct PROCLOCKTAG を慎重に定義しています。)

    tag.myLock
        この PROCLOCK が対象とする shared LOCK object への pointer。

    tag.myProc
        この PROCLOCK を所有する backend process の PGPROC への pointer。

    注: PROCLOCK はその lock またはその proc より長く生存することはないため、
    ここでは pointer を使用しても問題ありません。tag は必要な間 unique で
    あり、同じ tag の値が他のタイミングでは別の意味を持つ可能性があってもです。

holdMask -
この PROCLOCK によって正常に取得された lock mode の bitmask です。これは
LOCK object の grantMask の subset であり、また PGPROC object の heldLocks
mask の subset でもあるべきです (PGPROC がこの lock の別の lock mode を現在
待機している場合)。

releaseMask -
LockReleaseAll 中に release されるべき lock mode の bitmask です。これは
holdMask の subset でなければなりません。これは partition LWLock を取得せずに
変更されることに注意してください。したがって、PROCLOCK を所有する backend
以外がそれを検査/変更することは安全ではありません。

lockLink -
同じ LOCK に対するすべての PROCLOCK object の shared memory queue に対する
list link。

procLink -
同じ backend に対するすべての PROCLOCK object の shared memory queue に対する
list link。

---

## Lock Manager 内部の Locking

PostgreSQL 8.2 以前は、lock manager が使用するすべての shared-memory
data structure は、1 つの LWLock である LockMgrLock で保護されていました。
これらの data structure に関わるあらゆる操作は LockMgrLock を exclusively
lock する必要がありました。当然のことながら、これは contention の bottleneck
となりました。contention を減らすため、lock manager の data structure は
複数の「partition」に分割され、それぞれが独立した LWLock で保護されています。
ほとんどの操作は、作業対象の単一の partition のみを lock する必要があります。
詳細は以下のとおりです:

- 各 possible lock は、その LOCKTAG 値の hash に従って 1 つの partition に
  割り当てられます。partition の LWLock は、その partition のすべての
  LOCK object およびそれらに付随する PROCLOCK を保護するものとみなされます。

- LOCK と PROCLOCK の shared-memory hash table は、異なる partition が
  異なる hash chain を使用するように構成されているため、異なる partition の
  object を操作するときに衝突は発生しません。これは LOCK table に対しては
  dynahash.c の「partitioned table」メカニズムによって直接サポートされています:
  partition 番号が LOCKTAG の dynahash hash 値の low-order bit から取られている
  ことを保証するだけです。PROCLOCK に対してこれを機能させるためには、
  PROCLOCK の hash 値が関連する LOCK と同じ low-order bit を持つことを保証する
  必要があります。これは specialized な hash 関数を必要とします
  (proclock_hash を参照)。

- 以前は、各 PGPROC にはそれに属する PROCLOCK の単一のリストがありました。
  これは現在 per-partition リストに分割されているため、特定の PROCLOCK リスト
  へのアクセスは関連付けられた partition の LWLock で保護できます。
  (このルールにより、1 つの backend が別の backend の PROCLOCK リストを
  操作できるようになります。これは元々必要ではありませんでしたが、fast-path
  locking に関連して現在は必要です。下記を参照してください。)

- PGPROC のその他の lock 関連フィールドは、PGPROC が lock を待っているときに
  のみ interesting なので、それらは待っている lock の partition LWLock で
  保護されていると考えます。

通常の lock 取得と release では、必要な lock を含む partition を lock すれば
十分です。deadlock checking では一般に複数の partition に触れる必要があります。
簡単のために、すべての partition を partition 番号順に lock します。
(LWLock の deadlock を防ぐため、複数の partition を一度に lock する必要がある
backend は、それらを partition 番号順に lock しなければならないというルールを
定めています。) 一般的な場合に、すべての partition に触れることなく
deadlock checking を行うことは可能ですが、正常に機能する system では
deadlock checking が performance-critical となるほど頻繁に発生すべきでは
ないので、これを機能させようと努力するのは生産的な努力の使い方とは思えません。

backend の内部 LOCALLOCK hash table は partition 化されていません。
LOCALLOCK table entry に locktag の hash code のコピーを格納しており、
そこから partition 番号を計算できますが、これは単純に space と speed の
trade-off です: 必要に応じて LOCKTAG から partition 番号を再計算することも
できます。

## Fast Path Locking

Fast path locking は、非常に頻繁に取得・release されるが、めったに衝突しない
特定のタイプの lock の取得・release の overhead を削減するために設計された
特別な目的のメカニズムです。現在、これには 2 種類の lock が含まれます:

(1) Weak relation lock。SELECT、INSERT、UPDATE、DELETE は、操作対象の
すべての relation および内部的に使用される可能性のあるさまざまな system catalog
に対して lock を取得する必要があります。多くの DML 操作は、同じ table に対して
同時に並列実行できます。CLUSTER、ALTER TABLE、DROP などの DDL 操作、または
LOCK TABLE などの明示的な user action のみが、DML 操作によって取得される
「weak」lock (AccessShareLock、RowShareLock、RowExclusiveLock) と衝突する
lock を作成します。

(2) VXID lock。すべての transaction は、自身の virtual transaction ID に
lock を取得します。現在、これらの lock を待つ唯一の操作は CREATE INDEX
CONCURRENTLY と Hot Standby (衝突の場合) なので、ほとんどの VXID lock は
owner によって取得・release され、他の誰もそれを気にする必要はありません。

primary locking メカニズムはこの workload に対応するのが得意ではありません。
lock manager の lock は partition 化されていますが、特定の relation に対する
locktag は依然として 1 つの partition にのみ収まります。したがって、多くの
short query が同じ relation にアクセスすると、その partition の lock manager
partition lock が contention の bottleneck になります。この影響は 2-core の
server でも測定可能であり、core 数の増加とともに非常に顕著になります。

この bottleneck を軽減するため、PostgreSQL 9.2 から、各 backend は primary
lock table を使用する代わりに、PGPROC structure 内の array に unshared
relation 上の限られた数の lock を記録することが許可されています。この
メカニズムは、locker が lock 取得時に衝突する lock が存在しないことを検証
できる場合にのみ使用できます。

このアルゴリズムの重要な点は、shared LWLock や spinlock を奪い合うことなく、
衝突する可能性のある lock がないことを検証できなければならないことです。
そうでなければ、この努力は単に contention の bottleneck を 1 つの場所から
別の場所に移すだけになります。これを実現するために、lock space を 1024-way で
partition 化する 1024 個の integer counter の array を使用します。
各 counter は、その partition に該当する unshared relation に対する「strong」
lock (つまり、ShareLock、ShareRowExclusiveLock、ExclusiveLock、
AccessExclusiveLock) の数を記録します。この counter がゼロでない場合、
その partition 内で新しい relation lock を取得するために fast path メカニズムを
使用することはできません。strong locker は counter をインクリメントし、
それから per-backend の各 array を走査して一致する fast-path lock を探します。
見つかったものはすべて、lock 取得を試みる前に primary lock table に転送される
必要があり、これにより適切な lock の衝突と deadlock 検出が保証されます。

SMP system では、適切な memory synchronization を保証する必要があります。
ここでは、LWLock の取得が memory sequence point として機能するという事実に
依存します: A が store を実行し、A と B の両方がいずれかの順序で LWLock を
取得し、B が同じ memory location で load を実行する場合、A の store を見ることが
保証されます。このケースでは、各 backend の fast-path lock queue は LWLock で
保護されています。fast-path lock を取得しようとする backend は、衝突する
strong lock の存在を check するために FastPathStrongRelationLocks を調べる前に
この LWLock を取得します。strong lock を取得しようとする backend は、
fast-path メカニズム経由で取得された一致する weak lock を shared lock table に
転送する必要があるため、backend の fast-path queue を保護する各 LWLock を
順番に取得します。したがって、FastPathStrongRelationLocks を調べてゼロを見た
場合、その値は本当にゼロであるか、古い値である場合は strong locker はまだ
現在保持している per-backend LWLock (実際、最初の per-backend LWLock すらも) を
取得していないため、取得時にこちらが取得する weak lock に気付くことになります。

Fast-path VXID lock は FastPathStrongRelationLocks table を使用しません。
VXID に最初に取得される lock は常に owner によって取得される ExclusiveLock
です。後続の locker は、VXID の終了を待つ share locker です。実際、VXID lock が
(他の方法で VXID 終了を待つのではなく) lock manager を使用する唯一の理由は
deadlock 検出です。したがって、初期の VXID lock は _常に_ 衝突 check なしで
fast path 経由で取得できます。後続の locker は、lock が main lock table に
転送されたかどうかを check し、転送されていない場合は転送する必要があります。
VXID を所有する backend は、transaction 終了時に main lock table に作成された
entry を cleanup するように注意する必要があります。

deadlock 検出は fast-path data structure を調べる必要はありません。なぜなら、
deadlock に関与する可能性のある lock は、事前に main table に転送されている
はずだからです。

## Deadlock Detection Algorithm

user transaction が任意の順序で lock を要求することを許可しているため、
deadlock が発生する可能性があります。本質的にはかなり標準的な deadlock 検出/
解消アルゴリズムを使用していますが、Postgres の generalized な locking model に
対処するために多くの特別な配慮が必要です。

重要な設計上の考慮事項は、deadlock がないときには routine な操作 (lock grant と
release) を高速に実行し、可能な限り deadlock handling の overhead を避けたい
ということです。これは「optimistic waiting」アプローチを使用して行います:
process が望む lock を直ちに取得できない場合、deadlock check なしで sleep
します。しかし、それは DeadlockTimeout ミリ秒 (通常は 1 秒に設定) の遅延で
delay timer も設定します。process が望む lock が granted される前に遅延が経過
すると、deadlock 検出/解消コードを実行します。通常、このコードは deadlock 状態が
ないと判断し、process は再び sleep して lock が granted されるまで静かに待ちます。
しかし、deadlock 状態が実際に存在する場合は、通常、検出側 process の transaction
を abort することで解消されます。このようにして、lock の wait time が
DeadlockTimeout より短い場合は deadlock handling の overhead を避けつつ、
エラーがある場合の検出に不当な遅延を課さないようにしています。

Lock 取得 (routine LockAcquire と ProcSleep) は以下のルールに従います:

1. lock 要求が既存または待機中の lock 要求と衝突しない場合、または process が
   同じ lock type の instance を既に保持している場合 (たとえば、read lock を
   2 回取得するのに penalty はない)、lock 要求は直ちに granted されます。
   process は自分自身とは決して衝突しないことに注意してください。たとえば、
   既に exclusive lock を保持している場合に read lock を取得できます。

2. それ以外の場合、process は lock の wait queue に参加します。通常は queue の
   末尾に追加されますが、例外があります: process が同じ lockable object に
   対して、保留中の waiter の要求と衝突する lock を既に保持している場合、
   その process はそのような最初の waiter のちょうど前の位置に wait queue に
   挿入されます。(この check を行わない場合、deadlock 検出コードが衝突を
   解消するために queue の順序を調整しますが、ProcSleep で check する方が
   比較的安価で、この場合の deadlock timeout 遅延を避けられます。)
   queue の末尾より前に挿入する場合の特別なケースに注意してください: process の
   要求が既存の lock や挿入ポイントの前の wait 要求のいずれとも衝突しない場合は、
   待たずに lock を grant します。

lock が release されると、lock release routine (ProcLockWakeup) は lock
object の wait queue を走査します。各 waiter は、(a) その要求が既に granted な
lock と衝突せず、かつ (b) その要求が起こせない先行 waiter の要求と衝突しない
場合に起こされます。ルール (b) は、衝突する要求が到着順に granted されることを
保証します。deadlock を避けるために、後の waiter を衝突する先行 waiter の前に
通す必要があるケースがありますが、これらのケースを認識するのは ProcLockWakeup の
責任ではありません。代わりに、必要に応じて deadlock 検出コードが wait queue を
並び替えます。

deadlock checking を実行するために、さまざまな process を directed graph
(waits-for graph または WFG) の node とみなす標準的な方法を使用します。
A が B を待つ場合、つまり A が何らかの lock を待っていて B が衝突する lock を
保持している場合、A から B に向かう graph の edge があります。WFG に cycle が
含まれている場合にのみ、deadlock 状態となります。cycle を検出するには、
waits-for edge に沿って外向きに探索して、出発点に戻るかどうかを確認します。
3 つの可能な結果があります:

1. すべての outgoing path が running process (outgoing edge を持たない) で
   終了する。

2. 出発点に戻ることで deadlock が検出される。このような deadlock は、
   出発点の lock 要求を cancel し、その transaction でエラーを報告することで
   解決します。通常は transaction の abort とその transaction の保持 lock の
   release につながります。cycle を除去するには 1 つの要求を cancel すれば
   十分であり、関与するすべての transaction を kill する必要はないことに
   注意してください。

3. 一部の path が出発点ではない node に戻る。これは deadlock を示しますが、
   我々の出発 process を含まないものです。そのような deadlock を解消するのは
   関与する process の責任であるという理由で、この状態は無視します ---
   我々の出発点 process を kill しても deadlock は解消されません。したがって、
   ケース 1 と 3 はどちらも「deadlock なし」を報告します。

Postgres の状況は標準的な deadlock 検出の議論よりも少し複雑です。2 つの
理由があります:

1. process が複数の他の process を待っている可能性があります。なぜなら、
   waiter の要求と衝突する (相互に衝突しない) lock type の PROCLOCK が
   複数ある可能性があるからです。これは実際の困難を生むものではありません。
   複数の outgoing edge を追跡する準備をするだけで十分です。

2. process A が何らかの lock の wait queue で process B の後ろにあり、それらの
   要求する lock が衝突する場合、A は B を待つと言わなければなりません。
   なぜなら、ProcLockWakeup は B より先に A を起こすことは決してないからです。
   これにより WFG に追加の edge が作成されます。既に保持されている lock に
   よって誘導される「hard」edge に対して、これらを「soft」edge と呼びます。
   B が既に A の要求と衝突する lock を保持している場合、それらの関係は
   soft edge ではなく hard edge であることに注意してください。

「soft」block、または wait-priority block は、hard block と同じく deadlock を
誘発する可能性があります。しかし、関与する transaction を abort せずに
soft block を解消できる場合があります: 代わりに、wait queue の順序を並び替える
ことができます。この並び替えは、queue 順序が逆の衝突する要求を持つ 2 つの
process 間の soft edge の方向を逆転させます。新しい cycle を作成せずに cycle を
除去する並び替えを見つけることができれば、abort を避けることができます。
そのような可能な並び替えを check することが、アルゴリズムの最も難しい部分です。

deadlock detector の主役は、出発点 process (waiting process でなければなりません) を
与えられる FindLockCycle() routine です。上記で議論したように、waits-for edge に
沿って外向きに再帰的に走査します。出発点を含む cycle が見つからない場合は
「false」を返します。(上記で議論したように、出発点を含まない cycle は無視
できます。) そのような cycle が見つかると、FindLockCycle() は「true」を返し、
unwind するときに cycle に関与する「soft」edge のリストも構築します。結果の
リストが空の場合は hard deadlock があり、構成は成功できません。しかし、リストが
空でない場合は、リストされた edge のいずれかを wait-queue の並び替えで逆転
させることで、その cycle を除去できます。そのような逆転は他の場所で cycle を
作成する可能性があるため、すべての可能性を試す必要があるかもしれません。
したがって、現在の実際の順序だけでなく、仮想的な構成 (wait order) に対しても
FindLockCycle() を呼び出せるようにする必要があります。

これを処理する最も簡単な方法は、並び替えを検討している各 wait queue に対して
提案された新しい queue 順序を示す lookaside table を持つことのようです。
この table は FindLockCycle によって check され、lookaside table に entry が
ある各 lock に対して、実際の順序ではなく提案された queue 順序を信じます。

既存の entry の「topological sort」を行うことで、提案された新しい queue 順序を
構築します。現在逆転を検討している各 soft edge は、topological sort が強制する
必要のある部分順序の property を作成します。deadlock に関与していない process の
arrival order を不当に壊さないように、入力順序を可能な限り保持する sort method を
使用する必要があります。(これはたとえば Knuth で示されている tsort method には
当てはまりませんが、各 step で最初の合法な candidate を出力する単純な
doubly-nested-loop method で簡単に行えます。幸いなことに、部分順序の制約数は
大きくない可能性が高いので、非常に効率的な sort algorithm は必要ありません。)
topological sort の失敗は、衝突する ordering 制約があることを示し、したがって
最後に追加された soft edge の逆転は以前の edge 逆転と衝突することを示すことに
注意してください。可能な並び替えがない場合の infinite loop を避けるためにこの
ケースを検出する必要があります: そうでないと、逆転を試み、それでも cycle に
つながることがわかり、その cycle を取り除こうとして逆転を取り消そうとし、と
いうように続く可能性があります。topological sort の失敗は、この context で
逆転の取り消しが legitimate な動きではないことを示しています。

したがって、並び替え method の基本 step は、cycle 内の soft edge のリスト
(FindLockCycle() によって返されるもの) を取り、それぞれの逆転を、既に検討
している制約に追加される topological-sort 制約として順次試すことです。そのような
制約セットすべてを再帰的に探索し、どれか 1 つがすべての deadlock cycle を一度に
除去するかどうかを確認します。これはとてつもなく非効率に見えるかもしれませんが、
実際には大きな問題にはなりません。なぜなら、通常は非常に少なく、それほど
大きくない deadlock cycle --- もしあれば --- しかないからです。したがって、
組み合わせの非効率は問題になりません。さらに、本当に必要でないのに transaction
を abort するよりも、すべての可能な escape route を check したことを保証する
ために時間を費やす方が良いです。

各 edge 逆転制約は、waiting process A を、両者が含まれる wait queue の中で
blocking process B より前に移動することを要求していると見ることができます。
このアクションは、希望される soft edge を逆転させ、また A とそれが追い越した
他の process 間のその他の soft edge も逆転させます。他の edge は影響を
受けません (これは実際には topological sort method に対する制約で、必要以上に
queue を並び替えないようにするものです)。したがって、FindLockCycle(A) も
FindLockCycle(B) も cycle を発見しなければ、新しい deadlock cycle を作成
していないことを確認できます。上記で定義した FindLockCycle の動作を考えると、
これらの探索のそれぞれは必要かつ十分です。なぜなら、元の出発点から開始した
FindLockCycle は、A または B を含むが元の出発点を含まない cycle については
警告しないからです。

要するに、wait queue の提案された並び替えは、1 つ以上の壊れた soft edge A->B に
よって決定され、関与する各 wait queue の topological sort の出力によって完全に
指定され、それから元の出発点ならびに言及された各 process (A と B) から
FindLockCycle() を呼び出して test されます。どの test も cycle を検出しなければ、
有効な構成があり、sort 出力に従って wait queue を並び替えることで実装できます
(そして、waiter が起こせるようになった場合に備えて、並び替えられた各 queue に
対して ProcLockWakeup を適用します)。いずれかの test が soft cycle を検出した
場合、その cycle 内の各 soft link を順に提案された並び替えリストに追加して
解消を試みることができます。これは、実行可能な並び替えが見つかるか、存在しないと
判断するまで再帰的に繰り返されます。後者の場合、外側の level は元の出発点
transaction を abort することで deadlock を解消します。

並び替えが試される特定の順序は FindLockCycle() が scan する順序に依存するため、
wait queue の実行可能な並び替えが複数ある場合、どれが選ばれるかは指定されて
いません。より重要なことは、成功につながる可能性のあるすべての queue の並び替えを
試すことを保証することです。(たとえば、A、B、C の順で、必要な順序制約が C を A の
前にし、B を C の前にする場合、まず A を C の前にすることがうまくいかないことを
発見し、C、A、B の順序の並び替えを試みます。これは最終的に B を C の前にする
追加の制約の発見につながります。)

わかりましたか?

## その他の Notes

1. deadlock checking の非同期呼び出しによって deadlock が見逃されないことは
   簡単に証明できます。WFG の deadlock cycle は、cycle 内の最後の edge が
   追加されたときに形成されます。したがって、cycle 内で最後に待機する process
   (その edge が発信する process) は、後で CheckDeadLock を実行するときに
   cycle を検出して解消することが確実です。これは、その edge の追加が複数の
   cycle を作成した場合でも当てはまります。process は追加の cycle に気付くこと
   なく abort する可能性がありますが、特に気にしません。deadlock 作成の唯一の
   他の可能性は、deadlock 解消の wait queue の並び替え中ですが、その algorithm は
   実際に何らかの並び替えを実行する前に新しい deadlock を作成しないことを
   証明することを既に見ました。

2. deadlock が最後に待機した process を abort することで解消されるとは限りません。
   cycle 内の以前の waiter がまだ CheckDeadLock を実行していない場合、最初にそれを
   実行するものが victim になります。

3. ProcLockWakeup が wait queue のすべての member を調べるため、生きている
   (起こせる) process が見逃されることはありません (ちなみにこれは 7.0 の実装では
   true ではありませんでした)。したがって、lock が release されたり wait queue が
   並び替えられたりした後に常に ProcLockWakeup が呼び出されれば、起こせる process を
   起こせない失敗はあり得ません。LockErrorCleanup (外部要因による waiter の abort) は、
   cancel された waiter が他の waiter を soft-block している可能性があるため、
   ProcLockWakeup を実行する必要があることにも注意してください。

4. soft edge を探すときは wait queue の先頭から scan することに注意することで、
   並び替え試行の過剰な作業を最小化できます。たとえば、queue の順序が A、B、C で、
   C が A と B の両方と deadlock 衝突を持つ場合、「C を B の前に」ではなく、
   最初に「C を A の前に」制約を生成したいと思います。「C を B の前に」では C を
   十分上に移動できないので、時間を無駄にすることになります。したがって、C から
   発信する soft edge を wait queue の先頭から探します。

5. deadlock 検出コードが必要とする作業 data structure は、MaxBackends から計算
   された entry 数に制限できます。したがって、backend 起動時に必要な最悪ケースの
   space を割り当てることができます。これは、その場で workspace を割り当てようと
   するよりも安全なアプローチに思えます。deadlock detector が memory 不足になる
   risk を避けたいのです。そうでないと、deadlock が検出されることをまったく
   保証できません。

6. deadlock detector を悪用して autovacuum cancellation を実装します。detector を
   実行して waits-for graph に autovacuum worker が関与していることを発見した場合、
   その PGPROC への pointer を格納し、特別な return code を返します (hard deadlock が
   検出されていない場合)。呼び出し元はそれから cancellation signal を送信できます。
   これは、autovacuum が locking 優先度が低い (たとえば、table 上の DDL を block して
   はならない) という原則を実装しています。

## Group Locking

以上すべてがすでに十分複雑であるかのように、PostgreSQL は現在 parallelism を
サポートしています (src/backend/access/transam/README.parallel を参照)。これは、
個々の process ではなく、関連する process の gang 間で発生する deadlock を解消する
必要があるかもしれないことを意味します。これは基本的な deadlock 検出 algorithm を
大きく変えるものではありませんが、bookkeeping がより複雑になります。

relation extension lock を除き、同じ parallel group 内の process が保持する lock を
非衝突とみなすことを選択します。これは、parallel group 内の 2 つの process が
同じ relation に対して self-exclusive lock を同時に保持できる、または 1 つの
process が AccessShareLock を取得する一方で他の process が既に AccessExclusiveLock を
保持できることを意味します。これは危険に見えるかもしれませんし、場合によっては
そうかもしれません (詳細は下記)。しかし、これをしないと parallel query は
self-deadlock を非常に起こしやすくなります。たとえば、leader が既に
AccessExclusiveLock を保持している relation に対する parallel query は hang する
でしょう。なぜなら、worker は同じ relation を lock しようとして leader によって
block されますが、leader はすべての worker から完了通知を受け取るまで終了できない
からです。検出されない deadlock が発生します。これはそのような問題が発生する唯一の
シナリオには程遠いです。leader が AccessShareLock のみを保持し、worker が
AccessShareLock を求める一方で、leader が lock を取得しようとする時点と worker が
lock を取得しようとする時点の間に、他の process が AccessExclusiveLock を求めて
wait queue に並ぶ場合も同じことが起こります。この場合も、無期限の hang が
発生します。

worker がどの lock を取得しようとするかを予測でき、parallel 化する前にそれらの
lock が正常に取得されることを保証できるように思えるかもしれません。しかし、これを
一般的に機能させるのは非常に困難です。たとえば、parallel worker の query plan の
一部に、動的に query を生成する SQL-callable function が含まれている可能性があり、
その query が偶然 leader が AccessExclusiveLock を保持している table に当たる可能性が
あります。worker ができることに十分な制限を課すことで、最終的にそれらの動作を適切に
制限する状況を作り出すことができますが、これらの制限はかなり負担になりますし、
それでも worker が必要な lock の取得に成功するかどうかを判断するために必要な
system は複雑で、おそらくバグを含むでしょう。

そのため、代わりに lock group 内の lock は衝突しないと判断するアプローチを取ります。
これにより、検出されない deadlock の可能性が排除されますが、いくつかの問題のある
ケースも開かれます: leader と worker が、通常は heavyweight lock メカニズムに
よって防がれる何らかの操作を同時に行おうとすると、undefined behavior が発生する
可能性があります。実際には、危険は控えめです。leader と worker は同じ transaction、
snapshot、combo CID hash を共有し、どちらも DDL を実行できず、実際にはデータを
書き込むこともできません。したがって、どちらかが他方によって exclusively lock
された table を読むことは十分に安全です。leader が、別の process からの table
アクセスを安全でないものにする backend-private な状態を持つコードの時点から
parallelism を開始した場合、たとえば SetReindexProcessing を呼び出した後
ResetReindexProcessing を呼び出す前に、worker がその状態を持っていないため、
大惨事が起こる可能性があります。同様に、GIN page lock などの特定の種類の
non-relation lock に問題が発生する可能性があります。2 つの関連 process が GIN
クリーンアップを同時に実行することは、無関係な process が同じことを行うのと
同じくらい安全ではありません。しかし、parallel mode は現在のところ厳密に
read-only であるため、これもほとんどの類似のケースも現在は発生しません。
parallel write を許可するには、(1) deadlock detector をさらに強化して、これらの
タイプの lock を他のタイプとは異なる方法で処理するか、(2) parallel worker が
そのようなケースに対して他の mutual exclusion method を使用するか、のいずれかが
必要になります。

Group locking は、各 PGPROC に 3 つの新しい member を追加します: lockGroupLeader、
lockGroupMembers、lockGroupLink です。PGPROC の lockGroupLeader は、parallel
query に関与していない process では NULL です。process が parallel worker と
協調したい場合、lock group leader になります。これはこのフィールドを自身の
PGPROC を指すように設定することを意味します。parallel worker が起動するとき、
このフィールドを leader に向けます。lockGroupMembers フィールドは leader でのみ
使用されます。これは lock group の member PGPROC (leader とすべての worker) の
リストです。lockGroupLink フィールドはこのリストの list link です。

これら 3 つのフィールドはすべて、lock manager の partition lock で保護されていると
考えられます。特定の lock group 内でこれらのフィールドを保護する partition lock は、
leader の pgprocno を lock manager partition 数で modulo 演算することで選ばれます。
この珍しい配置には大きな利点があります: deadlock detector は、deadlock detector の
実行中に lockGroupLeader フィールドが変更されないことを当てにできます。なぜなら、
すべての lock manager lock を保持していることを知っているからです。また、この単一の
lock を保持することで、lock group の lockGroupMembers リストの安全な操作が可能に
なります。

これらのフィールドを設定する際には追加の interlock が必要です。なぜなら、新しく
起動した parallel worker が leader の lock group に参加しようとする必要がありますが、
起動するまでに group leader がまだ生きている保証がないからです。通常のケースでは
parallel leader がすべての worker の後に死ぬようにしようとしますが、何らかの理由で
それが失敗しても system が比較的無傷で生き残れるようにします。これはそのような
シナリオに対する予防策の 1 つです: leader は自身の PGPROC と PID を worker に
中継し、worker は与えられた PGPROC がまだ同じ PID を持ち、まだ lock group leader で
ある場合を除き、lock group に参加するのに失敗します。この interlock が失敗する
ほど早く PID が再利用されないことを仮定しています。

## User Locks (Advisory Locks)

User lock は、通常の transaction 境界を越えて拡張される可能性のある長期的な
cooperative lock として、application 側で完全に処理されます。それらの目的は、
誰かが item に対して「working」中であることを application に示すことです。
したがって、tuple の oid に user lock を置き、tuple を取得し、1 時間それに対して
作業を行い、それから update して lock を remove することが可能です。lock が
active な間、他の client は依然として tuple を read/write できますが、誰かが
application level で lock を取得していることを認識できます。

User lock と normal lock は完全に直交しており、相互に干渉しません。

User lock は session level または transaction level のいずれかで取得できます。
session-level の lock 要求は transaction 終了時に自動的に release されず、
application によって明示的に release されなければなりません。(ただし、残っている
lock は常に session 終了時に release されます。) transaction-level の user lock
要求は、transaction 終了時に release され、明示的な unlocking を必要としないという
点で、normal lock 要求と同じように動作します。

## Hot Standby 中の Locking

Startup process は、recovery 中に変更を加えることができる唯一の backend であり、
他のすべての backend は read only です。その結果、Startup process は、lock level が
AccessExclusiveLock の場合を除き、relation や object に対する lock を取得しません。

Regular backend は、RowExclusiveLock 以下の level でのみ relation や object に
対する lock を取得することが許可されています。これにより、Startup process によって
AccessExclusiveLock が要求されない限り、それらが互いに、または Startup process と
衝突しないことが保証されます。

AccessExclusiveLock を含む deadlock は発生不可能なので、user が開始した deadlock が
recovery の進行を妨げる可能性について心配する必要はありません。

primary node 上の AccessExclusiveLock は、その後 Startup process によって適用される
WAL record を生成します。lock は通常の処理と同様に transaction 終了時に release
されます。これらの lock は、これらの lock を元々取得した backend の proxy として
機能する Startup process によって保持されます。繰り返しになりますが、これらの lock は
互いに衝突できないので、Startup process もそれ自体を deadlock させることができません。

deadlock は不可能ですが、regular backend の weak lock が Startup process の WAL 適用の
進行を妨げる可能性があります。これは通常、長時間容認すべきではありません。Startup
process を長すぎる間 block する場合、regular backend の query を強制的に cancel する
メカニズムが存在します。

src/backend/utils/mmgr/README

# Memory Context システムの設計概要

## 背景

メモリ割り当てのほとんどは "memory context" で行われ、これらは通常
src/backend/utils/mmgr/aset.c で実装されている AllocSet です。大きな overhead なしに
成功裏に memory management を行うための鍵は、適切な lifespan を持つ有用な context の集合を
定義することです。

memory context に対する基本操作は以下のとおりです:

- context を作成する

- context 内で memory chunk を割り当てる (標準 C library の
  malloc() に相当)

- context を削除する (そこで割り当てられたすべての memory の解放を含む)

- context を reset する (context 内で割り当てられたすべての memory を解放するが、
  context object 自体は解放しない)

- context に割り当てられた memory の総量を照会する
  (context が chunk を割り当てる元となる生 memory であり、
  chunk 自体ではない)

以前に context から割り当てられた memory chunk に対しては、それを
free したり、より大きく/小さく reallocate したりすることができます (標準 C
library の free() および realloc() routine に相当)。これらの操作は、chunk が元々
割り当てられたのと同じ context に memory を返却したり、そこから memory を取得したりします。

常に CurrentMemoryContext global 変数で示される「現在の」context が
存在します。palloc() は暗黙的にその context 内に領域を割り当てます。
MemoryContextSwitchTo() 操作は新しい current context を選択します
(そして以前の context を返すため、呼び出し元は終了する前に
以前の context を復元できます)。

malloc/free を直接使用するよりも memory context の主な利点は、
memory context の内容全体を、その内部の個々の chunk の free を
要求することなく、簡単に free できることです。これは chunk ごとの記録より
高速かつ信頼性が高いです。私たちはこの事実を使用して transaction 終了時に cleanup を行います:
transaction またはそれより短い lifespan のすべての active な context を reset することで、
すべての一時的な memory を再利用できます。同様に、各 query の終了時、または
query 実行中の各 tuple 処理後に cleanup できます。

## palloc API と標準 C library に関するいくつかの注意点

palloc とその仲間の振る舞いは標準 C library の malloc とその仲間と類似していますが、
意図的な相違点もいくつかあります。動作を明確にするために、ここに
いくつかの注意点を示します。

- memory 不足の場合、palloc と repalloc は elog(ERROR) 経由で終了します。
  これらは NULL を返すことはなく、そのような結果を test する必要も意味もありません。
  palloc_extended() を使用すれば、MCXT_ALLOC_NO_OOM flag を使ってこの振る舞いを
  override できます。

- palloc(0) は明示的に有効な操作です。NULL pointer を返すのではなく、
  バイトが使えない有効な chunk を返します。ただし、
  その chunk は後で repalloc によって大きくされるかもしれません; またエラーなしで pfree
  することもできます。同様に、repalloc は size 0 への realloc を許容します。

- pfree と repalloc は NULL pointer を受け付けません。これは意図的です。
  (repalloc については、これは必須です: 上述のとおり、repalloc は
  current memory context に依存しません。しかしその場合、割り当てを行う
  memory context を知る必要があります。したがって最初の割り当ては
  repalloc の外部で行わなければなりません。pfree については、この振る舞いは
  主に歴史的なものであり、追加 check が performance に影響を与える
  ためでもあります。)

## Current Memory Context

呼び出される routine に常に適切な memory context を渡すのは
記法上の overhead が大きすぎるため、current memory context
CurrentMemoryContext という概念が常に存在します。これがなければ、
例えば copyObject routine には context を渡す必要があり、
参照渡しの datatype を返す function 実行 routine も同様です。
内部的に一時領域を割り当てるが、それを呼び出し元には返さない routine も同様です。
私たちは確かにシステム内のすべての呼び出しに「あなたが必要とする
一時 memory 割り当てのための context はこちらです」と散らかしたくはありません。

しかしながら、その推論の結論は、CurrentMemoryContext は
可能な限り short-lifespan の context を指すべきだということです。query 実行中、
通常は各 tuple の後に reset される context を指します。_非常に_
限定的なコードでのみ、transaction lifespan を超える context を指すべきです。
なぜなら、そうすることは永続的な memory leak のリスクがあるからです。

## pfree/repalloc は CurrentMemoryContext に依存しない

pfree() と repalloc() は、CurrentMemoryContext に属するかどうかに関わらず、
任意の chunk に適用できます --- chunk の所有 context が
操作を処理するために呼び出されます。

## "Parent" と "Child" の Context

すべての context が独立していたら、特に error case で、
それらを追跡するのは困難でしょう。これは "parent" と "child" context の
tree を作成することで解決されます。memory context を作成する際、
新しい context は既存の context の child として指定できます。
context は多くの child を持つことができますが、parent は 1 つだけです。このように
context は forest を形成します (必ずしも単一の tree ではありません。複数の top-level
context が存在する可能性があるためです。ただし現在の実践では
top context は TopMemoryContext の 1 つだけです)。

context を削除すると、その直接および間接のすべての child も削除されます。
context を reset する場合、ほぼ常に child context を削除する方が有用です。
そのため MemoryContextReset() はそれを意味し、本当に空の context の tree が
欲しい場合は MemoryContextResetOnly() に加えて MemoryContextResetChildren()
を呼び出す必要があります。

これらの機能により、leak の心配なく多くの context を管理できます;
transaction 終了時に削除する 1 つの top-level context を追跡し、
私たちが作成する short-lived な context がすべてその
context の子孫であることを確認するだけでよいのです。tree は複数の level を持てるため、
per-transaction、per-statement、per-scan、per-tuple などの
nested された storage の lifetime を簡単に扱えます。部分的にしか重ならない
storage の lifetime は、context forest の異なる tree から割り当てることで
扱えます (次の section にいくつかの例があります)。

便宜上、「指定された context のすべての child を reset/delete するが、
その context 自体は reset または delete しない」などの操作も提供しています。

## Memory Context Reset/Delete Callback

Postgres 9.5 で導入された機能により、memory context を単に palloc された memory
だけでなく、より多くの resource を管理するために使用できます。これは
memory context の "reset callback function" を登録することで行われます。
そのような function は、context が次に reset または delete される直前に 1 回呼び出されます。
これは、context 内で割り当てられた object と
何らかの意味で関連付けられた resource を手放すために使用できます。可能な
use-case は以下を含みます:

- tuplesort object に関連付けられた open 中の file を close する;
- reset される context 内の object によって保持されている
  long-lived な cache object への reference count を release する;
- palloc された object に関連付けられた malloc 管理 memory を free する。
  最後の case は純粋な Postgres コードに対しては悪い programming 慣行を表すだけです;
  対象 context または何らかの child context 内で palloc を使用してすべての
  割り当てを行う方が良いでしょう。ただし、これは non-Postgres library と
  interface するコードにとってはとても役立つかもしれません。

memory context には任意の数の reset callback を設定できます;
これらは登録の逆順で呼び出されます。また、context の tree が reset または delete される場合、
child context に attach された callback は、parent context に
attach された callback の前に呼び出されます。

この API では、呼び出し元が callback の状態を保持する
MemoryContextCallback memory chunk を提供する必要があります。通常これは
論理的に attach されるのと同じ context に割り当てるべきです。そうすれば
使用後に自動的に release されます。呼び出し元にこの memory の提供を求める理由は、
ほとんどの使用シナリオで、呼び出し元が対象 context 内で何らかのより大きな
struct を作成しており、MemoryContextCallback struct をそのより大きな struct に含めることで
別の palloc() 呼び出しなしに「無料で」作成できるからです。

# 実践における Memory Context

## Globally Known Context

通常は global 変数を介して参照される、広く知られている context がいくつかあります。
いかなる瞬間にもシステムには多くの追加 context が含まれる可能性がありますが、
他のすべての context は、error 発生時に leak しないようにするため、
これらの context のいずれかの直接または間接の child であるべきです。

TopMemoryContext --- これは context tree の実際の top level です;
他のすべての context はこれの直接または間接の child です。ここでの割り当ては
本質的に "malloc" と同じです。この context は reset または delete されることが
ないためです。これは永遠に存続すべきもの、または制御 module が適切な時に
削除を担当するもののためです。例として fd.c の open file table があります。
本当に必要でない限りここに割り当てを行うのを避け、特に
CurrentMemoryContext がここを指している状態で実行することを避けてください。

PostmasterContext --- これは postmaster の通常の作業 context です。
backend が spawn された後、必要のない postmaster が使用していた
memory の copy を free するために、PostmasterContext を delete できます。
非 EXEC_BACKEND build では、postmaster の pg_hba.conf と
pg_ident.conf data の copy が backend process での認証中に直接使用されます;
したがって、それが完了するまで backend は PostmasterContext を delete できません。
(postmaster は TopMemoryContext、PostmasterContext、および
ErrorContext のみを持ちます --- 残りの top-level context は startup 中に各 backend で
setup されます。)

CacheMemoryContext --- relcache、catcache、関連する module のための永続的な storage です。
これも reset や delete されることはないので、TopMemoryContext と区別する
必要性は本当はありません。しかし debug 目的で区別を維持する価値があるようです。
(注: CacheMemoryContext にはより短い lifespan の child context があります。
例えば、relcache entry に関連付けられた付属 storage を保持するには
child context が最適な場所です; そうすれば、rule parsetree などを
freeObject() の信頼できる version を構築することに依存することなく
簡単に free できます。)

MessageContext --- この context は frontend からの現在の command message、
および現在の message と同じくらいの期間しか存続する必要のない派生 storage を
保持します (例えば simple-Query mode では、parse および plan tree をここに
配置できます)。この context は reset され、child はすべて delete されます。これは
PostgresMain の outer loop の各 cycle の先頭で行われます。これは
query 文字列が単一の transaction または portal より長い、または短い lifetime を
持つ必要があるかもしれないため、per-transaction および per-portal の context とは
分離されています。

TopTransactionContext --- これは top-level transaction の終了まで存続する
すべてを保持します。この context は reset され、すべての child は delete されます。これは
各 top-level transaction cycle の結論時に行われます。ほとんどの場合
ここに直接ものを割り当てたくはなく、CurTransactionContext に行います;
ここに属するのは、複数の subtransaction 間の status を管理するために
明示的に存在する制御情報です。注意: この context は error 時に即座に clear される
わけではありません; その内容は COMMIT/ROLLBACK で transaction block が
終了するまで存続します。

CurTransactionContext --- これは現在の transaction の終了まで存続する必要があり、
特に top-level transaction の commit 時に必要となる data を保持します。
top-level transaction 中はこれは TopTransactionContext と同じですが、
subtransaction では child context を指します。
subtransaction が abort する場合、その CurTransactionContext は
abort 処理完了後に破棄されますが、commit された subtransaction の
CurTransactionContext は top-level commit まで保持されることを理解することが重要です
(もちろん subtransaction の中間 level のいずれかが abort しない限り)。これにより、
失敗した subtransaction からの data を必要以上に長く保持しないことが保証されます。
この動作のため、subtransaction の abort 中は適切に cleanup するように
注意する必要があります --- subtransaction の state は上位 transaction に保持されている
pointer や list から切り離す必要があります。さもないと、top-level commit 時に
dangling pointer が発生して crash につながります。ここに保持される data の
例は保留中の NOTIFY message で、これは top-level commit 時に送信されますが、
生成した subtransaction が abort しなかった場合に限ります。

PortalContext --- これは実際には別の context ではなく、
現在 active な execution portal の per-portal context を指す
global 変数です。これは現在の portal の execution が必要とする限りだけ存続する
storage を割り当てる必要がある場合に使用できます。

ErrorContext --- この永続的な context は error recovery 処理のために
切り替えられ、recovery 完了時に reset されます。常に数 KB の memory が
利用可能であるように arrange しています。このようにして、backend が
他の点では memory 不足であっても、error recovery のためにいくらかの memory が
利用可能であることを保証できます。これにより、out-of-memory を FATAL error ではなく、
通常の ERROR condition として扱うことができます。

## Prepared Statement と Portal のための Context

prepared-statement object には関連付けられた private context があり、
そこに query の parse と plan tree が格納されます。これらの tree は
executor にとって読み取り専用であるため、これらの tree をさらに copy することなく、
prepared statement を何度も再利用できます。

execution-portal object には private context があり、これは portal が active な
ときに PortalContext によって参照されます。DECLARE CURSOR によって作成された
portal の場合、この private context には query の parse および plan tree が
含まれます (それらを保持できる他の object がないため)。prepared statement から
作成された portal は単に prepared statement の tree を参照し、
private context に割り当てられた storage は実際には必要としません。

## Logical Replication Worker Context

ApplyContext --- apply worker の lifetime 全体にわたって永続的です。
ここでも TopMemoryContext を使用することは可能ですが、memory 使用量
分析の簡素化のために別の context を起動します。

ApplyMessageContext --- 各 logical replication protocol message が処理された後に
reset される short-lived な context です。

## 実行中の Transient Context

prepared statement を作成する際、parse と plan tree は
MessageContext の child である一時 context に構築されます (これにより
error 時に自動的に消去されます)。成功時、完成した plan は
prepared statement の private context に copy され、一時 context は
release されます; これにより、execution 開始前に planner の一時領域を回復できます。
(simple-Query mode では追加の copy step は行わないため、planner の一時領域は
query 終了まで残ります。)

top-level の executor routine、および "plan node" 実行コードのほとんどは、
通常 ExecutorStart によって作成され ExecutorEnd によって破棄される context で
実行されます; この context には ExecutorStart 中に構築された "plan state" tree も
保持されます。これらの routine で割り当てられる memory のほとんどは、
query 終了まで存続することを意図しているため、これらの目的に適しています。
executor の top context は PortalContext の child です。つまり、
query の execution を表す portal の per-portal context の child です。

executor での主な memory management の考慮事項は、式評価が --- qual test
および targetlist entry の計算の両方について --- memory leak しないように
する必要があることです。これを行うために、executor で作成される各
ExprContext (expression-eval context) には関連付けられた private memory context があり、
その ExprContext で式を評価する際にその context に switch します。ExprContext を
所有する plan node は、式評価の結果がもう必要ないときに private context を
空に reset する責任があります。通常、reset は plan node での各 tuple-fetch cycle の
開始時に行われます。

この design によって、各 plan node に独自の expression-eval memory context が
与えられることに注意してください。これは nested join を適切に扱うために
必要に思われます。outer plan node が inner node から次の tuple を取得する間に
計算した式の結果を保持する必要があるかもしれない --- しかし inner node は
tuple を返すまでに多くの tuple cycle と多くの式を実行するかもしれません。
inner node は outer tuple cycle あたり 1 回より頻繁に独自の expression context を
reset できる必要があります。幸い、memory context は十分に安価で、
各 plan node に 1 つずつ与えることは問題には思えません。

query-lifespan の context で index access と sort を実行する際の問題は、
これらの操作が datatype 固有の比較 function を呼び出し、comparator が memory を
leak すると、その memory は query 終了まで回収されないことです。comparator function は
すべて bool または int32 を返すため、結果 data に問題はありませんが、
内部の一時 data の leak に問題があり得ます。特に、TOAST 可能な data type を
操作する comparator function は、その入力の detoast された version を leak しないように
注意する必要があります。これは煩わしいですが、index と sort の routine を修正するより、
comparator を準拠させる方がはるかに簡単と思われたため、それが 7.1 でなされたことです。
これは btree と hash index における現状であり、btree と hash の support function は
依然として memory を leak しないようにする必要があります。他の index AM のほとんどは、
opclass の support function を short-lived な context で実行するように変更されているため、
leak は問題にならない; これは、それらの support function がはるかに複雑になる傾向があることを
鑑みると必要です。

aggregate function などの特殊な case があります。nodeAgg.c は
aggregate transition function の評価結果を 1 つの tuple cycle から次へと記憶する必要があるため、
各 cycle で per-tuple state すべてを単純に破棄することはできません。これを処理する
最も簡単な方法は、aggregate node に 2 つの per-tuple context を持たせ、
それらの間で ping-pong することで、各 tuple で一方が active な割り当て context となり、
もう一方が前の cycle の transition function で割り当てられた結果を保持するようにすることに思えます。

active な CurrentMemoryContext を switch する executor routine は、
return する前に呼び出し元の current memory context に data を copy する必要が
あるかもしれません。しかし、私たちは execution cycle の_終了時_ではなく_開始時_に
per-tuple context を reset する慣習のため、その必要性を最小限に抑えています。
このルールにより、execution node は per-tuple context で palloc された tuple を return することができ、
その tuple は node が別の tuple を呼ばれるか execution 終了を告げられるまで有効な状態を保ちます。
これは table scan level での pass-by-reference 値の状況と並行しています。scan node は
その期間だけ有効であることが保証されている disk buffer 内の tuple への直接 pointer を
return することができるからです。

data を copy するより一般的な理由は、per-tuple context から per-query
context へ結果を転送するためです; 例えば Unique node は
per-query context に最後の distinct tuple 値を save し、copy step を必要とします。

## 複数の Context Type を許容する Mechanism

異なる割り当て pattern を効率的に許容し、experiment のためにも、
似た外部の振る舞いを持つが異なる割り当て policy を持つ異なる type の
memory context を許容します。これを処理するために、memory 割り当て function は
function pointer 経由で access され、すべての context type にここで与えられた
慣習に従うことを要求します。

memory context は struct MemoryContextData によって表されます (memnodes.h を参照)。
この struct は context の正確な type を識別し、parent と child の context、
および context の名前のような、異なる type の MemoryContext 間で
共通の情報を含みます。

これは本質的には抽象 superclass であり、振る舞いは
使用される MemoryContextMethods の set を参照する "methods" pointer によって
決定されます。特定の memory context type は、これらの field を最初の field として
持つ derived struct を使用します。特定の type のすべての context は、
mcxt.c で定義されている mcxt_methods[] 配列内の対応する要素を指す
methods pointer を持ちます。

context からの割り当てや reset のような操作は関連する MemoryContext を
parameter として受け取りますが、free や realloc のような操作は trickier です。
これらを機能させるため、すべての memory context type に対し、
所有 context の MemoryContextMethodID にその最下位 4 bit が set された uint64 値が
padding なしで直前にある割り当て chunk を生成することを要求します。
これにより、code はその 4 bit を mcxt_methods[] 配列への index として
使用して配列を検索することで、使用する正しい MemoryContextMethods を
判定できます。

allocator の type がその chunk に関する追加情報を必要とする場合、
例えば割り当て size など、その情報は前の uint64 値の残りの 60 bit に
encode するか、より多くの領域が必要な場合は uint64 値の直前に追加の値を
直接保存することができます。これを管理するのは context 実装次第です。

これを考慮すると、pfree のような routine は、GetMemoryChunkMethodID() を呼び出して
mcxt_methods[] 配列内の対応する MemoryContextMethods を見つけることで、
どの MemoryContextMethods の free_p function を呼び出すかを判定できます。
便宜上、MCXT_METHOD() macro が提供されており、code を次のように簡単にできます:

void
pfree(void \*pointer)
{
MCXT_METHOD(pointer, free_p)(pointer);
}

現在のすべての memory context は、memutils_memorychunk.h で定義されている
MemoryChunk header type を使用しています。これは uint64 header の残りの 60 bit を
使用して、memory chunk の size (aset.c の場合は freelist index) と、
chunk が属する block への reference を取得するために chunk から減算しなければならない
byte 数を効率的に encode するため、既存のすべての context type によく適合します。
これらのそれぞれに 30 bit が使われますが、chunk から block への offset の最下位 bit が
chunk size の最上位 bit と同じ bit であるため、合計では 59 bit しか使われません。
block と chunk の間の relative offset は MAXALIGN された値であることが期待され、
それは最下位 bit が常に 0 であることを保証するため、この overlap は可能です。
これらの field のそれぞれに 30 bit 以上が必要な場合、memory context 自身が
それを管理する必要があります。これは、指定された chunk に対して
MemoryChunkSetHdrMaskExternal() function を呼び出すことで行えます。chunk が external chunk で
あるかどうかは、64 bit の MemoryChunk から残った 1 bit によって判定できます。

現在、各 memory context type は大きな割り当てを専用 block (常に単一の chunk のみ
を含む) に格納します。これらについては、block を見つけることは簡単です。なぜなら
chunk が指定された block 上の最初のものでなければならないことが分かっているため、
block は常に chunk に対して固定 offset にあるからです。これらについては、
chunk の size を見つけることも簡単です。block は常に endptr を保存していて、
これを使って chunk の size を計算できるからです。

## aset.c の Behavior に対するより多くの制御

default では aset.c は context での最初の割り当て時に常に 8K block を割り当て、
後続の各 block 要求でその size を倍増します。これは _多くの_ data を保持する可能性のある
context にとっては良い振る舞いです。しかし、system に数十から数百もの
より小さな context がある場合、もう少し細かく調整する必要があります。

context の作成者は、初期 block size と最大 block size を指定できます。
より小さな値を選択することで、あまり多くを保持しないと予想される context での
領域の浪費を防ぐことができます (例として relcache の per-relation
context があります)。

また、何らかの理由で追加の block の初期 size と異なるべき場合に備えて、
最小 context size を指定することも可能です。aset.c context は
minContextSize が指定されている場合はその size、そうでなければ initBlockSize の
少なくとも 1 つの block を常に含みます。

per-tuple context は頻繁に reset され、通常 tuple cycle あたりあまり多くの
領域を割り当てないと予想されます。この使用 pattern を安価にするため、
context で最初に割り当てられた block は reset 中に malloc() に返却されず、
単に clear されます。これは malloc の thrashing を avoid します。

## 代替の Memory Context 実装

aset.c (AllocSetContext) は私たちの default の汎用 allocator です。
他にも special-purpose の 3 つの allocator type が存在します:

- slab.c (SlabContext) は固定 size の chunk の割り当て用に設計されています。
  固定 chunk size は context 作成時に指定する必要があります。
  新しい chunk は最も満杯の block に割り当てられ、使用中の chunk を密に pack して
  memory 断片化を avoid します。これにより、chunk の pfree で block がすべての chunk で
  空になり、operating system に free されて返却される可能性も増加します。

- generation.c (GenerationContext) は chunk が類似の lifespan (generation) を持つ group で、
  またはおおよそ FIFO 順序で割り当てられる case に最適です。pfree された chunk によって
  残された領域を再利用する試みは行われません。すべての chunk が pfree されると、
  block は operating system に返却されます。

- bump.c (BumpContext) は、個別に pfree や repalloc される必要のない、密に
  割り当てられた memory chunk を必要とする use case に最適です。これらの操作は、
  BumpContext の chunk に chunk header がないため unsupported です。
  chunk header がないということは、より密に pack された chunk を意味し、これは
  小さな割り当てを多く行う workload に特に有用です。context が reset または delete された
  ときにのみ、block は operating system に free されて返却されます。

詳細については、対応する .c file の header comment を読んでください。

## Memory Accounting

基本的な memory context 操作の 1 つは、context (およびその child) で使用されている
memory 量を決定することです。私たちは独自の ad hoc な memory accounting を
実装している複数の場所を持っており、これは統一された approach を提供することを
目的としています。Ad hoc な accounting solution は、割り当てを厳格に
制御する場所や、割り当てられた chunk の size を判定するのが簡単な場所 (例えば
tuple のみを扱う場所) で機能します。

memory context に組み込まれた accounting は透過的で、正しい
memory context subtree に収まる限り、すべての割り当てに対して透過的に機能します。

例えば aggregate function を考えてみてください - aggregate state はしばしば任意の struct で表され、
transition function から割り当てられるため、ad hoc な accounting は機能しそうにありません。
しかし、組み込みの accounting はそのような case もうまく処理します。

overhead を最小限に抑えるため、accounting は個々の割り当て chunk ではなく、
block level で行われます。

accounting は lazy です - block が割り当てられた (または free された) 後、その block を
所有する context のみが update されます。これは、特定の context での memory 使用量を
照会するとき、すべての child context を再帰的に walk しなければならないことを意味します。
これは memory accounting が (関連する subtree に) 非常に多くの memory context がある
case を意図していないことを意味します。

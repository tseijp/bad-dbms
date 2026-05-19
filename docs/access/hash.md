src/backend/access/hash/README

# Hash Indexing

このディレクトリには、Postgres の hash indexing の実装が含まれています。
中核となる考え方の大部分は Margo Seltzer と Ozan Yigit による
"A New Hashing Package for UNIX", Proceedings of the Winter USENIX Conference,
January 1991 から取られています。 (私たちの in-memory hashtable 実装である
src/backend/utils/hash/dynahash.c も、同じ概念のいくつかに依存しています。
これは Esmond Pitt によって書かれ、後に Margo らによって改良された code から派生しています。)

hash index は 2 つ以上の "bucket" から構成され、tuple の hash key が
bucket 番号に map されるたびに、その tuple が bucket に配置されます。
key-to-bucket-number mapping は、index を
incremental に拡張できるように選ばれています。新しい bucket が index に追加されると、
ちょうど 1 つの既存の bucket が "split" され、更新された key-to-bucket-number
mapping に従って、その tuple の一部が新しい bucket に移されます。これは本質的に、
src/backend/utils/hash/dynahash.c で in-memory hash table 用に
具現化されているのと同じ hash table 管理技術です。

hash index 内の各 bucket は、1 つ以上の index page から構成されます。
bucket の最初の page は、bucket が作成されるときに恒久的に割り当てられます。
追加の page、いわゆる "overflow page" は、bucket が
primary bucket page に収まりきらないほど多くの tuple を受け取った場合に追加されます。
bucket の page は、index page の special space 内の field を使用して
doubly-linked list として連結されます。

現在、hash index を縮小する方法は、REINDEX で
rebuild する以外にありません。overflow page は他の bucket での再利用のために
recycle することができますが、それらを operating system に返却することはありません。
bucket 数を減らす仕組みもありません。

PostgreSQL 8.4 以降、hash index entry は、index 対象 item ごとに
hash code のみを格納し、実際の data 値は格納しません。これにより index entry は
(おそらく非常に大幅に) より小さくなり、各種 operation が高速化されます。
特に、任意の 1 つの index page 内の index entry を hash code で sort して
維持することで search を高速化でき、index page 内で binary search を使用できるようになります。
ただし、bucket の異なる index page 間の hash code の相対順序については
_いかなる_ 仮定も存在しないことに注意してください。

## Page Addressing

hash index には 4 種類の page があります: meta page (page 0)、
これは静的に割り当てられた control information を含みます。primary bucket page、
overflow page、そして bitmap page で、free 済みで再利用可能な overflow page
を追跡します。addressing の観点では、bitmap page は
overflow page の subset とみなされます。

primary bucket page と overflow page は独立に allocate されます (なぜなら、
任意の index は bucket 数に対して、より多くまたはより少ない overflow page を必要とするかもしれないからです)。
hash code は、primary bucket page が作成された後に動かさずに済むようにしながら、
可変数の overflow page をサポートするために、興味深い addressing 規則のセットを使用しています。

primary bucket page (以下、単に "bucket page") は、
2 のべき乗のグループ、いわゆる code 内の "split point" で allocate されます。つまり、
新しい splitpoint ごとに既存の bucket 数が倍になります。bucket page の巨大な chunk を
一度に allocate するのは最適ではなく、それらを消費するのに非常に長い時間がかかります。index size の
指数関数的増加を避けるために、splitpoint での bucket の allocation を 4 つの等しい phase に
分割するというトリックを使いました。splitpoint で allocate する必要のある bucket の総数を
(2 ^ x) とすると (今後これを splitpoint group と呼びます)、splitpoint group の各 phase で
bucket 総数の 1/4 (2 ^ (x - 2)) を allocate します。次の 4 分の 1 の allocation は、
前の phase の bucket がすでに消費されている場合にのみ行われます。
初期の splitpoint group が 10 未満の場合は、その bucket すべてを単一 phase で allocate します。
なぜなら、初期 group で allocate される bucket 数は少ないからです。そして group が 10 以上の場合、
allocation process は 4 つの等しい phase に分散されます。group 10 では、(2 ^ 9) の bucket を 4 つの
異なる phase {2 ^ 7, 2 ^ 7, 2 ^ 7, 2 ^ 7} で allocate します。波括弧内の数字は、
splitpoint group 10 の各 phase で allocate される bucket 数を示します。そして、splitpoint group 11 と 12 の allocation phase はそれぞれ
{2 ^ 8, 2 ^ 8, 2 ^ 8, 2 ^ 8} と {2 ^ 9, 2 ^ 9, 2 ^ 9, 2 ^ 9} になります。各 splitpoint group で
前の group の bucket の総数を倍にしますが、これは incremental な phase で行います。
splitpoint group の 1 phase 内で allocate される bucket page は、
index 内で連続的に出現します。この addressing scheme により、bucket page の物理的な位置を、
わずかな control information のみを使って、bucket 番号から比較的容易に計算できます。関数
\_hash_spareindex を見ると、与えられた bucket 番号に対して、まずそれが属する splitpoint group を
計算し、次に bucket が属する phase を計算します。それらを合計して、bucket が属する
global な splitpoint phase 番号 S を取得し、その後、与えられた bucket 番号に
"hashm_spares[S] + 1" (ここで hashm_spares[] は metapage に格納される配列) を加算することで
物理 address を計算します。hashm_spares[S] は、splitpoint phase S の bucket page の前に
allocate された overflow page の総数として解釈できます。hashm_spares[0] は常に 0 なので、
bucket 0 と bucket 1 は常に meta page の直後の block number 1 と 2 に出現します。
hashm_spares[N] <= hashm_spares[N+1] は常に成り立ちます。後者の count には前者が含まれているからです。
2 つの差は、splitpoint phase N と N+1 の bucket page group の間に出現する
overflow page の数を表します。
(注: 上記は最初に最小サイズに設定された hash index を満たすときに何が起きるかを説明しています。
実際には、必要な index size を推定して、initial index build 中の高価な re-splitting を避けるため、
適切な数の splitpoint phase を直ちに allocate しようとします。)

合計 S 個の splitpoint が存在する場合、array entry hashm_spares[0] から
hashm_spares[S] までが有効です。hashm_spares[S] は現在の
overflow page の総数を記録します。新しい overflow page は、必要に応じて
index の末尾に作成され、hashm_spares[S] をインクリメントすることで記録されます。
新しい splitpoint phase 分の bucket page を作成するときには、
hashm_spares[S] を hashm_spares[S+1] にコピーし、S をインクリメントします (これは
meta page の hashm_ovflpoint field に格納されます)。これにより、
index の末尾に正しい数の bucket page を予約し、それらの bucket page の後に
追加の overflow page を allocate する準備が整います。S より前の hashm_spares[]
の entry は変更できなくなります。なぜなら、それは
すでに作成された bucket page を移動することを必要とするからです。

index で形式上使用される最後の page は、常に
hashm_spares[S] から決定可能です。smgr からの苦情を避けるため、filesystem と
smgr が見る論理 EOF は、常にこの page 以上でなければなりません。
index extension 中に filesystem space を allocate した後、metapage を更新する前に
crash する可能性があるので、"greater than" の場合も許容しなければなりません。file 内に "hole" を
許可する filesystem では、論理 EOF より前の page がまだ allocate されていない可能性が
完全にあることに注意してください。新しい splitpoint phase 分の bucket page を allocate するとき、
EOF を強制的に上げるために最後のそのような page を物理的に zero clear し、最初のそのような
page は直ちに使用されますが、その間の page は必要になるまで write されません。

overflow page は bucket から十分な tuple が削除された場合に recycle 可能であるため、
現在 free な overflow page を追跡する方法が必要です。各 overflow page の状態
(0 = available, 1 = not available) は、この目的に専用化された "bitmap" page に記録されます。
bitmap 内の entry は "bit number" (各 overflow page が一意の entry を持つ 0 ベースの count) で
index 付けされます。hashm_spares[] の情報を使って、overflow page の物理 block number と
bit number の間を変換できます (詳細については hashovfl.c を参照)。bit number sequence には
bitmap page も含まれ、それが bitmap page が overflow page の subset であると言う理由です。
実際、各 bitmap page の最初の bit はそれ自身を表すことが判明します --- これは本質的な
property ではありませんが、本当に必要なときにのみ別の bitmap page を allocate するという事実から
導かれます。bit number 0 は常に最初の bitmap page に対応し、それは
最初に作成されたすべての bucket の直後に index 作成中に allocate されます。

## Lock Definitions

hash index の concurrency control は、buffer content lock、buffer pin、
cleanup lock を使用して提供されます。PostgreSQL の他の場所と同様に、
cleanup lock とは、buffer に対する exclusive lock を保持し、lock を取得した後の
ある時点でその buffer に対する唯一の pin を保持していることを観察したことを意味します。
hash index の場合、primary bucket page に対する cleanup lock は、
bucket 全体の任意の reorganization を実行する権利を表します。したがって、scan は現在 scan している
bucket の primary bucket page に対する pin を保持します。bucket の split には、古い primary bucket page と新しい primary bucket page の両方に対する
cleanup lock が必要です。したがって、VACUUM は tuple を削除するためにすべての bucket page に対する
cleanup lock を取得します。また、以前の split operation で新しい bucket に copy された tuple も削除できます。
なぜなら、primary bucket page に対する cleanup lock が取られていることで、
直近の split の前に開始された scan が進行中ではないことが保証されるからです。
各 page を個別に cleaning した後、primary bucket page に対する cleanup lock を取得して、
可能な最小の page 数まで bucket を "squeeze" しようと試みます。

deadlock を避けるため、2 つの異なる bucket での lock を必要とする operation のために
bucket を lock する順序について一貫していなければなりません。
私たちは常に番号の小さい bucket を最初に lock することを選択しています。metapage は
すべての bucket lock が取得された後にのみ lock されます。

## Metapage Caching

index の scan と tuple の insert はどちらも、与えられた tuple がどこに
あるべきかを特定するために bucket を見つける必要があります。これを行うには、metapage から
bucket count、highmask、lowmask が必要ですが、すべてのそのような operation のたびに metapage を
lock して pin することは性能的に望ましくありません。代わりに、各 backend の
relcache entry に metapage の cached copy を保持します。これにより、
target bucket が最後の cache refresh 以降に split されていない限り、正しい bucket mapping が生成されます。

そのような split が発生した可能性に対する保護として、
各 bucket chain の primary page は、bucket が最後に split された時点、または
split されたことがなければ作成された時点で存在していた bucket の数を、
通常 previous block number に使用される領域 (つまり hasho_prevblkno) に格納します。
これは何のコストもかかりません。なぜなら、primary bucket page は常に chain の最初の page であり、
したがって previous block number は実際には常に
InvalidBlockNumber だからです。

metapage の cached copy に基づいて、表面的に正しい bucket 番号を計算した後、
対応する primary bucket page を lock し、hasho_prevblkno に格納された
bucket count が metapage の cached copy に格納された bucket 数より大きいかを
check します。大きい場合、bucket は確実に split されたことになります。なぜなら、count は元々
その時点で存在した bucket 数より小さくなければならず、split 以外には
増加できないからです。そうでない場合、bucket は split されていません。なぜなら、split は
これまでに見たどの bucket 番号よりも大きい新しい bucket を作成するからです。後者の場合、
正しい bucket を lock したことになり、進めることができます。前者の場合、
この bucket の lock を解放し、metapage を lock し、cache を更新し、
metapage の lock を解除して、再試行しなければなりません。

時々 retry する必要があるのは高価に思えるかもしれませんが、
hash index が何回 access されても、任意の bucket が split される回数は
数十回に制限されます。なぜなら、bucket の総数は 2^32 未満に制限されているからです。
一方、bucket への access 回数は無制限であり、好ましくないケースであっても
桁違いに大きくなります。

(metapage cache は v10 で新しく追加されました。古い hash index では、primary
bucket page の hasho_prevblkno は InvalidBuffer に初期化されていました。)

## Pseudocode Algorithms

hash index operation で使用されるさまざまなフラグは以下のように記述されます:

bucket-being-split フラグと bucket-being-populated フラグは、
bucket に対して split operation が進行中であることを示します。split operation 中、
古い bucket には bucket-being-split フラグが設定され、新しい bucket には
bucket-being-populated フラグが設定されます。これらのフラグは split operation が
完了するとクリアされます。

split-cleanup フラグは、最近 split された bucket が、
新しい bucket にも copy された tuple を依然として含んでいることを示します。これは本質的に
split が不完全であることをマークします。新しい bucket が完全に populate される前に
開始された scan が進行中でないことが確実になったら、古い bucket から copy を
削除してフラグをクリアできます。bucket を split する前にこのフラグがクリアされていることを
要求します。したがって、前の split が完全に完了するまで bucket を再度 split することはできません。

tuple に対する moved-by-split フラグは、tuple が古い bucket から新しい bucket に
移動されたことを示します。concurrent scan は、split operation が完了するまでそのような tuple をスキップします。
tuple が moved-by-split としてマークされると、それは永続的にそうなりますが、それは
害がありません。意図的にクリアしていないのは、それが
不要な追加 I/O を生成する可能性があるからです。

サポートする必要のある operation は次のとおりです: 特定の hash code (定義上、すべて同じ bucket 内にある)
の entry を求めて index を scan する reader、正しい bucket への新しい tuple の insertion、
既存の bucket を split して hash table を拡大する、そして garbage collection
(dead tuple の deletion と bucket の compaction)。bucket の splitting は、
hash table を target load factor よりも満杯にする insertion の最後に行われますが、
それを独立した operation として考えると便利です。bucket-merge operation はないことに注意してください
--- bucket の数は決して縮小しません。insertion、splitting、
garbage collection はすべて、利用可能な overflow page を追跡する
freelist management への access を必要とする可能性があります。

reader アルゴリズム:

    target bucket の primary bucket page を lock
    target bucket がまだ split によって populate されている場合:
    	current bucket page の buffer content lock を release
    	old bucket を pin し、shared mode で buffer content lock を acquire
    	old bucket の buffer content lock を release (ただし pin は保持)
    	new bucket の buffer content lock を retake
    	old bucket を通常通り scan し、new bucket を moved-by-split でない tuple に対して
         scan するように arrange

-- そして、read request ごとに:
current page に対する content lock を再 acquire
必要に応じて次の page に step (content lock の chaining はなしだが、
scan 中ずっと primary bucket の pin は保持する)
current index page から match するすべての tuple を items array に save
pin と content lock を release (ただし、primary bucket page の場合は
scan 終了までその pin を保持)
item array から tuple を取得
-- scan shutdown 時:
保持中のすべての pin を release

scan 全体にわたって primary bucket page に対する buffer pin を保持することで、
split や compaction によって reader の current-tuple pointer が無効化されることを防ぎます。
(もちろん、他の bucket は依然として split または compact される可能性があります。)

lock/unlock の traffic を最小限に抑えるため、hash index scan は常に
すべての match する item を一度に特定するために hash page 全体を search し、それらの heap tuple
ID を backend-local storage に copy します。その後、index 内のいかなる
page lock も保持しない状態で heap tuple ID が処理されます。これにより、同じ index page に対する
concurrent insertion が、reader の current scan position の再検索を必要とせずに発生できます。concurrent deletion や bucket split から
保護するため、bucket page に対する pin は引き続き保持します。

bucket split 中の scan を可能にするため、scan 開始時に bucket が bucket-being-populated として
マークされている場合、その bucket 内のすべての tuple を scan しますが、moved-by-split として
マークされているものは除きます。current bucket 内のすべての tuple の scan が完了すると、
この bucket の split 元である old bucket を scan します。

insertion アルゴリズムはかなり similar です:

    target bucket の primary bucket page を lock

-- (ここまでは reader と同じ。ただし、primary bucket page に対する exclusive mode での
buffer content lock acquisition を除く)
bucket に bucket-being-split flag が設定されていて、その pin count が
1 の場合は split を finish する
current bucket の buffer content lock を release
split によって populate されていた "new" bucket を取得
new bucket を scan して TID の hash table を形成
条件付きで old と new bucket の cleanup lock を取得
両方の bucket の lock が取得できた場合
下記の split アルゴリズムを使用して split を finish
old bucket の pin を release し、insert を最初からやり直す
current page が full の場合、まずこの page に dead tuple が含まれていないか確認する
含まれている場合、current page から dead tuple を削除し、再度
領域の availability を確認する。十分な領域が見つかれば tuple を insert し、それ以外の場合は
lock を release (ただし pin は保持しない)、next page を read/exclusive-lock し、
必要に応じて繰り返す >> bucket のどの page にも領域がない場合は下記を参照
metapage の exclusive mode で buffer content lock を取得
page 内の適切な場所に tuple を insert
current page を dirty としてマーク
tuple count をインクリメントし、split が必要かを decide
meta page を dirty としてマーク
tuple の insertion のために WAL を write
metapage の buffer content lock を release
current page の buffer content lock を release
current page が bucket page でない場合、bucket page の pin を release
split が必要な場合、下記の Split アルゴリズムに enter
metapage の pin を release

search を高速化するため、任意の individual な index page 内の index entry は
hash code で sort された状態に保たれます。insertion code は new entry を正しい場所に
insert するように注意しなければなりません。actively に scan されている bucket への
insertion が行われても問題ありません。なぜなら、上で説明したように reader はこれに対処できるからです。
reader が partially-updated page を見ないようにするためには、short-term buffer lock のみが必要です。

reader と inserter の間の deadlock を避けるため、複数の bucket を lock する必要があるときは、
常に上記の Lock Definitions で suggest された順序で取得します。このアルゴリズムにより、
非常に高い degree of concurrency が可能になります。 (tuple count を更新するために取得される
exclusive metapage lock は必要以上に strong です。なぜなら、reader は tuple count を気にしないからです。
ただし lock は非常に短時間しか保持されないので、おそらく問題にはなりません。)

inserter が bucket の既存の page のどこにも領域を見つけられない場合、
overflow page を取得してその page を bucket の chain に追加しなければなりません。
そのアルゴリズム部分の詳細は後で説明します。

page split アルゴリズムは、inserter が index が overfull (target ratio より高い tuple-to-bucket ratio である) ことを
observe したときに enter されます。
このアルゴリズムは、既存の 1 つの bucket を 2 つに split しようと試み、それによって fill ratio を下げます
(ただし、必ずしも成功するわけではありません):

    meta page を pin し、exclusive mode で buffer content lock を取得
    split がまだ必要かを check
    split が必要なくなった場合、buffer content lock と pin を drop して exit
    どの bucket を split するかを decide
    その bucket に cleanup lock を取得しようとする。失敗したら諦める
    その bucket がまだ split 中であるか split-cleanup work がある場合:
       split と cleanup work を finish しようと試みる
       成功した場合は start over する。失敗した場合は諦める
    old と new bucket に split が in progress であることを示すマークを付ける
    old と new bucket の両方を dirty としてマーク
    split のための new page の allocation に対する WAL を write
    new bucket に属する tuple を old bucket から copy し、
     それらを moved-by-split としてマーク
    new page が full になるか old bucket のすべての page が finish したら、
    new page への tuple の移動の WAL record を write
    old bucket の primary bucket page について、lock を release (ただし pin は release しない)、
     next page を read/shared-lock する。必要に応じて繰り返す
    bucket-being-split と bucket-being-populated flag をクリア
    old bucket に split-cleanup を示すマークを付ける
    old と new bucket の両方の flag 変更のための WAL を write

split operation の old bucket number に対する cleanup-lock の acquire 試行は、他の process が
それに対していずれかの lock や pin を保持している場合は fail する可能性があります。これが発生した場合、
metapage の exclusive-lock を保持したまま wait したくないので、wait したくありません。
したがって、これは conditional LWLockAcquire operation であり、
fail した場合は単に split の試みを abandon します。これで問題ありません。なぜなら、
index は overfull ですが完全に functional だからです。subsequent なすべての inserter が
split しようとし、最終的にいずれか 1 つが成功します。複数の inserter が split に失敗した場合、
index は依然として overfull の可能性がありますが、最終的に index は
overfull でなくなり、split の試みは止まります。 (成功した splitter が index がまだ overfull かを
loop で check することもできますが、後続の insertion に split のオーバーヘッドを分散させるほうが
良いように思えます。)

split が途中で fail した場合 (例えば、ディスク容量不足や中断のため)、
index は corrupt しません。代わりに、new tuple を insert する前に old bucket に tuple が insert されるたびに
split を retry し、最終的には成功するはずです。
split が unfinished のままになっているという事実は、subsequent な bucket の split を妨げませんが、
前の split が finish するまでその bucket を再度 split しようとはしません。言い換えると、
bucket はある程度の時間、split の途中にあることができますが、
同時に 2 つの split の途中にあることはできません。

4 つ目の operation は garbage collection (bulk deletion) です:

    next bucket := 0
    metapage を pin し、exclusive mode で buffer content lock を取得
    current max bucket number を fetch
    meta page の buffer content lock と pin を release
    while next bucket <= max bucket do
    	primary bucket page に cleanup lock を acquire
    	loop:
    		tuple を scan して remove
    		target page を dirty としてマーク
    		target page から tuple を deleting する WAL を write
    		これが最後の bucket page ならループから抜ける
    		next page を pin して x-lock する
    		prior lock と pin を release (primary bucket page の pin は保持)
    	lock している page が primary bucket page でない場合:
    		lock を release し、primary bucket page に exclusive lock を取得
    	primary bucket page に他の pin がない場合:
    		free space を remove するため bucket を squeeze する
    	primary bucket page の pin を release
    	next bucket ++
    end loop
    metapage を pin し、exclusive mode で buffer content lock を取得
    bucket の数が変化したかを check
    変化した場合、content lock と pin を release して for-each-bucket loop に return
    そうでない場合、metapage の tuple count を update
    meta page を dirty としてマークし、metapage の update のための WAL を write
    buffer content lock と pin を release

これは concurrent split と scan を許可するように設計されていることに注意してください。split が
発生した場合、new bucket に relocate された tuple は scan によって 2 回 visit されますが、
それは害がありません。下記の "Interlocking Between Scans and VACUUM" も参照してください。

VACUUM operation によって report される statistics には注意しなければなりません。
私たちができることは、scan された tuple の数を count することであり、保存されている tuple count と bucket の数が
scan 中のいかなる時点でも変化しなかった場合、これを保存されている tuple count より優先します。これは、
保存されている tuple count が何らかの理由で out of sync になった場合にそれを correct する方法を提供します。しかし、
split または insertion が concurrent に発生した場合、scan count は untrustworthy です。代わりに、delete された tuple 数を
保存されている tuple count から引いた値を使用します。

## Interlocking Between Scans and VACUUM

bucket の cleanup scan 中に bucket page の lock を release するため、
concurrent scan が私たちが vacuum を finish する前にその bucket で start される可能性があります。
scan が cleanup を追い越した場合、次の問題が発生する可能性があります: (1)
scan が VACUUM によって process される前に削除されようとしている heap TID を見る、(2)
scan がそれらの TID の 1 つ以上が dead であると decide する、(3)
VACUUM が complete する、(4) scan が dead と decide した TID の 1 つ以上が
unrelated な tuple のために reuse される、そして最後に (5) scan が wake up して
誤って new tuple を kill する。

これには VACUUM と scan が same bucket 内で同時に active である必要があることに注意してください。
VACUUM が scan 開始前に complete した場合、scan が dead tuple を見る機会はありません。
scan が VACUUM 開始前に complete した場合、その間に heap TID が reuse されることはありません。さらに、VACUUM は
active scan を持つ bucket では start できません。なぜなら、scan は primary bucket page に対する pin を
保持しており、VACUUM は cleanup を begin するためにその page の cleanup lock を取得しなければならないからです。
したがって、この問題が発生する唯一の方法は、VACUUM が bucket の cleanup lock を release した後、
しかし bucket 全体を process する前に scan が start し、cleanup operation を overtake することです。

現在、lock chaining を使ってこれを防いでいます: cleanup は、process したばかりの
page の lock と pin を release する前に、chain 内の next page を lock します。

## Free Space Management

(Question: なぜこんなに複雑なのですか? metapage に list head を持つ free page の
linked list にすればいいのでは? いずれにせよ、これですべて metapage の修正が必要であることに
変わりはありません。)

free space management は 2 つの sub-algorithm で構成されます。1 つは bucket chain に追加する
overflow page を reserve するためのもので、もう 1 つは empty な overflow page を
free pool に return するためのものです。

overflow page の取得:

    metapage content lock を exclusive mode で take
    next bitmap page number を determine。なければループから exit
    meta page content lock を release
    bitmap page を pin し、exclusive mode で content lock を take
    free page (bitmap 内の zero bit) を search
    見つかった場合:
    	bitmap に bit を set
    	bitmap page を dirty としてマーク
    	metapage の buffer content lock を exclusive mode で take
    	first-free-bit value が変わっていなければ、
    		それを update して meta page を dirty としてマーク
    そうでなければ (not found):
    bitmap page の buffer content lock を release
    next bitmap page があればループバックして try する

-- ここですべての bitmap page を check 完了後、meta excl. lock を保持
別の overflow page を追加するため index を extend。meta information を update
meta page を dirty としてマーク
page number を return

metapage lock を multiple times release して re-acquire するのは少し annoying ですが、
ちょうど index に enter しようとしている process に対する concurrency の loss を minimize する
ためにこのように行うのが best のようです。bitmap page を read in している間
metapage exclusive lock を保持したくありません。
(少なくともここで buffer pin/unpin の repeat は avoid できます。)

index を extend する normal path では、metapage lock を保持しながら I/O を行う必要は
ありません。extension に new bitmap page と required overflow page の両方を
追加する必要があるときには I/O を行う必要がありますが ... それは infrequent case なので、
concurrency の loss は acceptable のようです。

上記の subroutine を呼び出す tuple insertion の portion は次のようになります:

    -- target bucket に空き領域がないと determine した後:
    bucket の last page を remember しておき、そこに対する write lock を drop
    bucket の last page を re-write-lock
    もはや last でない場合、last page に step
    上記で説明した free-page-acquire (obtaining an overflow page) メカニズムを
      execute
    (former) last page を new page を指すように update し、buffer を dirty としてマーク
    new page を write-lock して initialize し、former last page への back link を設定
    overflow page の addition のための WAL を write
    free-page-acquire アルゴリズムで取得した meta page と bitmap page の
      lock を release
    former last page の lock を release
    new overflow page の lock を release
    new page に tuple を insert
    -- など

これは 2 つの concurrent inserter が同じ bucket を extend しようとするケースを handle することに注意してください。
それらは valid ではあるがおそらく space-inefficient な configuration に終わります: 2 つの overflow page が
bucket に追加され、それぞれ 1 つの tuple を含みます。

この最後の部分は 2 つの page に対して concurrent に write lock を保持するという rule に違反していますが、
previously free な page を write-lock するのは okay なはずです。それに対する lock を保持している
他の process は存在し得ないからです。

bucket splitting は、new bucket を extend する必要がある場合、similar な algorithm を使用しますが、
new bucket に対する exclusive mode で buffer content lock を保持しているため、
concurrent extension について worry する必要はありません。

overflow page を free するには、process が containing bucket に対する exclusive mode で
buffer content lock を保持する必要があるため、bucket 内の page の他の accessor を
worry する必要はありません。アルゴリズム:

    bucket chain から overflow page を delink
    (これは fore と aft sibling の read/update/write/release を必要とする)
    meta page を pin し、shared mode で buffer content lock を take
    page の free space bit を含む bitmap page を determine
    meta page buffer content lock を release
    bitmap page を pin し、exclusive mode で buffer content lock を take
    meta page buffer content lock を exclusive mode で retake
    free されている overflow page に属する tuple を move (insert)
    bitmap bit を update
    bitmap page を dirty としてマーク
    page number がまだ first-free-bit より小さい場合、
    	first-free-bit field を update し、meta page を dirty としてマーク
    overflow page を delinking する operation のための WAL を write
    buffer content lock と pin を release
    meta page buffer content lock と pin を release

このようにしなければならないのは、first-free-bit field (hashm_firstfree) を変更する前に
bitmap bit を clear しなければならないからです。first-free-bit を too small に set する可能性が
ありますが (なぜなら、誰かがすでに free したばかりの page を reuse したかもしれないため)、それは
okay です。唯一の cost は、next overflow page acquirer が必要以上に多くの bitmap
bit を scan することです。avoid しなければならないのは、first-free-bit が actual first free bit
より greater になることです。なぜなら、そうなるとその free page が searcher によって決して
見つけられなくなるからです。

delinking しているときに overflow page から tuple を move する理由は、
それを atomic operation にするためです。そうしないと、standby 上で spurious read につながる
可能性があります。基本的に、user が same tuple を 2 回見るかもしれません。

## WAL Considerations

create index、insert、delete、bucket split、allocate overflow page、squeeze
などの hash index operation 自体は、crash 後の hash index の
consistency を guarantee しません。robustness を提供するため、これらの operation それぞれに対して WAL を write します。

CREATE INDEX は複数の WAL record を write します。最初に、metapage の initialization を cover する record を write し、
次に新しく作成された各 bucket に対して 1 つずつ、最後に initial bitmap page に対して 1 つを write します。
index creation が atomic に見える必要はありません。なぜなら、index はまだ
他の transaction から見えず、creating transaction は
crash 発生時に roll back するからです。いずれにせよ、operation 全体を single の
write-ahead log record で cover することは difficult です。なぜなら、現在の XLog machinery では、
XLR_MAX_BLOCK_ID (32) で与えられる fixed number の page のみ log を取れるからです。

通常の item insertion (page split を強制せず、new overflow page を必要としないもの) は single の
WAL entry です。これらは single bucket page と metapage に touch します。metapage は
original operation 中に update されるのと同じように、replay 中に update されます。

insertion が overflow page の addition を引き起こす場合、new overflow page のために 1 つの
WAL entry と、insert 自体のために second entry が存在します。

insertion が bucket split を引き起こす場合、insert 自体のために 1 つの WAL entry、続いて new bucket の
allocating のための WAL entry、続いて new bucket の各 overflow bucket page
(old bucket から tuple が移動されたもの) に対する WAL entry、続いて old bucket と new bucket の両方で
split が complete したことを示す WAL entry が存在します。operation を complete させるために
overflow page を必要とする split operation は、overflow page の new allocation ごとに WAL record を
write する必要があります。

splitting は複数の atomic action を伴うため、old bucket の bucket page から new bucket に
tuple を移動している間に system が crash する可能性があります。そのような場合、recovery 後、
old と new bucket はそれぞれ bucket-being-split と bucket-being-populated flag で
マークされ、これらの bucket で split が in progress であることを示します。reader
algorithm は、上記の reader algorithm section で説明したように、split が
in progress のときに old と new bucket の両方を scan するため、正しく動作します。

insert と split algorithm で説明したように、old bucket に対する next insert または split operation で
split を finish します。search 中にもそれを行うことができますが、本来 read-only な operation に
extra update を入れないほうが best であるように思えます (いずれにせよ hot standby
mode では update は不可能です)。VACUUM で split を complete するのは natural に思えますが、
bucket の splitting には new page の allocation が必要かもしれず、disk space が
不足した場合は fail する可能性があります。それは VACUUM 中には bad なことです - そもそも VACUUM を
running する理由が disk space 不足である可能性があり、そして今 VACUUM も disk space 不足のために
finish しません。対照的に、
insertion はいずれにせよ physical file の enlarging を必要とする場合があります。

bucket からの tuple の deletion は、2 つの理由で実行されます: dead tuple を remove する、および
bucket split によって move された tuple を remove する。各 bucket page に対して、tuple が remove されるたびに WAL entry が
作成され、その後、needs-split-cleanup flag を clear するときに別の WAL entry が作成されます。dead tuple が
remove される場合、metapage を update するために別の WAL entry が作成されます。

deletion は複数の atomic operation を伴うため、以下の場合に
system が crash する可能性が十分にあります: (a) いくつかの bucket page から tuple を removing した後、(b)
garbage flag を clearing する前、または (c) metapage を updating する前。system が (b) を completing する前に
crash した場合、recovery 後の next vacuum または insert 中に再度 bucket を clean しようとしますが、
これは多少の performance impact を与える可能性がありますが、fine に動作します。system が (c) を completing する前に crash した場合、
recovery 後、next vacuum が metapage を update するまで、いくつかの additional split が発生する可能性がありますが、
insert、delete、scan などの他の operation は correctly に動作します。replay 中に delete operation に基づいて
実際に metapage を update することで、この問題を fix できますが、
それが complication に worth するかどうかは clear ではありません。

squeeze operation は、chain 内の later の bucket の 1 つから、chain 内の earlier の bucket の 1 つに
tuple を move し、tuple を write している bucket が filled になるか、tuple を removing している bucket が
empty になるかのいずれかのときに WAL record を write します。

squeeze operation は複数の atomic operation の writing を伴うため、operation を entire bucket で
completing する前に system が crash する可能性が十分にあります。recovery 後、operation は
correctly に動作しますが、index は bloated なままになり、これは next vacuum が bucket を
completely に squeeze するまで read と insert operation の performance に impact を与える可能性があります。

## Other Notes

Clean up lock は、_another_ process が given bucket で stop している間に split が発生することを防ぎます。
また、私たち _自身の_ backend の scan の 1 つがその bucket で stop していないことも保証します。

src/backend/access/gin/README

# Gin for PostgreSQL

Gin は jfg://networks (http://www.jfg-networks.com/) によって支援されました。

Gin は Generalized Inverted Index の略であり、飲み物ではなく genie として捉えるべきものです。

Generalized とは、index がどの operation を高速化するのかを知らないことを意味します。
代わりに、特定の data type に対して定義された custom strategy によって動作します
(PostgreSQL ドキュメントの "Index Method Strategies" を参照)。その意味で、Gin は GiST に類似しており、
定義済みの comparison-based operation を持つ btree index とは異なります。

inverted index は (key, posting list) pair の集合を格納する index structure です。
ここで 'posting list' とは、その key が出現する heap row の集合です。
(text document は通常多数の key を含みます。) Gin index の主な目的は、
PostgreSQL における高い拡張性を持つ full-text search のサポートです。

Gin index は key value 上に構築された B-tree index から構成されます。
ここで各 key は indexed item のいずれかの要素 (array の要素、tsvector の lexeme など) であり、
leaf page の各 tuple は、item pointer 上の B-tree (posting tree) への pointer、
もしくは list が十分小さい場合は item pointer の単純な list (posting list) のいずれかを含みます。

注意: key (entry) tree には delete operation はありません。その理由は、私たちの経験では、
大規模な corpus 内の異なる word の集合は非常にゆっくりとしか変化しないためです。
これにより code と concurrency algorithm が大幅に簡素化されます。

Core PostgreSQL には、one-dimensional array (例: integer[], text[]) 用の組み込み Gin サポートが含まれています。
以下の operation が利用可能です。

- contains: value_array @> query_array
- overlaps: value_array && query_array
- is contained by: value_array <@ query_array

## Synopsis

=# create index txt_idx on aa using gin(a);

## Features

- Concurrency
- Write-Ahead Logging (WAL)。(crash からの recoverability。)
- User-defined opclass。(scheme は GiST に類似しています。)
- 最適化された index creation (maintenance_work_mem を活用して posting を memory に蓄積します。)
- opclass 経由の text search サポート
- GUC 変数 gin_fuzzy_search_limit を用いた、返却される result set の soft upper limit

## Gin Fuzzy Limit

full-text search が非常に大きな result set を返す状況はよくあります。disk から tuple を読み出して
sort するのは多くの時間を要する可能性があるため、これは production では受け入れられません。(search 自体は非常に
高速であることに注意してください。)

そのような query は通常非常に頻出する lexeme を含むため、結果はあまり有用ではありません。
そのような query の実行を容易にするため、Gin は返却される set のサイズに対する設定可能な
soft upper limit を持っており、これは 'gin_fuzzy_search_limit' GUC 変数によって決定されます。
default では 0 (制限なし) に設定されています。

非ゼロの search limit が設定されると、返却される set は全 result set の subset となり、
ランダムに選択されます。

"Soft" とは、実際の返却結果数が指定された limit と異なる可能性があることを意味します。
これは query と system の random number generator の品質に依存します。

経験上、'gin_fuzzy_search_limit' の値は数千 (例: 5000-20000) でうまく機能します。
これは 'gin_fuzzy_search_limit' が、この数より少ない tuple しか返さない query には
影響を与えないことを意味します。

## Index structure

GIN index が index 化する "items" は、ゼロまたはそれ以上の "keys" を含む複合値です。
たとえば、item は integer array であり、その場合 keys は個々の整数値となります。index は実際には
items そのものではなく、key value を格納および検索します。GIN opclass の pg_opclass entry において、
opcintype は items の data type であり、opckeytype は keys の data type です。GIN は、items が多くの keys
を含み、同じ key value が多くの異なる items に出現するケースに最適化されています。

GIN index は metapage、key entry の btree、そして場合によっては "posting tree" page から
構成されます。posting tree page は、key entry が btree page に収まりきらないほど多くの
heap tuple pointer を取得した場合の overflow を保持します。さらに、fast-update 機能が有効である場合、
main の btree にまだ merge されていない "pending" key entry を保持する "list pages" が存在することが
あります。list page は search 時に linear に scan する必要があるため、pending entry は多くなりすぎる前に
main の btree に merge される必要があります。pending list の利点は、数千 entry の bulk insertion が
retail insertion よりもはるかに高速になり得ることです。(この利点は主に、同じ key が複数の新規 heap tuple
に出現する場合に複数回の search/insertion を行わなくて済むことから来ます。)

key entry は名目上は他の index type で使用されるのと同じ IndexTuple format ですが、
leaf key entry は通常複数の heap tuple を参照するため、大きな違いがあります。
(GinFormTuple を参照してください。これは "normal" index tuple を構築してから modify することで動作します。)
知っておくべき point は以下のとおりです。

- single-column index では、key tuple は key datum のみを含みますが、multi-column index では、
  key tuple は (column number, key datum) の pair を含みます。column number は int2 として格納されます。
  これは異なる column で異なる key data type をサポートするために必要です。tuple のこの部分は、通常の規則に従って
  index_form_tuple によって構築されます。column number (存在する場合) は決して null になり得ませんが、
  key datum は null になる場合があり、その場合は通常どおり null bitmap が存在します。
  (index tuple の通常の動作として、null bitmap のサイズは INDEX_MAX_KEYS で固定されます。)

- key datum が null である場合 (すなわち、IndexTupleHasNulls() が true)、名目上の index data の直後
  (つまり offset IndexInfoFindDataOffset、または IndexInfoFindDataOffset + sizeof(int2)) に、
  null entry の "category" を示す byte があります。可能な category は以下のとおりです。
  1 = indexable item から抽出された通常の null key value
  2 = zero-key indexable item の placeholder
  3 = null indexable item の placeholder
  placeholder null entry が index に挿入されるのは、そうしなければ空または null の indexable item に対して
  index entry がまったく存在せず、full index scan ができなくなり、さまざまな corner case で誤った答えが
  出るためです。null entry の異なる category は btree によって区別される key として扱われますが、
  同じ category の null entry の heap itempointer は、通常の key entry と同様に、1 つの index entry に
  merge されます。

- btree leaf level の key entry では、次の SHORTALIGN boundary に圧縮 format (Posting List Compression
  section を参照) の item pointer の list があり、これは当該 key を含む indexable items に対応する
  heap tuple を指します。これは "posting list" と呼ばれます。

list が index page に収まるには大きすぎる場合、ItemPointer は別の posting page に押し出され、
key entry 自体には現れません。これら別 page は "posting tree" と呼ばれます (後述参照)。
いずれの場合も、key に関連付けられた ItemPointer を sort 順で簡単に読み出せることに注意してください。
これは scan algorithm が依存している性質です。

- leaf key entry の index tuple header field は、以下のように転用されています。

1. Posting list の場合:

- ItemPointerGetBlockNumber(&itup->t_tid) は、index tuple の先頭から posting list までの offset を含みます。
  Access macro: GinGetPostingOffset(itup) / GinSetPostingOffset(itup,n)

- ItemPointerGetOffsetNumber(&itup->t_tid) は、posting list 内の要素数 (heap itempointer の数) を含みます。
  Access macro: GinGetNPosting(itup) / GinSetNPosting(itup,n)

- IndexTupleHasNulls(itup) が true である場合、null category byte は
  GinGetNullCategory(itup,gs) / GinSetNullCategory(itup,gs,c) で access/set できます。

- posting list は GinGetPosting(itup) で access できます。

- GinItupIsCompressed(itup) の場合、posting list は圧縮 format で格納されます。それ以外の場合は単に
  ItemPointer の array です。新規 tuple は常に圧縮 format で格納されますが、database が 9.3 以前の version
  から migrate された場合は uncompressed item が存在する可能性があります。

2. Posting tree の場合:

- ItemPointerGetBlockNumber(&itup->t_tid) は、posting tree の root の index block number を含みます。
  Access macro: GinGetPostingTree(itup) / GinSetPostingTree(itup, blkno)

- ItemPointerGetOffsetNumber(&itup->t_tid) は magic number GIN_TREE_POSTING を含み、
  これによって posting-list の場合と区別されます (この値は十分に大きいため、それほど多くの
  heap itempointer が 1 つの index page に収まることは不可能です)。この値は GinSetPostingTree macro に
  よって自動的に挿入されます。

- IndexTupleHasNulls(itup) が true である場合、null category byte は
  GinGetNullCategory(itup,gs) / GinSetNullCategory(itup,gs,c) で access/set できます。

- posting list は存在せず、access してはなりません。

どちらの場合に該当するかを判別するには、macro GinIsPostingTree(itup) を使用します。

どちらの場合も、itup->t_info & INDEX_SIZE_MASK は tuple の実際の合計 size を含み、INDEX_VAR_MASK と
INDEX_NULL_MASK bit は index_form_tuple によって設定される通常の意味を持ちます。

btree の non-leaf level の index tuple は、上記の optional な column number、key datum、
null category byte を含みます。posting list は含みません。ItemPointerGetBlockNumber(&itup->t_tid) は
次の下位 btree level への downlink であり、ItemPointerGetOffsetNumber(&itup->t_tid) は
InvalidOffsetNumber です。downlink の取得/設定には access macro GinGetDownlink/GinSetDownlink を使用します。

"pending list" page に出現する index entry も少し異なる動作をします。optional な column number、key datum、
null category byte は他の GIN index entry と同様です。ただし、pending entry には常にちょうど 1 つの
heap itempointer が関連付けられており、non-GIN index と同様に t*tid header field に格納されます。
posting list はありません。さらに、pending list を search する code は、特定の heap tuple に関するすべての
entry が pending list 内で連続して出現し、column-number-plus-key-datum で sort されていることを前提と
しています。GIN_LIST_FULLROW page flag bit は、特定の heap tuple の entry が複数の pending-list page に
またがって分散されているかどうかを示します。GIN_LIST_FULLROW が set されている場合、page は 1 つ以上の
heap tuple のすべての entry を含みます。GIN_LIST_FULLROW が clear されている場合、page は 1 つの heap tuple の
entry のみを含み、*かつ\_ その tuple のすべての entry ではありません。(したがって、entry が 1 つの
pending-list page にすべて収まらない heap tuple は、たとえ前の page の大部分の空間とその tuple の最後の
page が無駄になるとしても、それらの page を単独で使用しなければなりません。)

GIN は、downlink と pivot key を internal page tuple に、nbtree とは異なる方法で pack します。
Lehman & Yao は以下のように定義しています。

P*0, K_1, P_1, K_2, P_2, ... , K_n, P_n, K*{n+1}

ここで P*i は downlink であり、K_i は key です。K_i は P*{i-1} と P*i (0 <= i <= n) の間の key space を分割します。
K*{n+1} は high key です。

internal page tuple では key と downlink が group 化されています。nbtree は key と downlink を
以下のように tuple に pack します。

(K\_{n+1}, None), (-Inf, P_0), (K_1, P_1), ... , (K_n, P_n)

ここで tuple は括弧で示されています。したがって、highkey は別途格納されます。P_i は K_i と group 化されます。
P_0 は -Inf key と group 化されます。

GIN は key と downlink を異なる方法で tuple に pack します。

(P*0, K_1), (P_1, K_2), ... , (P_n, K*{n+1})

P*i は K*{i+1} と group 化されます。-Inf key は不要です。

K\_{n+1} key に関して、いくつか追加の注意点があります。

1. entry tree の最右 page において、P_n と組み合わされた key は実際には重要ではありません。
   Highkey は infinity とみなされます。
2. posting tree において、P_n と組み合わされた key は常に重要ではありません。non-rightmost page の highkey は
   別途格納され、GinDataPageGetRightBound() を介して access されます。

## Posting tree

posting list が key entry 内に inline で格納するには大きすぎる場合、posting tree が作成されます。
posting tree は B-tree structure であり、ItemPointer が key として使用されます。

internal posting tree page は標準の PageHeader と他の GIN page と同じ "opaque" struct を使用しますが、
通常の index tuple は含みません。代わりに、page の内容は PostingItem struct の array です。
各 PostingItem は child page の block number と、ItemPointer としてのその child page の right bound から
構成されます。page の right bound は page header の直後、PostingItem array の前に格納されます。

posting tree leaf page も標準の PageHeader と opaque struct を使用し、page の right bound は page header の
直後に格納されますが、page の内容は複数の compressed posting list から構成されます。
compressed posting list は、page header と pd_lower の間で次々に格納されます。pd_lower と pd_upper の間の
space は未使用であり、これによって posting tree leaf page の full-page image が中間の未使用 space を
skip できます (XLogRecData の buffer_std = true)。

item pointer は、1 つの大きな compressed posting list ではなく、複数の独立した compressed posting list
(segment とも呼ばれる) に格納されます。これは、特定の item pointer への random access を高速化するためです。
compressed list 内の item を見つけるには、list を先頭から読まなければなりませんが、item が複数の list に
分割されている場合は、まず探している item を含む list まで skip して、その segment のみを読むことができます。
また、update は影響を受ける segment のみを再 encode すれば済みます。

## Posting List Compression

1 つの page にできるだけ多くの item pointer を収めるため、posting tree leaf page および entry tree leaf
tuple に inline で格納される posting list は、軽量な圧縮 form を使用します。item pointer が sort 順で格納
されているという事実を利用します。各 item pointer の block と offset number を別々に格納する代わりに、
前の item からの差分を格納します。それ自体ではあまり効果はありませんが、これにより varbyte encoding と
呼ばれる手法を使用して圧縮できます。

varbyte encoding は integer を encode する方法であり、より小さい数値はより大きい数値の cost で少ない space を
使用できます。各 integer は可変 byte 数で表現されます。varbyte encoding における各 byte の high bit は、
次の byte がまだこの数値の一部であるかどうかを決定します。したがって、単一の varbyte encode された数値を
読むには、high bit が set されていない byte を見つけるまで byte を読まなければなりません。

encode 時、item pointer を形成する block と offset number は単一の integer に統合されます。
offset number は下位 11 bit に格納され (ginpostinglist.c の MaxHeapTuplesPerPageBits を参照)、block number は
上位 bit に格納されます。これは合計 43 bit を必要とし、最大 6 byte に都合よく収まります。

compressed posting list は GinPostingList struct 内で受け渡しおよび disk への格納が行われます。list の
最初の item は通常の ItemPointerData として uncompressed で格納され、続いて byte 単位の list 長、続いて
packed item が格納されます。

## Concurrency

entry tree および各 posting tree は B-tree であり、同じ level の sibling page を接続する right-link を
持ちます。これは通常の B-tree indexam (Lehman & Yao によって考案) で使用されているのと同じ構造ですが、
GIN tree の backward scan はサポートしていないため、left-link は必要ありません。entry tree leaf は
専用の high key を持たず、代わりに最大の leaf tuple が high key として機能します。これは entry tree から
tuple が削除されることがないため機能します。

entry および posting tree を operate するための algorithm は以下で検討されます。

### Locating the leaf page

read を実行するために GIN btree で leaf page を search する際、root page から leaf まで downlink を
たどって降下します。一度に 1 つの page に対して pin と shared lock を取得します。したがって、次の page の
pin と shared lock を取得する前に、前の page の pin と shared lock を解放します。

下の図は、leaf page を見つけた後の tree の状態を示しています。小文字は tree page を示します。
'S' は page に対する shared lock を示します。

               a
           /   |   \
       b       c       d
     / | \     | \     | \

eS f g h i j k

### Steping right

concurrent page split は key space を右へ移動させるため、downlink をたどった後、探している key を実際に含む
page は、降りた page の右側のどこかにあるかもしれません。その場合、探している page を見つけるまで
right-link をたどります。

stepping right 中は、現在の page から pin と shared lock を解放する前に、right sibling の pin と shared lock を
取得します。この機構は、delete されている page へ step することを防ぐために設計されました。私たちは
そこを指す rightlink に lock を保持しながら right sibling へ step します。したがって、誰も rightlink を
並行して更新せず、それに従って right sibling を delete しないことが保証されます。

下の図は、stepping right 中に同時に lock された 2 つの page を示しています。

               a
           /   |   \
       b       c       d
     / | \     | \     | \

eS fS g h i j k

### Insert

insertion 用の適切な leaf を見つける際にも、root から leaf へ降下し、一度に 1 つの page を shared lock
します。ただし、insertion 中は root および internal page の pin を解放しません。これにより、並行 split に
よって parent が変更されないことを前提として、downlink insertion 用の buffer hash table への lookup を
節約できる可能性があります。leaf に到達したら、page を exclusive mode で再 lock します。

下の図は、exclusive mode で lock され insertion 準備が整った leaf page を示しています。'P' と 'E' はそれぞれ
pin と exclusive lock を示します。

               aP
           /   |   \
       b       cP      d
     / | \     | \     | \

e f g hE i j k

insert が page split を引き起こす場合、left child の lock を解除する前に parent が exclusive mode で lock
されます。したがって、insertion algorithm は child から始めて parent と child の page の両方を同時に
exclusive lock できます。

下の図は、leaf page split 後の tree の状態を示しています。'q' は split によって生成された新しい page です。
parent 'c' は downlink を挿入されようとしています。

                  aP
            /     |   \
       b          cE      d
     / | \      / | \     | \

e f g hE q i j k

### Page deletion

Vacuum は entry tree から tuple や page を delete することは決してありません。Vacuum は rightlink によって
logical order で entry tree leaf を traverse し、posting list から deletable TID を除去します。
posting tree は entry tree leaf からの link によって処理されます。これらは 2 段階で vacuum 処理されます。
第 1 段階では、deletable TID が leaf から除去されます。第 1 段階で少なくとも 1 つの empty page が検出された
場合、第 2 段階で ginScanPostingTreeToDelete() が empty page を delete します。

ginScanPostingTreeToDelete() は depth-first 方式で tree 全体を traverse します。これは tree root に対する
full cleanup lock から始まります。この lock は、page を delete している間、この tree へのすべての concurrent
insertion を防ぎます。ただし、私たちが lock する前に root を traverse した in-progress reader がまだ存在する
可能性があります。

下の図は、page deletion algorithm が tree の leftmost leaf まで traverse した後の tree の状態を示しています。

               aE
           /   |   \
       bE      c       d
     / | \     | \     | \

eE f g h i j k

deletion algorithm は、現在調査中の path を構成する page の left sibling に対して exclusive lock を保持します。
したがって、現在の page が remove される場合、downlink と rightlink の両方を remove するために必要なすべての
page がすでに lock されています。これにより、並行する stepping right と deadlock を起こす可能性のある、
潜在的な right から left への page lock order を回避します。

page deletion と並行する search は、delete される page への pointer をすでに読み取っており、それをたどろうと
している可能性があります。page には、left sibling の right-link 経由、または parent の downlink 経由で
到達できます。

backend が right-link 経由で deleted page に到達することを防ぐため、stepping right algorithm は
right page の lock が取得されるまで現在の page の lock を解放しません。

downlink はより tricky です。tree を descending する search は、child を lock する前に parent page の lock を
解放する必要があり、そうしないと child page の concurrent split で deadlock する可能性があります。page split は
child page の lock を保持しながら parent を lock します。したがって、deleted page はすぐには reclaim できません。
代わりに、この page を reference しようと待っているかもしれないすべての transaction が終了するまで待たなければ
なりません。対応する process は、page が deleted と mark されていることを認識し、それに応じて recover する必要が
あります。

下の図は、page deletion algorithm が tree をさらに traverse した後の tree の状態を示しています。現在調査中の
path は 'a-c-h' です。'c' と 'h' の left sibling である 'b' と 'g' もそれぞれ exclusive lock されています。

               aE
           /   |   \
       bE      cE      d
     / | \     | \     | \

e f gE hE i j k

次の図は、page 'h' が delete された後の tree の状態を示しています。'deleted' flag と、それを訪問する可能性のある
最新の xid で mark されています。'c' から 'h' への downlink も delete されています。

               aE
           /   |   \
       bE      cE      d
     / | \       \     | \

e f gE hD iE j k

ただし、concurrent reader が delete 前に 'c' から 'h' への downlink を見ていた可能性は依然としてあります。
その場合、その reader は 'h' から right へ step して、deleted されていない page が見つかるまで進みます。
page 'h' の Xid-marking は、そのようなすべての reader がいなくなるまで、この page が reuse されないことを
保証します。次に調査する leaf page は 'i' です。'g' は 'i' の left sibling となるため、lock されたままです。

次の図は、'i' および 'c' が delete された後の tree の状態を示しています。internal page 'c' は、downlink が
なくなったために delete されました。調査中の path は 'a-d-j' です。page 'b' と 'g' は 'd' と 'j' の self sibling
として lock されています。

               aE
           /       \
       bE      cD      dE
     / | \             | \

e f gE hD iD jE k

standby での page deletion の replay 中、page の left sibling、target page、およびその parent が、その順序で
lock されます。この order は、concurrent read との deadlock がないことを保証します。

## Predicate Locking

GIN は、serializable snapshot isolation のための predicate locking をサポートします。
predicate lock は、scan が value の範囲を scan したことを表現します。これらは物理的な page そのものではなく、
論理的な key value に関心があります。page に対する predicate lock は、現在そこに一致する tuple が存在するか
どうかに関係なく、その page に属するべき key range を cover します。言い換えれば、index page に対する
predicate lock は index tuple 間の "gap" を cover します。false positive を最小化するため、predicate lock は
可能な限り最も細かい level で取得されます。

- B-tree index と同様に、すべての insertion は leaf level で発生するため、leaf page のみを lock すれば
  十分です。

- equality search (すなわち、partial match search ではない) において、key entry が posting tree を持つ場合、
  その key entry のみに対する lock を表すために、posting tree の root page を lock します。それ以外の場合は、
  entry tree page を lock します。match が見つからない場合も、entry が存在したであろう "gap" を lock するために、
  entry tree page を lock します。

- partial match search では、value 間の "gap" を表現するために、posting tree root に対する lock に加えて、
  scan するすべての entry leaf page を lock します。

- entry leaf page および posting tree root に対する lock に加えて、すべての scan は metapage に対する
  lock を取得します。これは fast update pending list への insertion と interlock するためです。pending list
  への insertion は実際には tree のどこにでも属する可能性があり、metapage に対する lock はそれを表現します。

fastupdate pending list の interlock は、fastupdate=on の場合、実質的に常に full-index lock を取得することを
意味するため、多くの false positive が発生する可能性があります。

## Compatibility

TID の圧縮は 9.4 で導入されました。9.3 以前の version からの pg_upgrade のため、一部の GIN index は
uncompressed format のままになる可能性があります。互換性のため、古い uncompressed format も
サポートされています。それを扱うために以下の rule が使用されます。

- GIN_ITUP_COMPRESSED flag は、posting list を含む index tuple を mark します。
  この flag は ItemPointerGetBlockNumber(&itup->t_tid) の high bit に格納されます。
  flag を確認するには GinItupIsCompressed(itup) を使用します。

- 新しい format の posting tree page は GIN_COMPRESSED flag で mark されます。
  この flag の確認と設定には macro GinPageIsCompressed(page) と GinPageSetCompressed(page) を使用します。

- すべての scan operation は posting list の format を確認し、対応する code を使用してその内容を読み取ります。

- uncompressed posting list を含む index tuple を update する際、それは compressed list を含む新しい
  index tuple に置き換えられます。

- uncompressed posting tree leaf page を update する際、それは圧縮されます。

- vacuum が uncompressed posting list 内に dead TID を見つけた場合、それらは compressed posting list に
  変換されます。これは、compressed posting list が uncompressed list が占有する space に収まることを前提と
  しています。すなわち、dead item を除去した page の compressed version は、古い uncompressed version より
  少ない space を占めると仮定します。

## Limitations

- Gin は scan->kill_prior_tuple および scan->ignore_killed_tuples を使用しません。
- Gin は equality matching、または "partial match" 機能を使用した単純な range matching のみで、entry を search
  します。

## TODO

Nearest future:

- より多くの type に対する opclass (programming 不要、catalog 変更のみ多数)

Distant future:

- entry の B-tree を GiST のようなものに置き換える

## Authors

Original work は Teodor Sigaev (teodor@sigaev.ru) と Oleg Bartunov
(oleg@sai.msu.su) によって行われました。

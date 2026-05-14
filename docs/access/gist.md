src/backend/access/gist/README

# GiST Indexing

このディレクトリは、Postgres における GiST indexing の実装を含みます。

GiST は Generalized Search Tree の略です。これは独創的な論文
"Generalized Search Trees for Database Systems", 1995, Joseph M. Hellerstein,
Jeffrey F. Naughton, Avi Pfeffer によって導入されました。

    http://www.sai.msu.su/~megera/postgres/gist/papers/gist.ps

Concurrency サポートは "Concurrency and Recovery in Generalized
Search Trees", 1997, Marcel Kornacker, C. Mohan, Joseph M. Hellerstein に記述されています。

    https://dsf.berkeley.edu/papers/sigmod97-gist.pdf

GiST は PostgreSQL の初期 version で J. Hellerstein と P. Aoki によって実装されました
(詳細は Berkeley の The GiST Indexing Project から入手可能です
http://gist.cs.berkeley.edu/)。"university" project として、機能数が限られており、ほとんど使用されていませんでした。

GiST の現在の実装は以下をサポートします。

- 可変長 key
- 複合 key (multi-key)
- ordered search (nearest-neighbor search)
- GiST core への NULL-safe interface の提供
- Concurrency
- WAL logging による recovery サポート
- Buffering build algorithm
- Sorted build method

PostgreSQL に実装された concurrency のサポートは、Marcel Kornacker の論文
"Access Methods for Next-Generation Database Systems" に基づいて開発されました。

    http://www.sai.msu.su/~megera/postgres/gist/papers/concurrency/access-methods-for-next-generation.pdf.gz

GiST の Buffering build algorithm は、Lars Arge, Klaus Hinrichs, Jan Vahrenhold
および Jeffrey Scott Vitter による論文 "Efficient Bulk Operations on Dynamic R-trees" に基づいて開発されました。

    http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.135.9894&rep=rep1&type=pdf

original algorithm は以下のいくつかの方法で modify されました。

- PostgreSQL の convention に適合させる必要がありました。たとえば、SEARCH algorithm は大幅に変更されました。
  これは PostgreSQL では search function がすべての tuple を一度に返すのではなく、1 つの tuple (next) を返す必要が
  あるためです。また、call 間で page lock を解放する必要があります。
- 可変長 key のサポートを追加したため、split 後に page 上のすべての key に対して十分な free space を保証することは
  できません。user-defined function picksplit は、tuple の size に関する情報を持ちません
  (multicolumn index のように各 tuple が複数の key を含む可能性があり、picksplit は 1 つの key のみで
  動作する可能性があります) し、page についても情報を持ちません。
- performance 上の理由から、original の INSERT algorithm を modify しました。特に、現在は single-pass
  algorithm です。
- 論文は theoretical だったため、いくつかの詳細が省略されており、特定の問題の解決方法を私たち自身で
  見つけ出さなければなりませんでした。
- 上記の 1997 年の論文 (1995 年のものではない) は、leaf page には original の key を格納すべきだと述べています。
  PostgreSQL でもそうすることは可能ですが、leaf page で compressed representation を使用することも可能です。

上記の理由により、GiST core と PostgreSQL WAL system の相互作用を改訂しました。さらに、論文では触れられていなかった、
crash 後の recovery 時の uncompleted insertion の問題に遭遇 (そして解決) しました。

## Search Algorithm

search code は unvisited item の queue を保持します。ここで "item" とは、search 条件を満たすことが
判明している heap tuple、または parent page の downlink item の検査によって search 条件と一致すると判定された
index page のいずれかです。最初に root page が search され、その中の unvisited item が見つけられます。
その後、queue から item を pull します。heap tuple pointer は即座に返され、index page entry は
その page の search を引き起こし、さらに queue entry を生成します。

queue は、heap tuple item が先頭にあり、続いて index page entry があり、新たに追加された
index page entry は既存の index page entry の前に挿入される順序で保持されます。
これにより index の depth-first traversal が保証され、特に最初のいくつかの heap tuple が可能な限り早く返されます。
これは、わずかな tuple しか必要としない LIMIT がある場合に役立ちます。

nearest-neighbor search を実装するため、queue entry は distance data で拡張されます。heap tuple entry は
search 引数からの正確な distance で label 付けされ、index-page entry はその child のいずれかが持ち得る
最小 distance で label 付けされる必要があります。その後、queue entry は smallest-distance-first の order で
取得され、distance が同一の entry は前の paragraph で述べたとおりに管理されます。

search algorithm は、entry を scan して search 条件を満たすものを queue に入れる間だけ index page を
lock します。search と並行して insertion が発生する可能性があるため、(parent page を visit 中に)
index child page の queue entry を作成してから実際に child page に到達して scan するまでの間に、child page が
split される可能性があります。right sibling に移動した entry を見逃さないようにするため、child page の
NSN (node sequence number、特殊用途の LSN) を、visit 時に parent が持っていた LSN と比較することで split が
発生したかどうかを検出します。発生していた場合、sibling page は即座に queue の先頭に追加され、その item が
元の child page にあった場合と同じ順序で scan されることが保証されます。

Postgres では通常そうであるように、search algorithm は scan 開始前に存在していた index entry の
発見のみを保証します。scan 中に追加された index entry は visit される場合とそうでない場合があります。
これは、すべての search が MVCC snapshot rule を使用して scan 開始時より新しい heap tuple を reject する
限り問題ありません。特にこれは、parent page の downlink key を見た後にそれが "enlarge" されるケースを
心配する必要がないことを意味します。そのような enlargement は、いずれにせよ私たちが返すことに関心のない
child item を追加するだけです。

## Insert Algorithm

INSERT は GiST tree が balance を保つことを保証します。user-defined key method Penalty は insert 先の
subtree を選択するために使用されます。method PickSplit は node splitting algorithm に使用されます。
method Union は tree の properties を維持するために変更を上方へ伝播するために使用されます。

tuple を insert するには、まず insert 先の適切な leaf page を見つける必要があります。algorithm は root から
始めて、最小の Penalty の path に沿って tree を降下します。各 step で:

1. この page は parent を見てから split されたか? もしそうなら、代わりに他の half に insert すべき可能性が
   あるため、parent に戻ります。
2. これが leaf node であれば、target node が見つかりました。
3. それ以外の場合、Penalty を使用して新しい target subtree を選択します。
4. target subtree を表す key を確認します。insert する key をまだ cover していない場合、それを古い downlink
   key と insert する key の Union で置き換えます。(実際には常に Union を呼び出し、Union された key が既存の key と
   同じである場合に置き換えを skip するだけです。)
5. step 4 で key を置き換えると、page が split される可能性があります。その場合、変更を上方に伝播し、
   split が不要だった最初の parent から algorithm を再開します。
6. target subtree へ降下し、1 に戻ります。

これは original の論文の insertion algorithm とは異なります。original の論文では、まず leaf page に到達するまで
tree を降下し、その後 parent の downlink を調整し、最悪の場合 root まで調整を伝播させます。しかし、私たちは
降下する際にすでに新しい key を cover するよう downlink を調整するため、leaf page に到達したときに、
page を split しなければならない場合に downlink を insert することを除いて、parent を update する必要は
もうありません。これにより crash recovery が簡素化されます。page に key を insert した後、parent を update
する必要なく、tree は即座に self-consistent を保ちます。page を split し、parent へ downlink を insert する前に
crash したとしても、split の右半分は (元の page を置き換えた) left page の rightlink 経由で access 可能で
あるため、tree は self-consistent を保ちます。

新しい key 用に downlink を調整する際に internal page が split される必要がある場合、algorithm は leaf page に
到達する前に tree を上下に歩き回ることがあることに注意してください。最終的に底に到達し、新しい tuple の
insertion を続行します。

insert 先の target page を見つけたら、新しい tuple 用の room があるかを確認します。あれば、tuple が insert され、
完了です。もし収まらない場合は、page を split する必要があります。key の長さが異なる場合、または一度に複数の
key が insert される場合 (下位 level で複数の page に split された結果の downlink を insert する場合に発生する
可能性があります)、page が 2 つ以上の page に split される必要がある可能性があることに注意してください。
page を split した後、parent page を update する必要があります。新しい page の downlink を insert する必要があり、
split の左半分となった古い page の downlink は、left page に残った tuple のみを cover するように update する
必要があります。parent への downlink の insertion は再び page split を引き起こす可能性があり、最悪の場合
root page まで recurse します。

gistplacetopage は insertion の 1 step を実行する workhorse function です。tuple が収まれば、指定された page に
insert します。そうでなければ page を split し、split された page 用の新しい downlink tuple を構築します。
caller はその後、parent page で gistplacetopage() を呼び出して downlink tuple を insert する必要があります。
child への downlink を保持する parent page は、parent の concurrent split の結果として移動している可能性が
あるため、parent page を見つけるには gistFindCorrectParent() が使用されます。

root page の split は若干異なる動作をします。root split では、gistplacetopage() が新しい child page を
allocate し、古い root page を新しい child への downlink を含む新しい root で置き換えますが、これらすべてを
1 つの operation で行います。

findPath は findParent の subroutine で、parent level で rightlink をたどっても正しい parent page が見つからない
場合に使用されます。

findPath( stack item )
push stack, [root, 0, 0] // page, LSN, parent
while( stack )
ptr = top of stack
latch( ptr->page, S-mode )
if ( ptr->parent->page->lsn < ptr->page->nsn )
push stack, [ ptr->page->rightlink, 0, ptr->parent ]
end
for( each tuple on page )
if ( tuple->pagepointer == item->page )
return stack
else
add to stack at the end [tuple->pagepointer,0, ptr]
end
end
unlatch( ptr->page )
pop stack
end

gistFindCorrectParent は、insertion 時に page の parent を re-find するために使用されます。page split のために
tree を降下した後、right に移動している可能性があります。

findParent( stack item )
parent = item->parent
if ( parent->page->lsn != parent->lsn )
while(true)
search parent tuple on parent->page, if found the return
rightlink = parent->page->rightlink
unlatch( parent->page )
if ( rightlink is incorrect )
break loop
end
parent->page = rightlink
latch( parent->page, X-mode )
end
newstack = findPath( item->parent )
replace part of stack to new one
latch( parent->page, X-mode )
return findParent( item )
end

pageSplit function は、page split 後に key を新しい page にどのように分配するかを決定します。

pageSplit(page, allkeys)
(lkeys, rkeys) = pickSplit( allkeys )
if ( page is root )
lpage = new page
else
lpage = page
rpage = new page
if ( no space left on rpage )
newkeys = pageSplit( rpage, rkeys )
else
push newkeys, union(rkeys)
end
if ( no space left on lpage )
push newkeys, pageSplit( lpage, lkeys )
else
push newkeys, union(lkeys)
end
return newkeys

## Concurrency control

経験則として、複数の page に同時に lock を保持する必要がある場合、lock は以下の順序で取得する必要があります。
parent より child が先、同じ level では左から右へ。常に同じ順序で lock を取得することで deadlock を回避します。

search algorithm は一度に 1 つの page のみを参照し lock します。その結果、search と page split の間に
race condition があります。page split は 2 つの phase で発生します: 1. page が split される 2. downlink が
parent に insert される。それらの step の間、downlink が insert される前に search が parent page を参照した場合、
それでも左半分の rightlink をたどることで新しい右半分を見つけます。ただし、parent で downlink を見た場合は
rightlink をたどってはなりません。さもないと page が 2 回 visit されてしまいます!

split は最初に left page に F_FOLLOW_RIGHT flag を mark します。scan がその flag が set されているのを見たら、
right page に downlink が欠落していることを認識し、それも visit すべきです。split が downlink を parent に
insert したとき、child の F_FOLLOW_RIGHT flag を clear し、child page header の NSN field を parent への
insertion の LSN と一致するように設定します。F_FOLLOW_RIGHT flag が set されていなければ、scan は child の NSN と、
parent で見た LSN を比較します。child の NSN が parent で見た LSN より大きい場合、scan は downlink が
insert される前に parent page を見たことになるため、rightlink をたどる必要があります。それ以外の場合、scan は
parent page で downlink を見たため、通常どおりそれをたどります/たどったでしょう。

scan は通常、F_FOLLOW_RIGHT flag が set された page を見ることはできません。page split は、downlink が
parent に insert され flag が再び clear されるまで、child page の lock を保持するためです。しかし、page split の
途中で downlink が parent に insert される前に crash が発生すると、tree 内に F_FOLLOW_RIGHT を持つ page が
残ります。scan はこれを問題なく処理しますが、performance 上の理由から最終的にはそれを修正したくなります。
そしてより重要なのは、parent に欠落している downlink pointer を持つ page の処理が、insertion algorithm を
複雑にすることです。そのため、insertion が F_FOLLOW_RIGHT が set された page を見ると、即座に parent に
downlink を追加して、途中で crash した split を完了させようとします。

## Buffering build algorithm

buffering index build algorithm では、一部またはすべての internal node に buffer が付随しています。
tuple が top で insert される際、tree の descent は buffer に到達するとすぐに停止し、tuple は buffer に push
されます。buffer がいっぱいになりすぎると、その中のすべての tuple が下位 level に flush され、そこで再び
下位 level の buffer または leaf page に到達します。これにより、insertion が depth-first 順序ではなく
breadth-first 順序に近い形で発生し、必要な random I/O 量が大幅に削減されます。

この algorithm では、level は leaf page が level 0 となり、internal node level は 1 から増加するように
番号付けされます。この番号付けにより、root page が split されても page の level number が変わらないことが
保証されます。

Level Tree

3 _
/ \
2 _ _
/ | \ / | \
1 _ \* \* \* \* \*
/ \ / \ / \ / \ / \ / \
0 o o o o o o o o o o o o

-    - internal page
       o - leaf page

特定の level に属する internal page には buffer が associate されています。leaf page には buffer がありません。
どの level に buffer があるかは "level step" parameter によって制御されます。level_step の倍数の level number
には buffer があり、それ以外にはありません。たとえば、level_step = 2 の場合、level 2、4、6、... の page に
buffer があります。level_step = 1 の場合、すべての internal page に buffer があります。

Level Tree (level_step = 1) Tree (level_step = 2)

3 \* _
/ \ / \
2 _(b) _(b) _(b) _(b)
/ | \ / | \ / | \ / | \
1 _(b) _(b) _(b) _(b) _(b) _(b) _ \* \* \* \* \*
/ \ / \ / \ / \ / \ / \ / \ / \ / \ / \ / \ / \
0 o o o o o o o o o o o o o o o o o o o o o o o o

(b) - buffer

logical には、buffer は単なる tuple の集まりです。physical には、temporary file に backed された page に
分割されます。各 buffer は 2 つの state のいずれかになり得ます:
a) buffer の最後の page が main memory に保持されています。node buffer は、新しい index tuple が追加されたとき、
または tuple が削除されたときに自動的にこの state に切り替わります。
b) buffer のすべての page が disk に swap out されます。buffer がいっぱいになりすぎて flush を開始するとき、
他のすべての buffer はこの state に切り替わります。

index tuple が insert されると、その initial 処理は以下のいずれかの地点で終了する可能性があります。

1. leaf page。index の depth が <= level_step の場合、つまり internal page のいずれにも buffer が
   associate されていない場合。
2. buffer を持つ最上位 level page の buffer。

最上位の buffered level の buffer のいずれかが half-full になるまで、新しい index tuple が処理されます。
buffer が half-full になると、それは emptying queue に追加され、新しい tuple が処理される前に empty にされます。

buffer emptying process は、buffer からの index tuple が下位 level の buffer または leaf page に move される
ことを意味します。まず、memory を解放するために他のすべての buffer が disk に swap されます。次に、tuple が
buffer から 1 つずつ pop され、buffered node の下の次の buffer または leaf page へと tree を cascade down します。

buffer を empty にすることには、empty にされる buffer と、その下の次の buffered または leaf level の間のすべての
intermediate page が cache されるという興味深い動的特性があります。node の下にもう buffer がない場合、tuple が
最終的に着地する leaf page も cache されます。もしある場合、下の各 buffer の最後の buffer page が memory に
保持されます。これは以下の図で示されています:

Buffer being emptied to
lower-level buffers Buffer being emptied to leaf pages

               +(fb)                                 +(fb)
            /     \                                /     \
        +             +                        +             +
      /   \         /   \                    /   \         /   \
    *(ab)   *(ab) *(ab)   *(ab)            x       x     x       x

-    - cached internal page
       x - cached leaf page

*    - non-cached internal page
       (fb) - buffer being emptied
       (ab) - buffers being appended to, with last page in memory

index build の開始時、level-step は 1 つの buffer を empty にする際に involve するすべての page が cache に
収まるように選択されるため、それらの各 page が一度 access されて cache された後は、buffer を empty にする際に
それ以上 I/O は発生しません。この locality こそが、buffering algorithm の高速化の源泉です。

1 つの buffer を empty にすると、下位 level の buffer のいくつかが満たされ、それらも emptying を引き起こします。
buffer がいっぱいになりすぎるたびに、emptying queue に追加され、現在の buffer が処理された後に empty にされます。

最悪の場合でも各 buffer の size を制限するため、buffer が half-full になるとすぐに buffer emptying が schedule
され、nominal buffer size の 1/2 相当の tuple が empty にされるまで emptying が続きます。これにより、buffer
emptying が開始されるとき、すべての下位 level buffer が最大でも half-full しか満たされていないことが保証されます。
すべての tuple が同じ下位 level buffer に cascade される最悪の場合、その buffer は上位 level buffer から empty
された tuple をすべて accommodate するのに十分な space を持つことになります。ただし、使用される data structure の
どれにも hard size limit はないため、これは approximate である必要があるだけです。一部の buffer の小さな
overfilling は問題ありません。

buffer が associate された internal page が split されると、buffer も split される必要があります。buffer 内の
すべての tuple が走査され、各 tuple がどの buffer に行くべきかを決定するために penalty function を使用して、
正しい sibling buffer に再配置されます。

heap からのすべての tuple が処理された後も、まだ buffer 内にいくつかの index tuple が残っています。
この時点で、final buffer emptying が開始されます。すべての buffer が top-down 順序で empty にされます。
page split のために emptying 中に新しい buffer が allocate される可能性があるという事実によって、これは若干
複雑になります。ただし、新しい buffer は常にまだ完全に empty にされていない buffer の sibling になります。
tuple は tree 内で上向きに move することはありません。final emptying は、特定の level のすべての buffer が
empty になるまでその level の buffer を loop し、その後次の level へ move します。

## Sorted build method

すべての input tuple を sort し、sort された順序で GiST leaf page に pack し、進行に応じて downlink と
internal page を作成します。この方法は、B-tree index の build 方法と同様に、ボトムアップで index を build します。

sorted method は、すべての column の operator class に "sortsupport" が定義されている場合に使用されます。
それ以外の場合、optional で buffering を使用して 1 つずつ tuple を insert する方法に fallback します。

Sort GiST build には、sort opclass の良好な linearization が必要です。これは multidimensional data では
常に当てはまるとは限りません。anomaly を解決するため、index tuple を buffer し、multidimensional-aware な
picksplit function を apply します。

## Bulk delete algorithm (VACUUM)

VACUUM は 2 段階で動作します:

第 1 段階では、index 全体を physical order で scan します。concurrent page split によって移動された dead tuple を
見逃さないようにするため、各 page の F_FOLLOW_RIGHT flag と NSN を確認し、page が concurrent に split された
かどうかを検出します。concurrent page split が検出され、page の一方の half がすでに scan した position に
移動されている場合、page を再度 scan するために "後方ジャンプ" します。これは B-tree VACUUM が使用するのと
同じ機構ですが、search 時の page split を検出するためにすでに page に NSN を持っているため、B-tree のような
"vacuum cycle ID" の概念は必要ありません。

すべての page を scan する間に、完全に empty な leaf page にも注意します。scan 後にそれらを tree から
unlink しようとします。empty page の unlink 時にその parent を locate するために必要となるため、すべての
internal page の block number も記録します。

empty な leaf page の space を再利用できるように、それらを tree から unlink しようとします。empty な page を
delete するためには、その downlink を parent から remove しなければなりません。第 1 段階で記憶した block number
を持つすべての internal page を scan し、empty であると記憶した page への downlink を探します。見つけるたびに、
parent と child page に lock を取得し、child page がまだ empty であることを再確認します。その後、downlink を
remove し、child を deleted として mark し、lock を解放します。

internal page が完全に empty になると、insertion algorithm は混乱します。そのため、internal page の最後の child は、
たとえ empty であっても決して delete しません。現在のところ、leaf page の delete のみをサポートしています。

この page deletion algorithm は best-effort ベースで動作します。第 1 段階の後に concurrent page split で
downlink が移動された場合、それを見つけられない可能性があります。その場合、すべての empty page を remove する
ことはできません。それは問題ありません。頻繁に発生することは想定されておらず、うまくいけば次の VACUUM が
clean up します。

page を delete した後、in-progress search がその page をまだ descend する可能性があります。それは私たちが
remove する前に downlink を見ていたためです。search はそれが deleted されていることを認識して ignore しますが、
それが発生する可能性がある限り、page を reuse できません。in-progress search を "wait out" するため、page が
delete されると、現在の next-transaction counter 値で label 付けされます。その XID が誰にも visible でなくなる
まで、page は recycle されません。これは必要以上に conservative ですが、シンプルに保ちましょう。

Authors:
Teodor Sigaev <teodor@sigaev.ru>
Oleg Bartunov <oleg@sai.msu.su>

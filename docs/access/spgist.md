src/backend/access/spgist/README

SP-GiST は space-partitioned GiST の略です。これは、quadtree、k-d tree、radix tree (trie) などの
space-partitioned な data structure を実装するための汎用的な infrastructure を提供します。
これらの structure は、main memory で実装される場合、通常は pointer で
link された動的に割り当てられた node の集合として設計されます。これは disk への
直接的な格納には適していません。pointer の chain が非常に長くなり、disk access が
多すぎるからです。対照的に、disk based な data structure は I/O を最小化するために高い
fanout を持つべきです。課題は、search algorithm が多数の node を traverse したとしても、
少数の disk page のみに access するように、tree node を disk page に map することです。

COMMON STRUCTURE DESCRIPTION

論理的には、SP-GiST tree は tuple の集合であり、各 tuple は inner tuple または
leaf tuple のいずれかになります。各 inner tuple には "node" が含まれ、これは
(label, pointer) の pair で、pointer (ItemPointerData) は別の inner tuple、または
leaf tuple の list の head を指す pointer です。inner tuple は異なる数の node (children) を持つことが
できます。branch は異なる depth を持つことができ (実際、balancing を support する制御や
code はありません)、これは tree が non-balanced であることを意味します。ただし、leaf tuple と
inner tuple は同じ level で混在することはできません: inner tuple の node からの downlink は、
1 つの inner tuple か、leaf tuple の list のいずれかにつながります。

SP-GiST core は、inner tuple と leaf tuple が single index page に収まることを要求し、
さらに厳密には、single inner-tuple node から到達される leaf tuple の list がすべて same index page に
格納されることを要求します。(そのような list が page を cross しないように制限することで、
seek を減らし、list の link を simple な 2-byte OffsetNumber として格納できます。)
そのため、SP-GiST index opclass は、1 つの inner tuple に必要な node 数があまりに多くならず、
inner-tuple prefix と leaf-node datum 値があまりに大きくならないようにする必要があります。

inner tuple と leaf tuple は別々に格納されます: 前者は "inner" page にのみ格納され、
後者は "leaf" page にのみ格納されます。また、root page には特別な制限があります。
index の初期段階で、data がまだ 1 page 分しかないとき、root page は organize されていない
leaf tuple の集合を含みます。最初の page split が発生した後、root には厳密に 1 つの
inner tuple が含まれる必要があります。

search traversal algorithm が inner tuple に到達したとき、tree traverse を depth 方向に続行するための node の
集合を選びます。leaf page に到達した場合、leaf tuple の list を scan して query に
match するものを見つけます。SP-GiST はまた、ordered (nearest-neighbor) search も support します - つまり、
scan 中に pending node が priority queue に置かれ、closest-first model で traversal が行われます。

insertion algorithm は同様に tree を descend しますが、各 inner tuple から descend する 1 つの node を
選択しなければなりません。insertion はまた、descend する前に inner tuple を modify する必要があるかもしれません:
新しい node を追加する場合や、insert する値に match できる less-specific な prefix を得るために
tuple を "split" する場合があります。新しい leaf tuple を list に append する必要があり、
page に free space がない場合、SP-GiST は新しい inner tuple を作成し、leaf tuple を、おそらく
複数の page 上の一連の list に分配します。

inner tuple は以下から構成されます:

optional な prefix value - すべての successor はこれと consistent でなければなりません。
Example:
radix tree - prefix value は共通の prefix string
quad tree - centroid
k-d tree - 1 つの coordinate

node の list、ここで node は (label, pointer) の pair です。
label の例: radix tree では single character

leaf tuple は以下から構成されます:

leaf value
Example:
radix tree - string の残り (postfix)
quad および k-d tree - point そのもの

対応する heap tuple への ItemPointer
leaf page の chain 内の次の leaf tuple の nextOffset 番号

optional な nulls bitmask
optional な INCLUDE-column 値

v14 以前の index との互換性のため、leaf tuple は (leaf value および INCLUDE 値の中に)
null 値があり、_かつ_ 少なくとも 1 つの INCLUDE column がある場合にのみ、nulls bitmask を持ちます。
leaf value の null-ness は、tuple が "nulls page" (下記参照) 上にあるかどうかから推測できる
ため、明示的に表現する必要はありません。しかし、INCLUDE 値とともに使用される bitmask に
含めることで、standard tuple deconstruction code を使用できるようにします。

NULLS HANDLING

SPGiST-indexable な operator は strict である (null 入力に対して決して succeed しない) と仮定します。
whole-table の indexscan を可能にし、"x IS NULL" を SPGiST indexscan で実装できる
ようにするため、null を index 化することはやはり望ましいです。しかし、SPGiST index
opclass が null に cope する必要がないことを望みます。そのため、SPGiST index の main tree
には null entry は含まれません。null entry は、別の SPGiST tree に格納され、これは別の
page の集合 (特に、独自の root page) を占めます。nulls tree での insertion と search は、opclass-supplied な
function を使用せず、normal tree の AllTheSame ケースに匹敵する hardwired な logic を使用するだけです。

INSERTION ALGORITHM

insertion algorithm は、tree を常に consistent な state に保つように設計されています。簡略化された insertion
algorithm の specification を以下に示します (数字は下の note を指します):

Start with the first tuple on the root page (1)

loop:
if (page is leaf) then
if (enough space)
insert on page and exit (5)
else (7)
call PickSplitFn() (2)
end if
else
switch (chooseFn())
case MatchNode - descend through selected node
case AddNode - add node and then retry chooseFn (3, 6)
case SplitTuple - split inner tuple to prefix and postfix, then
retry chooseFn with the prefix tuple (4, 6)
end if

Notes:

(1) 最初は、leaf tuple を root page に単純に書き込み、page が一杯になるまで続けます。
その後、それを split します。root が leaf page でなくなると、root 上の free space を可能な限り
大きく保つために、1 つの inner tuple しか持つことができません。これらの両方の rule は、
root での PickSplit をできるだけ長く遅延することを目的としており、search space の最上位の
partitioning を簡単に作れる限り良いものにします。

(2) 現在の実装では、新しい leaf tuple の list が 1 page に収まる場合、picksplit と
新しい leaf tuple の insert を 1 つの operation で行うことができます。これは、quad tree や k-d tree のような
node が小さな tree では常に可能ですが、radix tree では別の picksplit が必要になることがあります。

(3) node の追加は、inner tuple が page に収まる十分小さなサイズに保たなければなりません。
追加後、inner tuple は page 上の他の tuple のために current page に格納するには大きすぎる
場合があります。この場合、別の inner page に move されます (page management に関する note を参照してください)。
tuple を別の page に move する際、page 上の他の tuple の番号を変更することはできません。
そうでなければ、それらへの downlink pointer が invalid になってしまいます。これを防ぐために、
SP-GiST は "placeholder" tuple を残します。これは、別の tuple が page に追加されるときに
後で reuse できます。Concurrency および Vacuum セクションも参照してください。現在のところ、
radix tree のみが tuple に node を追加できます。quad tree と k-d tree は、PickSplitFn() の call で
すべての可能な node を一度に作成します。

(4) prefix value は新しい値と部分的にしか match しないことがあるので、SplitTuple action は
current tree branch を upper と lower の section に break することを許可します。別の言い方をすれば、
current inner tuple を "prefix" と "postfix" の part に split でき、prefix part が incoming する新しい値に
match できるようになります。radix tree への insertion の例を考えてみましょう。次の表記を使用します。
tuple の id はあくまでも議論のためのものです (実際にはそのような id は格納されません):

inner tuple: {tuple id}(prefix string)[ comma separated list of node labels ]
leaf tuple: {tuple id}<value>

string 'www.gogo.com' を inner tuple

    {1}(www.google.com/)[a, i]

に insert する必要があるとします。string は prefix に match しないので、descend できません。
inner tuple を 2 つの tuple に split しなければなりません:

    {2}(www.go)[o]  - prefix tuple
                |
                {3}(gle.com/)[a,i] - postfix tuple

loop の次の iteration で、'www.gogo.com' が prefix には match するがどの node label にも
match しないことが分かるので、tuple {2} に node [g] を追加します:

                   NIL (no child exists yet)
                   |
    {2}(www.go)[o, g]
                |
                {3}(gle.com/)[a,i]

これで [g] node を通って descend でき、これにより target string を単に 'o.com' に update します。
最後に、その string を持つ leaf tuple を insert します:

                  {4}<o.com>
                   |
    {2}(www.go)[o, g]
                |
                {3}(gle.com/)[a,i]

ご覧のように、元の tuple の node array は変更されずに postfix tuple に move します。SP-GiST core は
prefix tuple が old inner tuple より大きくないと仮定することにも注意してください。これにより、
prefix tuple を old inner tuple の場所に直接格納することができます。SP-GiST core は可能であれば
postfix tuple を same page に格納しようとしますが、十分な free space がない場合は別の page を
使用します (note 5 と 6 を参照してください)。現在、quad tree と k-d tree はこの feature を使用しません。
任意の新しい値と prefix が "inconsistent" であるという概念がないためです。これらは
PickSplitFn() の call によってのみ depth を増します。

(5) parent の node からの pointer が NIL pointer である場合、algorithm は格納する leaf page を
選択します。最初に、disk space をより活用するために、最大の free space を持つ last-used な
leaf page (各 backend で track しています) を使用しようとします。それが十分に大きくない
場合、algorithm は新しい page を allocate します。

(6) inner page の management は、(5) で説明した leaf page の management とよく似ています。

(7) 実際、現在の実装では、list が十分に短い場合、leaf tuple の list 全体と新しい tuple を
別の page に move できます。これは space utilization を向上させますが、algorithm の basis は変えません。

CONCURRENCY

tree を descend するとき、insertion algorithm は一度に 2 つの tree level に対して exclusive lock を保持します。
つまり、parent page と child page の両方です (ただし、parent page と child page は同じである可能性があり、
上記の note を参照してください)。異なる branch に cross-referenced page がある場合、2 つの insertion 間で
deadlock が発生する可能性があります。つまり、page M 上の inner tuple が page N 上の child を持ち、
他の branch の別の inner tuple が page N 上にあり page M 上の child を持つ場合、2 つの branch を
descend する 2 つの insertion は deadlock する可能性があります。各々は parent page の lock を保持しながら
child page の lock を取得しようとするからです。

現在、tree を descend する際に buffer を conditionally に lock することでこれに対処しています。buffer の
lock を取得できない場合、両方の buffer を release し、insertion process を restart します。これは潜在的に
非効率ですが、より deterministic な approach の locking cost は非常に高いように見えます。

このような事態が発生するケースの数を減らすために、page の "triple parity" という概念を導入します。
BlockNumber N の page 上に inner tuple がある場合、その child tuple は same page、または BlockNumber M
が (N+1) mod 3 == M mod 3 の page に配置すべきです。この rule は、page M 上の tuple が
page N 上に child を持たないことを保証します。なぜなら (M+1) mod 3 != N mod 3 だからです。
これにより、2 つの insertion process が tree を descend している間に互いに conflict する可能性が低くなります。
ただし、これは完全ではありません: 第一に、3 つ以上の insertion process 間で deadlock が発生する
可能性は依然としてあり、第二に、inner tuple を expand または split するすべてのケースでこの invariant を
保持することは非現実的です。そのため、依然として deadlock を許容する必要があります。

insertion はまた、descend した page に十分な room がない場合に、正しい type の tuple を追加するために
追加の inner page および/または leaf page の lock を取得する必要があるかもしれません。ただし、
そのような追加先がどの page であるかは正確には気にしないので、追加 buffer を conditionally に
lock することで deadlock を回避できます: 追加 page の lock を取得できない場合、別の page を
試すだけです。

search traversal algorithm はかなり伝統的です。各 non-leaf level で、page に対する share-lock を取得し、
current inner tuple 内のどの node を visit する必要があるかを特定し、それらの address を後で examine する
page の stack に置きます。次の stack item を visit する前に current buffer の lock を release します。
そのため、一度に 1 page のみが lock され、deadlock は発生し得ません。しかしその代わり、
race condition について心配する必要があります: pointed-to page に到達するまでに、concurrent な insertion が
target の inner tuple (または leaf tuple chain) を別の場所に配置された data に置き換えた
かもしれません。これを処理するために、insertion algorithm が inner tuple 内の nonempty な downlink を
変更する場合は常に、link が以前に導いていた lower-level の inner tuple または leaf-tuple chain の
head の場所に "redirect tuple" を置きます。Scan (ただし insertion は除く) はそのような redirect を
honor するように準備されていなければなりません。すでに parent level を visit していた scan だけが
そのような redirect tuple に到達する可能性があるため、すべての active な transaction が
system から flush out された後に redirect を remove できます。

DEAD TUPLES

leaf page 上の tuple は、4 つの state のいずれかになることができます:

SPGIST_LIVE: 通常の、heap tuple への live な pointer。

SPGIST_REDIRECT: index 内の別の場所への link を含む placeholder。leaf tuple の
chain を別の page に move する必要がある場合、redirect tuple が chain の head tuple の
場所に insert されます。これが発生すると parent inner tuple の downlink が update されますが、concurrent な scan が
parent page から child page に "in flight" である可能性があります (child page を lock しようとする前に
parent page の lock を release するため)。redirect pointer は、そのような scan に行き先を伝える
役割を果たします。redirect pointer は、そのような concurrent scan が進行中である可能性が
ある間だけ必要です。最終的には、VACUUM によって PLACEHOLDER dead tuple に変換され、その後
replacement の candidate となります。そのような tuple (これは決して chain の一部であるべきではありません) を
見つけた search は、redirect tuple のことを忘れてすぐに他の場所に進むべきです。そのような tuple に
到達した insertion は error を raise すべきです。valid な downlink は決してそのような tuple を
指すべきではないからです。

SPGIST_DEAD: tuple は dead ですが、index のどこか他の inner tuple から来る link が
それを指しているため、page 上の別の offset に remove したり move したりすることはできません。
(そのような tuple は決して chain 内にありません。chain 内に残っている live が何もなければ、
chain は必要ないからです。) search はそのような entry を ignore すべきです。insertion action が
そのような tuple に到達した場合、(page に目的の新しい leaf tuple を保持する room があれば)
in-place で replace するか、または新しい leaf tuple を配置する場所への redirection pointer で
それを replace すべきです。

SPGIST_PLACEHOLDER: tuple は dead で、他からの link がないことが知られています。live tuple が
delete または move され、redirect pointer で replace されない場合、same page 上の後の tuple の
offset が変わらないようにするために、placeholder で replace されます。placeholder は
新しい tuple を page に add するときに自由に replace でき、また VACUUM は valid な tuple
offset の range の末尾にあるものを delete します。search と insertion の両方は、他からの link が
placeholder tuple に導く場合、complain すべきです。

root page が leaf でもある場合、そのすべての tuple は LIVE state であるべきです。link がなく
offset number を保持する必要もないので、他の state は必要ありません。

inner page 上の tuple は LIVE、REDIRECT、または PLACEHOLDER state になることができます。
REDIRECT state は leaf page と同じ機能を持ち、inner tuple が別の page に move された後、concurrent search を
彼らが行く必要のある場所に送ります。期限切れの REDIRECT pointer は VACUUM によって
PLACEHOLDER status に変換され、その後 replacement の candidate となります。VACUUM は unused な inner tuple を
remove しようとしないため、現在 DEAD state は可能ではありません。

VACUUM

VACUUM (より正確には spgbulkdelete) は index 全体に対して single sequential scan を実行します。
leaf page と inner page の両方で、古い REDIRECT tuple を PLACEHOLDER status に変換し、その後
page の末尾にある PLACEHOLDER (live tuple の offset を保持するために必要ない) を
remove できます。leaf page では、heap TID が vacuum target TID と match するために delete する
必要がある tuple を scan します。

chain の head ではない deletable な tuple を見つけた場合、それを単に PLACEHOLDER で replace し、
chain から remove するために chain link を update できます。chain の head にあるが、chain 内に
少なくとも 1 つの live tuple が残っている場合、その live tuple を head tuple の offset に move し、
他の tuple の offset を保持するためにそれを PLACEHOLDER で replace します。これにより、
parent inner tuple の downlink は valid に保たれます。chain 内のすべての live tuple を delete している
ことが分かった場合、head tuple を DEAD tuple で replace し、残りを PLACEHOLDER で replace します。
こうして、parent inner tuple の downlink は DEAD tuple を指し、前のセクションで説明した rule が
すべてを動作させ続けます。

VACUUM はどの tuple が chain の head であるかを a-priori には知りませんが、nextOffset link の reverse map で
ある predecessor array を構築することで、簡単にそれを把握できます (つまり、
tuple x が tuple y に link しているのを見ると、predecessor[y] = x を設定します)。そして
head tuple は、predecessor を持たないものです。

VACUUM の実行中に insertion が発生する可能性があるため、純粋な sequential scan では、PickSplit や
MoveLeafs operation の結果として、まだ visit されていない leaf page から既に visit された leaf page に
tuple が move される可能性があるため、いくつかの target leaf tuple の delete を見逃す可能性が
あります。任意の target TID の delete に失敗することは acceptable ではないので、そのようなケースに
cope するために algorithm を拡張する必要があります。VACUUM scan が開始された後に作成された
可能性があることをその XID が示す leaf-page REDIRECT tuple を見たときに、そのような move が
発生した可能性があると認識します。redirection の target TID を、recheck する必要のある
場所の "pending list" に追加します。main sequential scan の page 間で、それぞれ list された TID を
visit することで pending list を空にします。それが (PickSplit からの) inner tuple を指していれば、
各 downlink TID を pending list に追加します。それが leaf page を指していれば、その page を
vacuum します。(指されている single chain だけを vacuum することもできましたが、page 全体を
vacuum することで code が簡略化され、VACUUM が same page を複数回 modify する必要がある odds が
減ります。) concurrent な index change に直面しても pending-list processing が決して endless loop に入らないように、
list entry をすぐに remove するのではなく、すべての pending-list processing を完了した後にだけ remove します。
代わりに、処理した後に item を done として mark するだけです。すでに list にある TID を追加するのは、
その item が done として mark されているかどうかにかかわらず、no-op です。

spgbulkdelete はまた、index の free space map も update します。

現在、spgbulkdelete が実行された場合、spgvacuumcleanup は何もすることがありません。
そうでなければ、redirection と placeholder を clean up し、free space map を update し、
statistics を gather するために、empty な target list で spgbulkdelete scan を実行します。

LAST USED PAGE MANAGEMENT

last used pages の list には 4 つの page が含まれます - leaf page 1 つと、
それぞれの "triple parity" group から 1 つずつの inner page 3 つです。(実際には、main tree 用に
1 つのそのような list があり、nulls tree 用に別のものがあります。) この list は call 間で
index meta page に保存されますが、WAL traffic を減らすために update は WAL-log されません。
meta page 上の incorrect data は critical ではありません。任意の moment に新しい page を allocate する
ことができるからです。

AUTHORS

    Teodor Sigaev <teodor@sigaev.ru>
    Oleg Bartunov <oleg@sai.msu.su>

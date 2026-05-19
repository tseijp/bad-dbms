src/backend/storage/freespace/README

## Free Space Map

Free space map の目的は、格納される tuple を保持するのに十分な free space を
持つ page を迅速に特定すること、あるいはそのような page が存在せず、relation を
1 page 拡張しなければならないと判断することです。PostgreSQL 8.4 から各 relation は、
relation の個別の「fork」に格納される独自の拡張可能な free space map を持っています。
これにより、以前の固定 size FSM の欠点が解消されます。

map を迅速に search できるようにするため、map を小さく保つことが重要です。
したがって、page の正確な free space を記録することは試みません。各 page に
1 map byte を割り当て、page の 1/256 の粒度で free space を記録できます。別の
言い方をすると、格納される値は free space を BLCKSZ/256 で割ったもの (切り捨て)
です。すべての page にいくらかの overhead があるため、free space は常に BLCKSZ
より小さくなければならないと仮定します。したがって、map 値の最大値は 255 です。

高速な search を支援するため、map は単に per-page entry の array ではなく、
それらの entry の上に tree 構造を持ちます。page の tree 構造と、各 page 内の
tree 構造があり、以下で説明します。

## FSM page 構造

各 FSM page 内では、leaf node が heap page (または下位 level の FSM page。下記の
「Higher-level structure」を参照) の free space の量を格納する binary tree 構造を
使用し、heap page ごとに 1 つの leaf node があります。non-leaf node は、その child の
いずれかの free space の最大量を格納します。

例:

    4

4 2
3 4 0 2 <- この level は heap page を表します

search と update の 2 つの基本操作が必要です。

X の量の free space を持つ page を search するには、n >= X となる path に沿って
tree を下に走査し、底に到達するまで続けます。node の両方の child が条件を満たす
場合、任意に 1 つを選べます。

page の free space の量を X に update するには、まず heap page に対応する leaf
node を update し、その後変更を上位 node に「bubble up」させます。各親まで歩いて、
その値を 2 つの child の最大値として再計算します。root に到達するか、値が変化
しない親に到達するまで繰り返します。

この data structure にはいくつかの良い特性があります:

- X bytes の free space を持つ page が存在しないことを発見するには、root node
  のみを見ればよい
- 選択肢があるときに search algorithm で走査する child を変えることで、与えられた
  page に近い page を優先したり、table 全体に負荷を分散したりするなど、さまざまな
  戦略を実装できます。

FSM page を使用する上位 level の routine は、fsm_set_avail() および
fsm_search_avail() 関数を通じて access します。これらの関数の interface は
page の内部 tree 構造を隠し、FSM page を free space 情報を格納するための一定数の
「slot」を持つ black box として扱います。(ただし、上位 routine は map 全体の
tree 構造を意識する必要があります。)

binary tree は各 FSM page に array として格納されます。page header が page 上の
いくらかの space を占めるため、binary tree は完全ではありません。つまり、いくつかの
右端の leaf node が欠けており、右側にいくつかの無駄な non-leaf node があります。
したがって、tree は次のような形になります:

       0

1 2
3 4 5 6
7 8 9 A B

ここで、数字は array 内の各 node の位置を表します。tree は leaf level より上では
完全であることが保証されており、leaf node のみが一部欠けていることに注意して
ください。これは、page あたりの使用可能な「slot」数が 2 のべき乗にぴったり等しく
ないことに反映されています。

FSM page にはまた、page 内で次に free space を search する場所を決定する
fp_next_slot という next slot pointer があります。その理由は、FSM search が
返す page を分散させるためです。複数の backend が同時に relation に insert する
とき、それらが異なる page に insert することで contention を回避できます。しかし、
OS の prefetching と batched write の利点を得るために、page を順番に埋めることも
望ましいです。FSM はそれを実現する責任があり、next slot pointer が望ましい動作を
提供するのに役立ちます。

## Higher-level structure

上記の data structure を単一 page を超えて scale up するために、page にわたって
類似の tree 構造を維持します。上位 level の page の leaf node は下位 level の
FSM page に対応します。各 page 内の root node は、その親 page の対応する leaf
node と同じ値を持ちます。

root page は常に物理 block 0 に格納されます。

例として、各 FSM page が 4 page に関する情報を保持できると仮定すると (実際には
(BLCKSZ - headers) / 2 を保持し、default の BLCKSZ では約 4000 になります)、
次のような disk layout になります:

0 <-- level 2 の page 0 (root page)
0 <-- level 1 の page 0
0 <-- level 0 の page 0
1 <-- level 0 の page 1
2 <-- ...
3
1 <-- level 1 の page 1
4
5
6
7
2
8
9
10
11
3
12
13
14
15

ここで、数字は _その level における_ page 番号で、0 から始まります。

leaf page n に対応する物理 block # を見つけるには、page n の前にある leaf page と
upper-level page の数を count する必要があります。これは

y = n + (n / F + 1) + (n / F^2 + 1) + ... + 1

となります。ここで F は fanout (上記の例では 4) です。最初の項 n は先行する
leaf page の数、2 番目の項は level 1 の page の数、というように続きます。

物事を単純に保つため、tree は常に一定の高さです。2^32-1 block の最大 relation
size を cover するには、default の BLCKSZ では 3 level で十分です
(4000^3 > 2^32)。

## Addressing

上位 level の routine は、以下から構成される「logical」address で動作します:

- level
- logical page number、および
- slot (該当する場合)

Bottom level の FSM page の level は 0、その上の level は 1、root は 2 です。
上の図のように、logical page number はその level での page number で、0 から
始まります。

## Locking

free space を search するために tree を下に走査するときは、一度に 1 page のみを
lock します: 親 page は child を lock する前に release されます。child page が
同時に変更され、たどり着いたときに child page にもう free space がない場合は、
最初からやり直す必要があります (無限 loop に陥らないよう、親 page を修正してから)。

search 時には shared buffer lock を使用しますが、page を update するときは
exclusive buffer lock を使用します。ただし、next slot search pointer は、shared
lock しか持っていなくても search 中に update されます。fp_next_slot は単なる hint
であり、破損しても簡単に reset できるため、exclusive locking の overhead を払う
よりも、そのタイプの risk を受け入れる方が良いように思われます。

## Recovery

FSM は明示的に WAL-logged されません。代わりに、可能性のある corruption を
repair するための一連の self-correcting 手段に依存します。

まず、FSM page に値が set されるたびに、変更の bubble up が完了した後に page の
root node が新しい値と比較されます。それは set された値以上であるべきで、そうで
なければ corrupted page があり、どこかの親が小さすぎる値を持っていることに
なります。次に、tree を下に走査する search 中に corrupted page を検出します。
その check は、親 node が大きすぎる値に set されている場合に気付きます。どちらの
場合も、page 上の upper node は直ちに rebuild され、その page に関する限り
corruption が修正されます。

VACUUM は、heap を進行する際に、対応する heap page の free space の正しい量で
すべての bottom-level の FSM page を update します。これは fsm_set_avail() を
通じて行われるため、これらの page の upper node は直ちに update されます。
定期的に、VACUUM は FreeSpaceMapVacuum[Range] を呼び出して、新しい free-space
情報を FSM tree の upper page に伝播します。

その結果、FSM に write するときは、これを hint として扱い、MarkBufferDirty() の
代わりに MarkBufferDirtyHint() を使用します。ここでのすべての read は
RBM_ZERO_ON_ERROR を使用して、checksum の不一致やその他の verification の失敗を
bypass します。MarkBufferDirtyHint() が提供する full page image なしでも正しく
動作しますが、それらは RBM_ZERO_ON_ERROR による slot 知識の損失の可能性を減らします。

Relation extension は WAL-logged されません。そのため、WAL replay 後、on-disk の
FSM slot は、disk に到達しなかった PageIsNew() block の free space を示す可能性が
あります。実際の relation size と比較することでこのケースを検出し、その場合は
block を full として mark します。

## TODO

- child が 1 つしかない upper node の走査を避ける fastroot
- 1 つの FSM page に収まる table のための別の system と、それが成長したときに
  本物に切り替える mechanism。

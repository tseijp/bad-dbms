src/backend/access/nbtree/README

# Btree Indexing

このディレクトリには、Lehman と Yao による高並行性 B-tree 管理アルゴリズム
(P. Lehman and S. Yao, Efficient Locking for Concurrent Operations on B-Trees,
ACM Transactions on Database Systems, Vol 6, No. 4, December 1981, pp 650-670)
の正しい実装が含まれている。また、Lanin と Shasha
(V. Lanin and D. Shasha, A Symmetric Concurrent B-Tree Algorithm,
Proceedings of 1986 Fall Joint Computer Conference, pp 380-389)
で説明されている deletion ロジックの簡略版も使用している。

## 基本的な Lehman & Yao アルゴリズム

古典的な B-tree と比較して、L&Y は各 page に右隣の page を指す right-link pointer を追加する。
また、各 page にその page で許可される key の上限である "high key" も追加する。
これら 2 つの追加により、並行的な page split を検出することが可能になり、
read lock を保持せずに tree を search できるようになる
(ただし、read 中の単一 page が変更されないようにするための lock は除く)。

search が child page への downlink を辿るとき、その page の high key を search key と比較する。
search key が high key より大きい場合、その page は並行的に split されたに違いなく、
探している key 範囲を含む新しい page を見つけるために right-link を辿る必要がある。
page が複数回 split されている場合、これを繰り返す必要があるかもしれない。

Lehman と Yao は、tuple や record ではなく、internal page 内の "separator" key と downlink が交互に配置されることについて言及している。
我々は、heap tuple を指さない、tree のナビゲーションにのみ使用される tuple を指すために
"pivot" tuple という用語を使用する。non-leaf page のすべての tuple と leaf page の high key は pivot tuple である。
pivot tuple は、各 page に属する key 空間のどの部分を表すかにのみ使用されるため、
しばらく前に削除され VACUUM によって kill された non-pivot tuple から copy された attribute 値を持つことができる。
pivot tuple は "separator" key と downlink を含むことも、
separator key のみを含むこと (すなわち、downlink 値は暗黙的に未定義)
もあれば、downlink のみを含むこと (すなわち、すべての attribute が truncate された) もある。

すべての btree key が一意であるという要件は、heap TID を tiebreaker attribute として扱うことで満たされる。
論理的な duplicate は heap TID の順序で sort される。これが必要なのは、Lehman と Yao が、
subtree S の key 範囲が Ki < v <= Ki+1 で記述されることを要求するからである。
ここで Ki と Ki+1 は parent page 内の隣接する key である (Ki は v より _厳密に_ 小さくなければならず、
これは確実に一意な key を持つことで保証される)。key は常にそのレベルで一意であるが、
leaf page の high key は例外で、page の最後の item と完全に等しい場合がある。

Postgres の suffix truncation の実装は、Lehman and Yao の不変条件が保たれることを保証しなければならず、
pivot tuple 内で欠落/truncate された attribute が "minus infinity" という sentinel 値を持つことを表現する。
後続の suffix truncation に関するセクションは、Lehman & Yao の不変条件が現実世界の例でどのように機能するかが
不明瞭な場合に役立つだろう。

## Lehman & Yao アルゴリズムとの違い

L&Y アルゴリズムを Postgres に組み込むために、以下の変更を行った:

Lehman と Yao は read lock を必要としないが、tree page の in-memory copy が共有されないことを前提としている。
Postgres は backend 間で in-memory buffer を共有する。
その結果、調査中に record が変更されないことを保証するために、btree page に対して page レベルの read lock を行う。
これは並行性を低下させるが、正しい動作を保証する。

順序付けされた index の "scan" の概念も、insertion、deletion、単純な lookup と同様に support する。
前方方向の scan は問題ない。L&Y がいずれにせよ必要とする right-sibling pointer を使うだけである。
(したがって、いったん scan の正しい開始点まで tree を下降すれば、scan は leaf page のみを見て、
より高い tree レベルを見ることはない。) 後方方向の scan を support するために、
"right sibling" と同様に "left sibling" link も保存する。(これは L&Y の split アルゴリズムに余分なステップを追加する:
split 中の page に対する write lock を保持している間、その以前の right sibling も lock して、
その page の left-link を更新する。これは安全である。なぜなら、その page の writer は、
我々の page に対する write lock を取得することに興味を持つはずがないからである。)
backwards scan には 1 つの追加の複雑さがある: left-link を辿った後、
left sibling page が read される前に split された可能性を考慮しなければならない。
そのため、来た元の page に right-link が一致する page が見つかるまで右に移動しなければならない。
(実際にはそれよりさらに難しい。下記の page deletion の説明を参照。)

Page の read lock は scan が page を調査している間だけ保持される。
lock/unlock の traffic を最小化するために、index scan は常に leaf page を search して
すべての一致する item を一度に識別し、それらの heap tuple ID を backend ローカルなストレージに copy する。
その後、heap tuple ID は index 内の page lock を保持せずに処理される。
状況によっては、並行 deletion から保護するために、leaf page に対する pin を保持し続ける (下記参照)。
この状態では、scan は事実上、pin された page の前または後の "page 間" で停止している。
これは並行的な insertion や、さらには page split が存在する場合でも安全である。
なぜなら、item は既存の page 境界を越えて移動されることはないからである --- そのため scan は、
見るべき item を見逃したり、誤って同じ item を 2 回返したりすることはない。
scan は scan 時の page の right-link を記憶しなければならない。それが右に移動する page だからである。
現在の right-link に右移動すると、page split によって移動された item を re-scan することになる。
scan が後方に移動するときに辿る left-link も記憶する
(ただし、これには left sibling の並行 split を考慮する追加処理が必要である。下記の詳細な move-left アルゴリズムを参照)。

ほとんどの場合、移動先の page の pin と lock を取得しようとする前に、現在の page の lock と pin を解放する。
いくつかの場所では、現在の page を解放する前に次の page を lock する必要がある。
これは右または上に移動するときには安全であるが、左または下に移動するときには安全ではない
(そうしないと deadlock の可能性が生じる)。

Lehman と Yao は、root page がいっぱいになって split が必要な場合に何が起きるべきかについて議論していない。
我々の実装では、root を他のどの page とも同じ方法で split し、
次に結果として得られる両方の page への pointer を保持する新しい root page を構築する
(それらは今では tree の次のレベルでの sibling になる)。新しい root page は、
meta-data page の root pointer を変更することによって install される (下記参照)。
これが機能するのは、root が他の点で特別に扱われていないからである --- 特に、search は link が設定されていれば、
その link pointer を使用して右に移動する。したがって、search は更新前に meta-data page を読んだ場合でも、
right sibling に移動した data を見つける。これは non-root page の split を安全にするのと同じ理屈である。
lock の考慮事項も同様である。

inserter が tree を再帰的に上昇し、下のレベルに挿入された page への link を挿入するために internal page を split するとき、
下降開始時に root だったレベル
(より正確には、meta-data page を読み取ったときに root だったレベル) より上の page にアクセスする
必要が生じる可能性がある。この場合、下降中に作成した stack は正しい page を見つけるのに役立たない。
これが起きた場合、link を挿入する必要のあるレベルの 1 つ上のレベルに到達するまで tree を再下降し、
必要に応じて右に移動することで、正しい場所を見つける。
(通常、これは meta-data page と新しい root の 2 回の fetch で済むが、原則として、
root を見てから root split が複数回発生した可能性がある。各 page に格納された level 番号によって、
正しい tree レベルを識別できる。状況は非常にまれなので、より効率的な解決策は必要ない。)

Lehman と Yao は、tree の上昇中に child page の downlink を再配置するときに右に移動する一部として、
lock を結合/chain する必要がある。これは Lehman と Yao が同時に 3 つの lock を保持しなければならない唯一の点である
(child に対する lock、元の parent、および元の parent の right sibling)。
しかし、我々は同じレベルの page に対して internal page の lock を結合する必要はない。
我々は child の block 番号を 1 レベル上の pivot tuple からの downlink に一致させるが、
Lehman と Yao は最初の下降中に辿った downlink に関連付けられた separator key に一致させる。
再配置しなければならない separator key が元の parent の high key になる場合を扱う必要がないため、
right sibling の lock を取得する前に元の parent page の lock を解放できる。
Lanin と Shasha もここでは lock を結合しないが、上昇中のレベル間でも lock を結合しない。
彼らは race を避けるために "待って再試行" することを厭わない。彼らのアルゴリズムは楽観的であり、
これは "insertion が上昇中に一度に複数の write lock を保持しない" ことを意味する。
我々は tree を上昇するときに parent と child の lock を保守的に結合する Lehman と Yao のアプローチに、
それがはるかに単純なので、ほぼ忠実に従う。

Lehman と Yao は固定サイズの key を前提としているが、我々は可変サイズの key を扱わなければならない。
そのため、page ごとの最大 key 数は固定されていない。収まるだけ詰め込む。
page を split するとき、我々は item 数ではなく、page に割り当てられる byte 数を均等化しようとする
(ただし、suffix truncation も考慮される)。この計算には到着する item を含めなければならないことに注意。
そうしないと、到着 item が行くべき split page に収まらないことが判明する可能性がある!

## VACUUM 中の index tuple の削除

leaf item を削除する前に、deletion が開始されるときに他の backend が page に対して pin を持たないように、
対象 page に対して完全な cleanup lock を取得する。これは btree index 操作自体の正確性のために
必要というわけではない。上記で説明したように、index scan は論理的に page 間で停止するため、
その位置を失うことはない。これを行う理由は、heap を訪問する際に並行 TID recycling を処理する準備ができていない
VACUUM と index scan の間の interlock を提供するためである。
heap 内の指された item を LP_UNUSED と mark できるのは VACUUM のみであり、
これは btbulkdelete が return した _後_ にのみ発生するため、index scan が (pin された leaf page からの TID について)
heap を訪問し終わるまで (leaf page から read するときに使用される) pin を保持することで、
並行 TID recycling を防ぐ。VACUUM は、index scan が leaf page の処理を完全に終了するまで、
競合する cleanup lock を取得できない。

このアプローチはかなり粗いので、可能な限り回避する。実際には、ほとんどの index scan は pin を保持せず、
そのため VACUUM を block しない。これらの index scan は TID recycling を直接処理しなければならないが、
これはより複雑であり、常に可能というわけではない。並行 TID recycling を安全にするための後のセクションを参照。

機会的な index tuple deletion は、exclusive lock のみを保持して、ほぼ同じ page レベルの変更を実行する。
これは安全である。なぜなら、後で TID recycling が行われる可能性はないからである -- TID を recyclable にできるのは
VACUUM だけである。下記の simple deletion と bottom-up deletion も参照。

pin が常に保持されているわけではなく、pin を持っている人がいても page を split できるため、
index scan が、pin を持っている page にもはや保存されていない item を返す可能性がある。
むしろその page の右側のどこかに保存されている。このシナリオで VACUUM が TID を早期に recyclable にすることがないように、
btbulkdelete に対して、削除可能な tuple を含まない page も含め、index 内のすべての leaf page に対する
cleanup lock を取得することを要求する。この要件は、btbulkdelete が page を特定の順序で訪問する必要があると言っていないことに注意。

## VACUUM の linear scan、並行 page split

VACUUM は削除可能な TID を search するために linear scan を行い、ついでに空 page の削除の可能性を考慮することによって index にアクセスする。
これは物理/block 順であり、論理/keyspace 順ではない。
ここで難しい部分は、並行 page split が存在する場合に削除可能な tuple を見逃さないようにすることである:
page split は、sequential scan によってまだ通過していない page から、すでに通過した低い番号の page に、
tuple を簡単に移動できる。

これを実装するために、現在の btbulkdelete cycle の開始以降に page が split されたかどうかを判断できる
"vacuum cycle ID" メカニズムを提供する。btbulkdelete が開始以降に split され、低い page 番号を指す right-link を持つ page を見つけた場合、
sequential scan を一時的に停止し、代わりにその page を訪問する。
btbulkdelete が開始されてから split されていない page、または外側の sequential scan の位置より上の page に到達するまで、
right-link を辿り、dead tuple を vacuum し続けなければならない。その後、sequential scan を再開できる。
これにより、すべての tuple が訪問されることが保証される。一部の tuple が 2 回訪問される可能性があるが、
それは不正確な index tuple count 以上の悪影響はない (とにかく並行アクティビティに直面して
正確な count を保証することはできない)。最近 split されたかの test が false negative を出さない限り、
false positive の確率が小さくてもこれは機能することに注意。これにより、各 index page に格納された
小さな counter 値で test を実装することが可能になる。

## VACUUM 中の page 全体の削除

我々は、btree から page 全体を削除することを、それが item を完全に含まなくなった場合にのみ考慮する。
(部分的に満杯の page を merge すると space の再利用がより良くなるが、
既存の data item を左または右に移動してこれを実現するのは非実用的に見える ---
反対方向に移動する scan が item を見逃す可能性がある。) また、tree レベル上の最右の page を _決して_ 削除しない
(この制限は下記で説明するように、traversal アルゴリズムを簡素化する)。
page deletion は常に空の leaf page から始まる。internal page は、subtree 全体を削除する一部としてのみ削除できる。
これは常に internal page の "chain" と単一の leaf page で構成される "skinny" な subtree である。
subtree の各レベルに 1 つの page があり、各レベル/page は同じ key 空間を cover する。

leaf page の削除は 2 段階のプロセスである。第 1 段階では、page は parent から unlink され、half-dead として mark される。
parent page は、insertion split 中に parent を見つけるために使用されるのと同じタイプの search を使用して見つけなければならない。
target と parent page を lock し、target の downlink を right sibling を指すように変更し、古い downlink を削除する。
これにより、target page の key 空間は事実上 right sibling に属することになる。
(left または right sibling page のいずれも、(存在すれば) その "high key" を変更する必要はない。
したがって、high key を置き換えるための十分な space がない可能性に関する問題はない。) 同時に、
target page を half-dead として mark し、その後の search がそれを無視して右に移動する
(または backwards scan では左に移動する) ようにする。これにより、tree は page split 中と同様の状態になる:
page にはそれを指す downlink がないが、まだ sibling に link されている。

(注: Lanin と Shasha は key 空間を左に移動させることを好むが、彼らの理由は、
我々にはとにかくある left-link を持たないことに依存している。そのため、我々は key 空間を右に移動することで、
アルゴリズムを簡素化する。これは、Lehman と Yao/Lanin と Shasha とは異なり、page split 中に tree を上昇するときに
separator key で match させないため可能である -- inserter が最初に tree を下降したときに遭遇したものと
separator key が一致しない pivot tuple で downlink が再発見されても問題ない。)

parent レベルでの一貫性を保つために、right sibling が同じ parent の child でない限り、
page の key 空間を right sibling に merge することはできない ---
そうでなければ、parent の key 空間の割り当ても変わり、その parent で bounding-key の更新を行わなければならず、
場合によっては tree の最上位まで行う必要がある。これを atomic に行うことは不可能なので、
このケースを禁止する。つまり、parent node の最右の child は、残っている唯一の child でない限り削除できない。
その場合、parent も削除する (下記参照)。

第 2 段階では、half-dead leaf page が sibling から unlink される。
最初に target の left sibling (存在する場合)、target page 自体、その right sibling (1 つは必ず存在する) を
その順序で lock する。次に、sibling の side-link を更新し、target page を deleted として mark する。

parent page の最後に残った child を削除しようとするとき、状況は少し複雑になる。
第 1 段階では、leaf page の直接の parent はそのままにし、代わりに parent page への downlink を grandparent から削除する。
それが grandparent の最後の child でもある場合、複数の child を持つ parent が見つかるまで再帰的に上昇し、
その page の downlink を削除する。leaf page は half-dead として mark され、
downlink が削除された page の block 番号は half-dead leaf page に格納される。
これにより、各 downlink を 1 つずつ持つ internal page の chain が、half-dead leaf page に至るまで残され、
chain の最上位 page を指す downlink はない。

chain の最上位の parent を見つけるために再帰的に上昇する間、leaf page は lock したままにするが、
leaf と最上位の parent の間の中間 page の lock を保持する必要はない --
上位 tree レベルへの insertion は child page の split の結果としてのみ発生し、それは leaf を lock している限り発生し得ない。
chain 内の internal page も、その後新しい child を獲得することはできない。なぜなら、leaf page が half-dead として mark されており、
split されないからである。

削除される subtree/chain の最上位への downlink を削除することは、すべての中間レベルでも、
1 つの atomic な操作で key 空間を right sibling に効果的に転送する。
並行 search は中間 page を訪問する可能性があるが、leaf レベルの half-dead page に到達したときに右に移動する。
特に、search は half-dead leaf page の右側の subtree に移動する。なぜなら、
half-dead leaf page の right sibling は "真の" sibling page ではなく "cousin" page であるはずだからである
(削除される chain が leaf page の grandparent page から始まる場合、second cousin page、というように)。

第 2 段階では、chain の最上位 page が sibling から unlink され、
half-dead leaf page が chain 内の次の下の page を指すように更新される。
これは、chain 内に internal page がなくなるまで繰り返される。最後に、half-dead leaf page 自体が sibling から unlink される。

削除された page はすぐには recycle できない。なぜなら、それを参照するのを待っている他の process があるかもしれないからである
(つまり、parent を離れたばかりの search process、または sibling の 1 つから右または左に移動する scan)。
これらの process は、deletion 操作の後しばらくの間、削除された page を観察できなければならない。
そうすれば少なくともそれから回復できる (並行 page split と同様に、右に移動して回復する)。
searcher は、並行 page recycling について心配する必要はない。

VACUUM がいつ、どのように削除された page を recyclable にできるかについては、
下記の "削除された page を FSM に配置する" セクションを参照。

## Page deletion と backwards scan

backward scan で左に移動することは、left sibling が split されたばかりの可能性
(つまり、left sibling から派生した最右の page を見つけなければならない) と、
今いる page が削除されていて sibling chain にもはや存在しない可能性を考慮しなければならないため、複雑である。
したがって、move-left アルゴリズムは次のようになる:

0. 今いる page を "original page" として記憶する。
1. original page の left-link を辿る (これが 0 なら完了)。
2. 現在の page が live で、その right-link が "original page" と一致する場合、完了。
3. それ以外の場合、right-link が "original page" と一致する live page を探して、1 回以上右に移動する。
   見つかった場合、完了。(原則として、index の右端まで scan できるが、
   実際には少数の試行の後に諦める方が良いようである。
   我々がそれに向かう途中で original page の sibling が数回以上 split されたとは考えにくい。
   数回の試行で一致する link が見つからない場合、おそらく original page が削除されている。)
4. "original page" に戻る。それがまだ live なら、step 1 に戻る
   (削除されたという推測が間違っており、現在の left-link で再開すべきである)。
   それが dead なら、dead でない page が見つかるまで右に移動する (1 つは必ず存在する。最右の page は決して削除されないため)。
   それを新しい "original page" として mark し、step 1 に戻る。

このアルゴリズムが正しいのは、step 4 で見つかった live page が、開始した page と同じ左 keyspace 境界を持つからである。
したがって、最終的に終了するとき、右 keyspace 境界が開始した位置の左境界と一致する page にいるはずである ---
これは、item を見逃したり re-scan したりしないことを保証するために必要なものである。

## Page deletion と tree の高さ

我々は任意のレベルの最右の page を決して削除しない (特に root を決して削除しない) ため、
tree の高さが減ることはあり得ない。大規模な削除の後、tree が "skinny" になり、
root の下に single-page level がいくつかあるシナリオが発生する可能性がある。
この場合でも操作は正しいが、single-page level を下降する cycle を無駄にすることになる。
これを処理するために、Lanin と Shasha からのアイデアを使用する: "fast root" level を追跡する。
これは最も低い single-page level である。meta-data page は、真の root と同様にこのレベルへの pointer を保持する。
すべての通常の操作は、真の root ではなく fast root で search を開始する。
level 上で単独の page を split するか、level の最後から 2 番目の page を削除するとき
(両方のケースは簡単に検出される)、fast root pointer が適切に調整されることを確認しなければならない。
split の場合、parent level への insertion の atomic な更新の一部としてこの作業を行う。
delete の場合は、delete の atomic な更新の一部として行う
(いずれにせよ、deadlock リスクを避けるために、metapage は更新で最後に lock される page でなければならない)。
これは、2 つのそのような操作が並行して実行されている場合の race condition を回避する。

## 削除された page を FSM に配置する

page の recycling は page の deletion から切り離されている。削除された page は、それへの参照を持つ scan や search の可能性がなくなって初めて、
recycle されるために FSM に配置できる。それまでは、sibling link が乱されることなく、
tombstone としてその場所にとどまり、並行 search が並行 deletion を検出して回復できるようにしなければならない
(これは searcher にとっては並行 page split に似ている)。この設計は、Lanin と Shasha が "the drain technique" と呼ぶものの実装である。

我々は、page deletion 時点のすべての active snapshot と registered snapshot がなくなるまで待機することで、
この技法を実装する。これは過度に強力であるが、Postgres 内で実装するのが簡単である。
完全に dead として mark されると、削除された page は next-transaction counter 値で label 付けされる。
VACUUM は、格納された XID が "visible to everyone" であることが保証されているときに、page を再利用のために reclaim できる。
副次的な被害として、XID を割り当てる次のトランザクションが commit するまで取得された snapshot を待機する。
また、snapshot のない running XID も待機する。

PostgreSQL 14 より前は、VACUUM は linear scan 中に遭遇した _古い_ 削除された page (以前の VACUUM 操作で削除された page) のみを
FSM に配置していた。新しく削除された page は決して FSM に配置されなかった。
なぜなら、それは _常に_ 安全でないと想定されていたからである。しかし、その仮定は実際には不必要に悲観的だった --
新しく削除された page が FSM に配置するのに安全になるまでに、それほど時間がかからないことが多い。
削除された page がいつ recycling のために FSM に配置するのに安全になるかを予測する真に原則的な方法はない --
ほとんどすぐに安全になるかもしれない (現在の VACUUM が完了するずっと前に)、
あるいは次の VACUUM が行われるまでに安全にならないかもしれない。recycle の安全性は、純粋に物理 data 構造の一貫性
(または少なくとも見かけ上の一貫性) を維持することの問題である。VACUUM を実行している backend 内の状態は、単に関係ない。

PostgreSQL 14 では、page deletion が行われた full index scan の終わりに、新しく削除された page を recycle することが可能かどうかを
VACUUM が考慮できる機能が追加された。その時点で安全かどうかを確認するのは便利である。
これには、VACUUM が新しく削除された page に関するいくつかの bookkeeping 情報を保持する必要があるが、それは非常に安価である。
これに in-memory 状態を使用することで、後で新しく削除された page を 2 回目に再訪問する必要がなくなる --
ローカルの bookkeeping 状態から safexid 値を使用して、deferred な方法で recycle の安全性を判断するだけで済む。

page deletion 操作の後に追加の FSM 間接化が必要になるのは、Lehman と Yao の設計における index scan の
非常に寛容なルールの自然な結果である。一般に、index scan は tree を下降するときに任意の page に対する
lock や pin を保持する必要はない (通常 "レベル間" の interlock として考えるようなものは保持されない)。
同時に、並行 recycling (並行 deletion と混同しないこと) のために、index scan が真に無関係な page に着地することは許されない。
なぜなら、それは query への誤った回答をもたらすからである。recycling を延期する必要がない、より単純な page deletion アプローチも可能であるが、
Lehman と Yao の設計と互換性があるものは何もないようである。

すでに削除された page を必要なときに recycle するために FSM に配置することは、実際には page の状態を変更しない。
page は、それが後で再利用のために FSM から取り出されたときに変更される。削除された page の内容は、
split 操作によって上書きされる (新しい right sibling page になる)。

## 並行 TID recycling を安全にする

VACUUM 中の index tuple deletion に関する前のセクションで説明したように、
個々の index scan が並行 TID recycling を回避できるようにする locking protocol を実装している。
ただし、index scan は安全な場合には opt-out する (したがって、heap を訪問するときに leaf page の pin を drop する)。
pin を早期に drop することは、VACUUM の進行を block しないため有用である。
これは特に、cursor で使用される index scan で重要である。idle な cursor は比較的長い期間停止することがあるためである。
極端な場合、client application が idle な cursor を数時間、または数日間保持することがある。
それほど長い間 VACUUM を block することは、悲惨な結果になる可能性がある。

buffer pin を保持しない index scan は、代わりに MVCC snapshot を保持することによって保護される。
このより限定的な interlock は、query への誤った回答を防ぐが、並行 TID recycling 自体を防ぐわけではない
(heap にアクセスする際に leaf page の pin を保持することだけがそれを保証する)。

Index-only scan は、参照される TID が recyclable になることに耐えられないため、buffer pin を決して drop できない。
Index-only scan は通常、visibility map を訪問するだけで (heap 本体ではない)、
そのため、stale な TID reference (最初は dead-to-all な heap item を指していた TID) が heap 内で VACUUM によって並行的に
LP_UNUSED と mark されたことを確実に気付かないことになる。これにより、VACUUM が直後に heap page 全体を
visibility map で all-visible に設定することが容易になる。MVCC snapshot は、plain index scan 中に
問題を回避するのに十分である。なぜなら、それらは詳細な visibility 情報を heap 本体からアクセスしなければならないからである。
plain index scan は、heap 内の LP_UNUSED item (recycle 可能だがまだそうなっていない item) を
"not visible" として認識する -- heap page が一般に all-visible と見なされている場合でも。

kill_prior_tuple 最適化 (下記の simple deletion で詳しく説明) による index tuple の LP_DEAD 設定も、
leaf page の pin を drop する index scan にとってはより複雑である。
並行 TID recycling の後で同じ TID を共有しているために、known-dead な index tuple のように見える新しい index tuple を、
LP_DEAD と mark しないように注意しなければならない。他の session が同じ leaf page に、
たまたま同じ元の TID を持つ新しい無関係な index tuple を挿入した可能性は十分にある。
この新しい無関係な index tuple を LP_DEAD に設定することは、まったく間違いである。

我々は、影響を受ける index scan が、leaf page への任意の変更が、buffer pin が保持されていない期間に
btbulkdelete によって到達されたことを意味すると保守的に仮定することで、この kill_prior_tuple race condition を処理する。
これは、page の LSN が変更されたときに、leaf page に LP_DEAD bit をまったく設定しないことによって実装される。
(これが、unlogged な index relation に "fake" な LSN を実装する理由である。)

## Index insertion のための Fastpath

増加する index key 値の挿入という一般的なケースを最適化するために、
この backend が最後の値を挿入した最後の page を、それが最右の leaf page であった場合に cache する。
次の insert では、cache された page がまだ最右の leaf page であり、現在の値を保持する正しい場所かどうかを素早く確認できる。
このような一般的なケースで tree を下降する cost を回避できる。

最適化は、無視できない最右の leaf page が 1 つしか存在し得ないという前提で機能するため、
visible-to-everyone スタイルの interlock さえ必要ない。hint が無効化されたことを検出できないことはあり得ない。
なぜなら、B-Tree 内のそのような page はいつでも 1 つしか存在し得ないからである。
backend の cache された page も無効化として検出されることなく page が削除されて recycle される可能性はあるが、
それは、再び最右の leaf page として recycle される block を偶然 recycle する場合のみである。

## Simple deletion

process が heap tuple を訪問して、それが dead で removable である (つまり、その process だけでなく、すべての open transaction に対して dead) ことを発見した場合、
index に戻って、対応する index entry を "known dead" として mark でき、その後の index scan が heap tuple を訪問するのを skip できる。
"known dead" な marking は、index item の lp_flags 状態を LP_DEAD に設定することで機能する。
これは現在、plain な index scan でのみ行われ、bitmap scan では行われない。
plain scan のみが heap と index を "同期して" 訪問するため、bitmap scan には便利な方法がないからである。
unique index を insert の競合についてチェックするときにも LP_DEAD bit がしばしば設定されることに注意
(これは、leaf page に対する exclusive lock を保持しているときに発生するため、より単純である)。

index tuple が LP_DEAD と mark されると、実際にすぐに index から削除できる。
index scan は page 間でのみ停止するため、そのような deletion で scan がその場所を失うことはない。
LP_DEAD は share lock のみで設定できるようにしているため (heap tuple の hint bit のようなもの)、step を分離しているが、
物理的に tuple を削除するには exclusive lock が必要である。また、各 deletion 操作の WAL record に対して snapshotConflictHorizon を生成する必要がある。
これには、deletion が実際に行われるときに tableam との追加の調整が必要である。
(snapshotConflictHorizon 値は、standby による record の後続の REDO 中に conflict を生成するために使用できる。)

このように index tuple の deletion を遅延および batch 処理すると、さらなる最適化が可能になる:
通り過ぎる際に check するのに非常に安価な "extra" な近隣 index tuple (LP_DEAD に設定されていない tuple) の機会的な check である
(なぜなら、tableam が snapshotConflictHorizon を生成するために table block を訪問することがすでに分かっているからである)。
削除しても安全であることが判明した index tuple も削除される。
simple deletion は、実際に削除しても安全であることが判明した extra な tuple が、最初から LP_DEAD bit が設定されていたかのように振る舞う。

deduplication も page split を防ぐことができるが、index tuple deletion が我々の優先するアプローチである。
posting list tuple は、posting list 内のすべての table TID が dead と判明している場合にのみ、LP_DEAD bit を設定できることに注意。
これは実際にはあまり問題ではない。なぜなら、LP_DEAD bit は deletion の開始点にすぎないからである。
本当に重要なのは、page が最終的に split される前のある時点で、関連する近隣の table 内の TID を target にする
_何らかの_ deletion 操作が行われることである。これだけが、deletion process が posting list tuple から dead な TID のグループを
細かく削除するために必要である (状況が手に負えなくなることが決して許されないようにする)。

## Bottom-Up deletion

duplicate が連続した UPDATE による version churn によって引き起こされていると疑われる場合、
page に偶然存在する duplicate を削除しようとする。これは、heapam の HOT のような最適化が
index に対してうまく機能しなかったことを示す executor の hint を受け取ったときにのみ発生する --
到着する tuple は、MVCC 目的で必要な論理的に変更されていない duplicate でなければならず、
それが問題の leaf page の新しい index tuple の主要な発生源である可能性があることを示唆している。
(また、unique index 内で継続的な INSERT および DELETE 関連の churn がある場合に bottom-up deletion が trigger される。
これは、外部の hint なしで簡単に検出できるためである。)

bottom-up deletion pass が行われるとき、simple deletion はすでに page split を防ぐことに失敗しているはずである
(多くの場合、page に LP_DEAD bit が設定されたことが一度もないためである)。
2 つのメカニズムは密接に関連した実装を持つ。各操作に同じ WAL record が使用され、
どの TID/tuple が実際に削除しても安全かを判断するために同じ tableam インフラが使用される。
実装は、deletion を考慮する TID の選び方、および tableam がすべての table block にアクセスする前に諦めるかどうかにおいてのみ異なる
(bottom-up deletion は、失敗の cost を低く保つことで、その成功の不確実性と共存する)。それでも、
2 つのメカニズムは概念レベルで明確に区別される。

bottom-up index deletion は完全に heuristic によって駆動される
(simple deletion は、すでに LP_DEAD と mark されている index tuple を少なくとも削除することが保証されている -- 少なくとも 1 つは必要である)。
削除する index tuple が 1 つでも見つかるという確実性はない。これが、我々が tableam と緊密に協力して、
tableam が支払う cost を我々が受け取る利益とバランスさせる理由である。これに使用する interface は、
access/tableam.h で詳しく説明されている。

bottom-up index deletion は、不要な version-driven な page split に対する backstop メカニズムと考えることができる。
これは部分的に generational garbage collection のアイデアに基づいている: "generational hypothesis"。
これは "most objects die young" という経験的な観察である。nbtree 内では、
新しい index tuple がしばしば同じ場所にすばやく現れ、その後すばやく garbage になる。
特定の workload では、比較的少数の leaf page に garbage の強い集中がある可能性がある
(あるいは、少なくとも bottom-up index deletion のない以前のバージョンの PostgreSQL ではそうだった)。
nbtree における bottom-up index deletion の背後にある設計原則の高レベルな説明 (VACUUM をどのように補完するかの詳細を含む) については、
doc/src/sgml/btree.sgml を参照。

各 bottom-up pass 内で、削除しても安全である合理的に多数の tuple が見つかると期待する。
そうでない場合、しばらくの間、同じ leaf page に対して bottom-up deletion の問題を考慮する必要はない
(通常、page が split され、当面の状況が解決されるため)。version churn だけによって不要な page split の継続的な risk にさらされている
page に対して、定期的な bottom-up deletion 操作を実行することを期待する。メカニズムがうまく機能しているとき、
我々は version-churn-driven な page split の "瀬戸際" に常にいることになるが、実際には 1 つも発生しない。

我々の duplicate heuristic はかなり単純であるにもかかわらずうまく機能する。
真に病的なレベルの version churn がある場合にのみ、不要な page split が発生する
(理論的には、少量の version churn でも厳密に必要であるよりも早く page split が発生する可能性があるが、それはかなり無害である)。
基礎となる workload を理解する必要はない。target とする pathology の一般的な性質を理解するだけで十分である。
version churn は、それが真に病的であるときに発見しやすい。影響を受ける leaf page はかなり均質である。

## WAL の考慮事項

insertion および deletion アルゴリズム自体は、crash 後の btree の一貫性を保証しない。
robustness を提供するために、我々は WAL replay に依存する。単一の WAL entry は事実上 atomic なアクションである ---
完了に失敗した場合、log から redo できる。

通常の item insertion (page split を強制しないもの) は、もちろん単一の WAL entry である。
1 つの page のみに影響するからである。leaf item の deletion も同様である (deletion によって leaf page の item が 0 になる場合、
削除候補になるが、それは別のアクションである)。

page split を引き起こす insertion は、insertion のレベルで発生する変更 (right sibling の left-link の更新を含む) に対する単一の WAL entry として log 記録され、
続いて parent レベルでの insertion のための 2 つ目の WAL entry
(これ自体が page split である可能性があり、その上にさらなる insertion が必要になる、というように) が続く。

root split の場合、後続の WAL entry は "insertion" entry ではなく "new root" entry であるが、それ以外の詳細はほぼ同じである。

split には複数の atomic なアクションが関係するため、page を split してから、新しい半分への downlink を parent に挿入する間に system が crash する可能性がある。
recovery 後、新しい page の downlink が欠落する。search アルゴリズムは正しく機能する。
page は left sibling からの right-link を辿ることで見つかるからである。
ただし、tree 内で多くの downlink が欠落している場合、performance が低下する。
より深刻な結果は、downlink のない page が再度 split された場合、insertion アルゴリズムが downlink を挿入する parent レベルの場所を見つけられないことである。

我々のアプローチは、新しい insertion のために tree を search するときに、欠落している downlink を on-the-fly で作成することである。
search 中にも行うことができるが、それ以外の場合は read-only 操作になるものに追加の更新を入れないのが最善のようである
(とにかく hot standby モードでは更新は不可能である)。VACUUM で欠落している downlink を追加するのが自然に見えるが、
downlink の insertion には page split が必要になる可能性があり、disk space が足りない場合に失敗する可能性がある。
それは VACUUM 中には悪いことである - そもそも VACUUM を実行する理由は、disk space が足りなくなったことかもしれず、
そして今、disk space が足りないために VACUUM が完了しないことになる。対照的に、
insertion はとにかく物理 file を拡大することを必要とする可能性がある。1 つの小さな例外がある:
VACUUM は、child を削除するときに internal page の中断された split を終了する。
これにより、parent item を re-find するための code を、page split と page deletion の両方で使用できる。

欠落している downlink を識別するために、page が split されたとき、left page に split がまだ完了していないことを示す flag (INCOMPLETE_SPLIT) が立てられる。
downlink が parent に挿入されると、flag は insertion と atomic に clear される。child page は、parent への insertion が終了して child の flag が clear されるまで lock されたままになるが、
parent も split が必要な場合は、その後すぐに解放してから、tree を上に再帰することができる。
これにより、不完全に split された page は通常の状況では見られないようにする。何らかの理由で parent への insertion が失敗した場合のみである。
(reader が recovery 中に incomplete split flag が設定された page を観察する可能性もある。詳細については後の "Recovery 中の Scan" セクションを参照。)

downlink が欠落しているのは right page であるが、left page に flag を立てる。なぜなら、left page から right page への right-link を辿るときに、
それが parent に downlink を挿入する必要があることをすでに知っている方が便利だからである。

レベル上で単独の non-root page を split するとき、必要な metapage の更新 ("fast root" link) は、parent レベルへの insertion の一部として実行および log 記録される。
root page を split するとき、metapage の更新は "new root" アクションの一部として処理される。

page deletion の各 step は別々の WAL entry として log 記録される: leaf を half-dead として mark し downlink を削除するのが 1 つの record で、
page の unlink が 2 つ目の record である。何らかの理由で vacuum が中断された場合、または system が crash した場合、tree は search および insertion に対して一貫している。
次の VACUUM は half-dead leaf page を見つけ、deletion を続行する。

9.4 より前は、recovery 中に incomplete split と page deletion を追跡し、次の insertion または vacuum で遅延して行うのではなく、recovery の終わりに即座に終了していた。
しかし、それは recovery をはるかに複雑にし、crash recovery が実行されたときにのみ問題を解決した。
parent への downlink の insertion 中に、out-of-memory や out-of-disk-space など、それ以外は recoverable な error が発生した場合にも、incomplete split が発生する可能性がある。

## Recovery 中の Scan

nbtree index は Hot Standby モードでの read query を support する。すべての atomic アクション/WAL record は、
tree が reader に対して一貫した状態を残す独立した変更を行う。reader は、primary で reader が従うのと同じルールに従って page を lock する。
(reader は "並行" page split または page deletion から回復するために右に移動する必要があるかもしれない。primary と同様に。)

ただし、primary 上の元の write 操作と比較して、replay/startup process が page を lock する方法にはいくつかの違いがある。
例外は page split と page deletion に関するものである。page split の第 1 phase と第 2 phase は、独立した atomic アクションであるため、replay 中に独立して処理される。
primary で行われた parent と child の page write lock の結合を再作成しようとはしない。これは安全である。なぜなら、
reader は incomplete split flag についてとにかく気にしないからである。primary で余分な write lock を保持することは、
最初の writer が split を終了する前に 2 つ目の writer が incomplete split flag を観察できないようにするためにのみ必要である。
primary 上の並行 writer が同じ page の incomplete split flag を観察できるようにすると、各 writer は未完了の split を完了しようと試み、
parent page を破損させる。(同様に、page deletion record の replay は、target leaf page に対する write lock を通して保持しない。
削除される page に挿入する並行 writer を block する必要があるのは primary のみである。)

ただし、WAL replay は、元の実行中に取られたアプローチと一致する方法で同一レベルの lock を保持する。
これにより、reader が同一レベルの不一致を観察するのを防ぐ。recovery 中に同一レベルの lock がどのように取得されるかについて、より緩やかにすることはおそらく可能である
(同一レベルの lock を結合しなくても、ほとんどの種類の reader はまだ回復するために右に移動できる) が、ここでは保守的でありたいと考える。

recovery 中、すべての index scan は ignore_killed_tuples = false で開始し、kill_prior_tuple を決して設定しない。
これは、standby server 上の最も古い xmin が primary server 上の最も古い xmin より古い可能性があるためである。
これは、tuple が standby 上ではまだ visible であっても LP_DEAD として mark される可能性があることを意味する。
tuple の LP_DEAD bit を WAL log 記録しないが、full page write のために standby にそれらが現れる可能性がある。
そのため、standby では常にそれらを無視しなければならず、それは設定する価値もないことを意味する。
(LP_DEAD と mark された tuple が最終的に primary で削除されるとき、deletion は WAL log 記録される。
したがって、standby で実行される query は、primary で行われる任意の LP_DEAD 設定の利益の多くを得る。)

recovery 中に開始される scan について話していることに注意。recovery 中に scan を開始し、recovery が完了した後の通常の実行中に終了できるように、少し手間をかけている。
これは重要な機能である。なぜなら、これにより、standby が通常実行 server の状態に変わる間、実行中の application を継続できるからである。

non-MVCC scan から誤った結果を返すのを避けるために必要な interlock は、standby node では必要ない。
recovery 中に VACUUM record を replay するときに完全な cleanup lock を取得するが、recovery はすべての leaf page を lock する必要はない
(削除する item を持つ leaf page のみ) -- それは、recovery 中に index-only scan を壊さないようにするのに十分である (TID recycling を安全にすることについての上記のセクションを参照)。
これにより、plain な index scan のみが懸念事項として残る。(XXX: recovery 中にこれが完全に不要である理由は実際には明確ではない。)

MVCC snapshot の plain index scan は、元の実行中に安全であるのと同じ理由で常に安全である。
HeapTupleSatisfiesToast() は MVCC セマンティクスを使用しないが、それは必要ないためである。
main heap row が visible であれば、toast row も visible になる。したがって、visible (live) tuple から toast pointer を辿っている限り、
対応する toast row も visible になるので、それらについて MVCC を recheck する必要はない。

## 知っておくと便利なその他のこと

すべての btree の page 0 は meta-data page である。この page には root page の場所が格納される ---
真の root と現在の有効な root ("fast" root) の両方。すべての単一 index search のために metapage を fetch するのを避けるために、
index の relcache entry (rd_amcache) に meta-data 情報の copy を cache する。
これは少し tricky である。なぜなら、cache を使用することは、古くなる可能性のある root page pointer を辿ることを意味するからである。
ただし、cache された pointer を辿る backend は、意図した page に到達したかどうかを十分に検証できる。
真の root に行く場合は is-root flag を check することによって、または fast root に行く場合は page に sibling がないことを check することによってである。
最悪の場合、これは、現在実際の fast root より上の fast root への cache された pointer がある場合、追加の tree level を下降することになるかもしれない。
そのようなケースは、最適化する価値があるほど頻繁には発生しないはずである。いずれにせよ、relcache flush が cache された metapage をまもなく破棄することを期待できる。
fast root pointer を移動した VACUUM は、index の統計情報の更新を発行することが期待されるからである。

アルゴリズムは、page に少なくとも 3 つの item ("high key" と 2 つの real data item) を収めることができることを前提としている。
したがって、page size の 1/3 より大きい item を受け入れることは安全ではない。より大きい item は時々機能するが、
その page に他に何が置かれるかに応じて、後で失敗を引き起こす可能性がある。

"ScanKey" data 構造は、この code 内で根本的に異なる 2 つの方法で使用される。
それらを "search" scankey と "insertion" scankey と呼んでいる。search scankey は、
btree code の外部から btbeginscan() や btrescan() に渡される種類のものである。
search scankey の sk_func pointer は、int4lt などの boolean を返す比較関数を指す。
指定された index 列に対して複数の scankey entry が存在する場合もあれば、まったくない場合もある。
(key は index 列順に現れることを要求するが、指定された列の複数 key の順序は指定されていない。)
insertion scankey ("BTScanInsert" data 構造) は同様の array-of-ScanKey data 構造を使用するが、
sk_func pointer は btree 比較 support 関数を指す (つまり、<0、=0、>0 として解釈される int4 値を返す 3-way comparator)。
insertion scankey では、index 列あたり最大 1 つの entry しかない。
また、scan 開始位置を特定するために使用される rule に関する他の data もある。
たとえば、scan が "nextkey" scan であるかどうかなどである。Insertion scankey は btree code 内 (たとえば _bt_mkscankey()) で構築され、
scan の開始点を特定するため、および新しい index tuple を挿入する場所を特定するために使用される。
(注: search scankey または truncate された pivot tuple から構築された insertion scankey の場合、
index 列より少ない key がある可能性がある。これは、残りの index 列に対する制約がないことを示している。)
scan の開始点を特定した後、元の search scankey が各 index entry が順次 scan されるたびに参照され、
entry を返すかどうか、および scan を停止できるかどうかを決定する (_bt_checkkeys() を参照)。

## Suffix truncation に関するメモ

leaf page split 中に、page high key に必要でない suffix key attribute を truncate する。
残りの attribute は、split 後の left page の最後の index tuple が left page に属し、
split 後の right page の最初の index tuple が right page に属することを区別しなければならない。
tuple は論理的に truncate された key attribute を保持するが、暗黙的に "negative infinity" を値として持ち、storage の overhead はない。
high key は後で新しい right page の parent page の downlink として再利用されるため、suffix truncation は pivot tuple を短くする。
INCLUDE index は、leaf page split の時点で non-key attribute が truncate されることが保証されているが、
key attribute に関する通常の基準に基づいて、いくつかの key attribute も truncate される可能性がある。
non-key attribute は単に B-Tree search の payload であるため、特別なケースではない。

key attribute の suffix truncation の目標は、index の fan-out を改善することである。
この技法は Bayer と Unterauer によって最初に説明された (R. Bayer and K. Unterauer, Prefix B-Trees,
ACM Transactions on Database Systems, Vol 2, No. 1, March 1977, pp 11-26)。Postgres の実装は彼らの論文に大まかに基づいている。
Postgres は論文が simple prefix B-Trees と呼ぶものしか実装していないことに注意。
また、論文は、tree が "prefix property" を維持する単一の文字列で構成される key を持つことを前提としていることにも注意。
これは、suffix tree に格納される文字列のようなものである (earlier byte の比較は常に later byte の比較よりも significant でなければならず、
一般に、文字列は piece に分割されたときに transitive consistency を破らない方法で比較されなければならない)。
Postgres の suffix truncation は現在、whole-attribute の粒度でのみ機能するが、text のような可変長 type の場合に、
より小さい attribute 値を製造する opclass インフラを発明することは簡単である。opclass の support 関数は、
leaf page split の各半分を正しく separate するための最短の key 値を製造することができる。

leaf page の split point を選択するための洗練された基準がある。一般的な考え方は、page split の各半分の space のバランスを過度に影響することなく、
suffix truncation を effective にすることである。leaf split point の選択は、split する page の item の _間_ の点の選択と考えることができる。
少なくとも、到着する tuple がすでに page に配置されていると仮定する場合 (実際には page にそれだけの space がないため、仮定する必要がある)。
最初の non-equal な attribute ができるだけ早く現れる 2 つの index tuple の間で split point を選ぶと、できるだけ多くの suffix attribute が truncate される。
split の各半分の space を均等に balance させることは通常最初の関心事であるが、正確な split point の小さな調整でさえ、truncation をはるかに effective にすることができる。

suffix truncation は、pivot tuple を小さくして internal page の split を遅らせるため主に価値があるが、それが effective である唯一の理由ではない。
alignment のために pivot tuple を小さくしない truncation でさえ、pivot tuple がどの値がどの page に属するかを記述する際に、
真に必要以上に restrictive になることを防ぐ。

internal page split 中に suffix truncation を正しく実行することはできないが、internal page を split するときに discriminating であることは依然として有用である。
fillfactor の観点で最適な split point の許容範囲内で利用可能な最小の downlink を parent に挿入することを意味する split point が選ばれる。
このアイデアも Prefix B-Tree 論文から来ている。この process は、suffix truncation を effective にするために leaf level で起こることと多くの共通点がある。
全体的な効果は、suffix truncation がより小さく、より discriminating な pivot tuple を生成する傾向があることである。
特に index の lifetime の早い段階でそうであり、一方、internal page split を bias することで、以前の小さい pivot tuple が root page に収まることになり、root page split を遅らせる。

論理的な duplicate は特別な考慮が与えられる。split point を選択する logic は、duplicate が複数の page にまたがるのを避けるために多大な努力を払い、
ほとんど常に 2 つの user-key-distinct な tuple 間の split point を選ぶことができる。必要であれば完全に lopsided な split を受け入れる。
duplicate ですでに満杯の page を split しなければならないとき、fallback 戦略は duplicate がほとんど昇順の heap TID 順で挿入されると仮定する。
page は、page の左半分がほぼ満杯で、page の右半分がほぼ空になるような方法で split される。
全体的な効果は、leaf page split が duplicate の大きなグループの insert に優雅に適応し、space 利用を最大化することである。
このように、duplicate の大きなグループを同じ leaf page に "閉じ込める" ことは、deduplication をより efficient にすることにも注意。
deduplication は、既存の posting list tuple を頻繁に merge することなく、まれにしか実行できない。

## Deduplication に関するメモ

non-unique index 内の non-pivot tuple を deduplicate して、storage の overhead を削減し、page split を回避 (または少なくとも遅延) する。
unique index での deduplication の目標はかなり異なることに注意。詳細については後のセクションを参照。
deduplication は、index の論理的な内容を変更することなく、また read query に overhead を追加することなく、tuple の物理的な表現を変更する。
non-pivot tuple は、posting list (標準 item pointer 形式の heap TID の単純な array) を持つ単一の物理 tuple に merge される。
deduplication は常に遅延して適用される。それ以外の場合、page split を実行する必要がある時点である。これは、
LP_DEAD item が削除されたときに、leaf page の split に対する最後の防衛線として発生する (bottom-up index deletion が最初に試みられる可能性があり、これが我々の最後から 2 番目の防衛線である)。
すべての TID が dead と判明している場合のみ、posting list tuple で LP_DEAD bit を設定できる。

deduplication に対する我々の遅延アプローチは、page split 中に使用される page space accounting に、posting list 用の特殊ケース logic を絶対的に最小にすることを可能にする。
posting list は、page split 中に必要に応じて suffix truncation が確実に truncate する余分な payload と考えることができる。
INCLUDE index tuple の non-key 列と同じように。incoming/new な tuple は一般に、重複しない plain な item として扱うことができる
(ただし、重複する new/incoming な item が実際にどのように扱われるかについては、posting list split のセクションを参照)。

posting list の表現は GIN が使用する posting list とほぼ同一であるため、個々の posting list に GIN の varbyte encoding 圧縮スキームを適用するのは straightforward である。
posting list の圧縮は、page space accounting に関する posting list split の前提を破ることになる (後のセクションを参照) ので、
圧縮を nbtree とどのように integrate できるかは明確ではない。さらに、posting list の圧縮は、nbtree にとって魅力的な trade-off を提供しない。
一般に、nbtree は多くの並行 reader と writer での一貫した performance のために最適化されているためである。
圧縮は、posting list から TID の subset を削除することを遅く複雑にし、bottom-up index deletion に大きく依存する workload にとって大きな問題になるだろう。

deduplication に対する我々の遅延アプローチの主な目標は、random update での deduplication の performance への影響を制限することである。
同じ key 値の並行 append-only insert でさえ、heap TID 順とは完全に一致しない順序で個々の index tuple の insert を行う傾向がある。
deduplication を遅延することで、page level の fragmentation を最小化する。

## Unique index での Deduplication

非常にしばしば、unique index のほぼ任意の leaf page に置くことができる distinct な値の数は固定されており永続的である。
たとえば、identity 列の primary key は通常、最右の leaf page 内に新しい論理 row が挿入されることによってのみ leaf page split が発生する。
最右ではない leaf page の split がある場合、その split は既存の論理 row の UPDATE に関連する insert によって trigger されたに違いない。
複数の version を保存するためだけに leaf page を split することは false economy である。実際、我々は一時的な duplicate の burst を吸収するだけのために、index 構造を永続的に劣化させているのである。

unique index での deduplication は、これらの病的な page split を防ぐのに役立つ。space efficient な方法で duplicate を保存することは目標ではない。
長期的には、とにかく duplicate は存在しないからである。むしろ、page split が必要になる前に、標準的な garbage collection メカニズムを実行する時間を稼いでいるのである。

unique index の leaf page は、(page を split する必要があるかもしれない) insertion がその page に既存の duplicate を通り過ぎる際に observe したときにのみ、deduplication pass を取得する。
これは、_すべて_ の new な insertion が UPDATE による duplicate である場合にのみ、deduplication がうまく機能するという前提に基づいている。
これは、page split を遅らせる機会を逃すことを意味するかもしれないが、それは大丈夫である。我々の究極の目標は、leaf page split を _無期限に_ 遅らせることだからである
(つまり、それらを完全に防ぐことである)。とにかく不可避と思われる split を遅らせようとすることにあまり意味はない。
これにより、duplicate が常にほとんどまたはまったくない unique index での deduplication を試みる overhead を回避できる。

注: version churn によって駆動される "不必要な" page split を回避することは、PostgreSQL 14 で追加された bottom-up index deletion の目標でもある。
bottom-up index deletion は、この問題に対処するための優先される方法になった (すべての種類の index で、特に unique index で)。
それでも、deduplication は時に bottom-up index deletion を augment できる。deletion が tuple を解放できない場合 (古い snapshot が cleanup を妨げているため)、
deduplication に頼ることで追加の容量が提供される。deduplication によって page split を遅らせることで、同じ page の将来の bottom-up deletion pass が成功できるようになるかもしれない。

## Posting list split

到着する tuple がたまたま既存の posting list と重複する場合、posting list split が実行される。
page split と同様に、posting list split は、新しい/到着する item が "won't fit" の状況を解決し、ついでに到着 item を挿入する
(つまり、同じ atomic アクションの一部として)。ほぼ満杯の page への新しい item の insert が posting list と重複し、
posting list split と page split の両方が結果として生じる可能性がある (特に可能性が高いわけではないが)。
それでも、posting list を split する atomic アクションは、新しい item を挿入する (page split は常に新しい item をついでに挿入するため)。
posting list split を insert と同じ atomic アクションに含めることは、同じ posting list への並行 insert によって引き起こされる問題を回避する --
我々が posting list をどのように変更するかの正確な詳細は新しい item に依存し、その逆も同様である。単一の atomic アクションはまた、
posting list split に必要な追加 WAL の volume を最小化する。元の posting list tuple を明示的に WAL log 記録する必要がないためである。

新しい tuple を挿入する同じ atomic アクションに piggy-back するにもかかわらず、posting list split は、insert 自体 (または page split 自体) とは別の、追加のアクションと考えることができる。
posting list split は概念的に、既存の posting list と重複する insert を、最終的な新しい item を posting list のすぐ右に追加する insert に "rewrite" する。
posting list のサイズは変わらないので、page space accounting code は posting list split についてまったく気にする必要はない。
これは我々の設計の重要な利点である。page split point の選択 logic は、posting list split に対処する必要がなくても非常に微妙である。

新しい item が最初に既存の posting list とまったく重複しなかったという illusion を保持するために、いくつかの isolated な追加 step だけが必要である:
到着する tuple の heap TID は、既存/元の重複する posting list からの最右/最大の heap TID で置き換えられる。
同様に、元の到着 item の TID は posting list の適切な offset に再配置される (通常、それのための穴を作るために TID を移動させる)。
最後に、posting-split-with-page-split のケースは、最終的な新しい item と after-list-split posting tuple の両方を持つ元の page の imaginary version に基づいて、新しい high key を生成しなければならない
(page split は通常、新しい item/収まらない item を含む imaginary version に対してのみ動作する)。

このアプローチは、到着 item の insert を同時に終了することなく posting list を split する "eager" な atomic posting split 操作を発明することを回避する。
この代替設計はよりクリーンに見えるかもしれないが、page space accounting に微妙な問題を作成する。一般に、到着/新しい item がどちらかの posting list の半分とも重複しないように
posting list を split するための十分な free space が page に存在しないかもしれない --- 操作は実際の retail insert が始まる前に失敗する可能性がある。
結局、とにかく page split が必要な posting list split を処理しなければならなくなるだろう。さらに、posting list を split する際の可変 "split point" の support は、
実際には全体的な space 利用を改善しない。

## Data 表現に関するメモ

L&Y が要求する right-sibling link は、left-sibling link、page level、およびいくつかの flag と同様に、page の "opaque data" 領域に保持される。
page level は、leaf level での 0 から tree depth マイナス 1 の root まで上向きに count される。
(leaf から上向きに count することで、root を split するときに既存の page を renumber する必要がなくなる。)

Postgres の disk block data 形式 (item の array) は、Lehman と Yao の alternating-keys-and-pointers という disk page の概念に適合しないため、いくつかの trick を使う必要がある。
(alternating-keys-and-pointers の概念は、internal page split にとって重要である。これは概念的に既存の pivot tuple の中央で split する -- tuple の "separator" key は、
split の左側の new high key として左側に行き、tuple の pointer/downlink は、first/minus infinity downlink として右側に行く。)

tree level で最右ではない page では、"high key" は page の最初の item に保持され、real data item は item 2 から始まる。
"high key" item の link 部分は未使用である。最右の page には "high key" がない (暗黙的に positive infinity である)。
そのため、data item は最初の item から始まる。high key を右ではなく左に置くのは奇妙に見えるかもしれないが、
data item を追加するときに high key を移動することを回避する。

leaf page では、data item は単に、関連する key 値を持つ、index 化されている relation 内の tuple への link (TID) である。

non-leaf page では、data item は bounding key を持つ child page への down-link である。各 data item の key は、その child page の key の strict lower bound であるため、
論理的に key はその downlink の左にある。high key (存在する場合) は最後の downlink の upper bound である。そのような各 page の最初の data item には lower bound がない ---
あるいはお望みであれば、minus infinity の lower bound である。比較 routine はそれに応じて扱わなければならない。item に格納される実際の key は無関係であり、まったく格納する必要はない。
この配置は、L&Y の non-leaf page が key よりも 1 つ多い pointer を持つという事実に対応している。Suffix truncation の negative infinity attribute も同じように振る舞う。

src/backend/access/rmgrdesc/README

# WAL resource manager description function

debug 目的のために、各 WAL resource manager ごとに "description function"、
または rmgrdesc function があります。rmgrdesc function は WAL record を parse し、
WAL record の内容をいくらか人間が読みやすい形式で出力します。

すべての resource manager の rmgrdesc function は、stand-alone の pg_waldump program でも
使用されるため、この directory に集められています。これらは out-of-tree の debug tool でも
潜在的に使用される可能性がありますが、description function も出力 format も
stable な API の一部とは見なされるべきではありません。

## rmgrdesc 出力 format のガイドライン

これらのガイドラインの目標は、各 rmgr 間での不必要な不整合を回避し、
user が過度な困難なしに desc 出力 string を parse できるようにすることです。
これは API 仕様や交換 format ではありません。
(現時点で、heapam と nbtree の desc routine のみがこれらのガイドラインに従っています。)

record の説明は JSON style の key/value object に似ています。しかし、
明示的な "string" type や string escape はありません。Top-level の { } 括弧は
省略するべきです。例えば:

snapshotConflictHorizon: 0, flags: 0x03

record の説明には可変長 array が含まれる場合があります。例えば:

nunused: 5, unused: [1, 2, 3, 4, 5]

nested object は { } 括弧によって support されます。これらは一般に
可変長 array の内側に現れます。例えば:

ndeleted: 0, nupdated: 1, deleted: [], updated: [{ off: 45, nptids: 1, ptids: [0] }]

基底となる物理 WAL record struct の field の順序を忠実に表現する順序で
ものを出力するよう試みてください。Key 名は (同じ nest level 内で) 一意であるべきで、
parse を容易にします。array 内の項目数が array の前に現れるのが良い考えです。

個々の WAL record type が独自の慣例を考案するのは構いません。
例えば、Heap2 の PRUNE record description では、record の "redirected" field に対して
custom array format を使用しています:

... redirected: [1->4, 5->9], dead: [10, 11], unused: [3, 7, 8]

おそらく desc routine は代わりに object 記法を使用すべきでしょう。
しかし、基底となる物理 data 構造に関する有用な情報を伝える場合、
custom format を使用することには価値があります。

この ad-hoc な format には、(page offset number array の標準 desc 慣例に従う)
"dead" および "unused" array に使用される format に近いという利点があります。
これは、表示される "redirected" 要素が単に page offset number の pair であることを示唆しています
(実際にはそのように動作します)。

rmgrdesc_utils.c には、この format で data を出力するための helper function が
いくつか含まれています。

src/backend/storage/smgr/README

# Storage Manager

オリジナルの Berkeley Postgres system には、いくつかの storage manager があり、
そのうち "magnetic disk" manager のみが残っています。(Berkeley では
Sony WORM 光ディスク jukebox 用および persistent main memory 用の manager もありましたが、
これらは外部に release された Postgres でも、いかなる version の PostgreSQL でも
support されたことはありません。) "magnetic disk" manager 自体は深刻に誤称されています。
なぜなら実際には、operating system が標準的な filesystem 操作を提供する
あらゆる種類の device を support しているからです; これは今日では関心のあるほとんど
すべてです。しかし、誰かが他の種類の storage manager を再導入したい場合に備えて、
storage manager switch の概念を保持しています。switch layer を削除しても顕著な
節約にはなりません。storage-access 操作は確かに 1 つの追加 C function 呼び出し layer より
はるかに高価だからです。

Berkeley Postgres では、各 relation には使用する storage manager の ID が
tag 付けされていました。これはなくなりました。複数の storage manager を system catalog に
再導入する場合は、storage manager を tablespace に関連付ける方が
おそらくより合理的でしょう。

この directory の file とその内容は次のとおりです:

    smgr.c	storage manager switch の dispatch code。この file の
    	routine は、上位 level の code から要求された storage access を行うために
    	適切な storage manager を呼び出します。smgr.c は file
    	handle cache (SMgrRelation table) も管理します。

    md.c	"magnetic disk" storage manager。これは実際には
    	kernel の filesystem 操作への interface に過ぎません。

md.c は順番に src/backend/storage/file/fd.c に依存していることに注意してください。

# Relation Fork

8.4 以降、単一の smgr relation は、relation fork と呼ばれる複数の
物理 file から構成されることができます。これにより、main data file とは独立して
拡張および truncate 可能な追加 fork に、Free Space 情報のような追加 metadata を格納でき、
それでもなお system catalog では全体を単一の物理 relation として扱うことができます。

main fork、すなわち fork number 0 または MAIN_FORKNUM が常に存在することが
仮定されています。Fork number は src/include/common/relpath.h で割り当てられます。
smgr.c と md.c の function は、access したい relation fork を識別するために、
relfilelocator と block number に加えて追加の fork number 引数を受け取ります。
ほとんどの code は main fork に access したいので、便宜のために MAIN_FORKNUM に
access する ReadBuffer の shortcut version が buffer manager で
提供されています。

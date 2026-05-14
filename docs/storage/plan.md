src/backend/optimizer/plan/README

# Subselects

Vadim B. Mikheev

From owner-pgsql-hackers@hub.org Fri Feb 13 09:01:19 1998
Received: from renoir.op.net (root@renoir.op.net [209.152.193.4])
by candle.pha.pa.us (8.8.5/8.8.5) with ESMTP id JAA11576
for <maillist@candle.pha.pa.us>; Fri, 13 Feb 1998 09:01:17 -0500 (EST)
Received: from hub.org (hub.org [209.47.148.200]) by renoir.op.net (o1/$Revision: 1.14 $) with ESMTP id IAA09761 for <maillist@candle.pha.pa.us>; Fri, 13 Feb 1998 08:41:22 -0500 (EST)
Received: from localhost (majordom@localhost) by hub.org (8.8.8/8.7.5) with SMTP id IAA08135; Fri, 13 Feb 1998 08:40:17 -0500 (EST)
Received: by hub.org (TLB v0.10a (1.23 tibbs 1997/01/09 00:29:32)); Fri, 13 Feb 1998 08:38:42 -0500 (EST)
Received: (from majordom@localhost) by hub.org (8.8.8/8.7.5) id IAA06646 for pgsql-hackers-outgoing; Fri, 13 Feb 1998 08:38:35 -0500 (EST)
Received: from dune.krasnet.ru (dune.krasnet.ru [193.125.44.86]) by hub.org (8.8.8/8.7.5) with ESMTP id IAA04568 for <hackers@postgreSQL.org>; Fri, 13 Feb 1998 08:37:16 -0500 (EST)
Received: from sable.krasnoyarsk.su (dune.krasnet.ru [193.125.44.86])
by dune.krasnet.ru (8.8.7/8.8.7) with ESMTP id UAA13717
for <hackers@postgreSQL.org>; Fri, 13 Feb 1998 20:51:03 +0700 (KRS)
(envelope-from vadim@sable.krasnoyarsk.su)
Message-ID: <34E44FBA.D64E7997@sable.krasnoyarsk.su>
Date: Fri, 13 Feb 1998 20:50:50 +0700
From: "Vadim B. Mikheev" <vadim@sable.krasnoyarsk.su>
Organization: ITTS (Krasnoyarsk)
X-Mailer: Mozilla 4.04 [en] (X11; I; FreeBSD 2.2.5-RELEASE i386)
MIME-Version: 1.0
To: PostgreSQL Developers List <hackers@postgreSQL.org>
Subject: [HACKERS] Subselects are in CVS...
Content-Type: text/plain; charset=us-ascii
Content-Transfer-Encoding: 7bit
Sender: owner-pgsql-hackers@hub.org
Precedence: bulk
Status: OR

これはいくつかの implementation note と open issue です...

まず、implementation は correlation Var を扱うために新しい type の parameter - PARAM_EXEC - を使用します。
query_planner() が呼び出されると、最初に current query で参照されているすべての upper query の Var を
この type の Param で replace しようとします。いくつかの global variable を使用して、Var と Param の mapping、
Param と Var の mapping を保持します。

この後、current query のすべての SubLink が処理されます: query の qual で見つかった各 SubLink に対して
union*planner() (古い planner() function) が呼び出され、対応する subselect を plan します
(union_planner() は "simple" query に対して query_planner() を呼び出し、UNION を support します)。
subselect が plan された後、optimizer は、これが correlated、un-correlated、または \_undirect* correlated
(一部の grand-parent Var を参照するが parent ones は参照しない: parent の point of view からは uncorrelated) query であるかを認識します。

uncorrelated および undirect correlated な EXPRession または EXISTS 型 SubLink の subquery では、SubLink->Oper list からの
"normal" な clause で replace されます (この list を単なる Oper のものではなく EXPR node の list に変更しました)。
これらの node の right side は PARAM*EXEC parameter で replace されます。これは新しい parameter type の 2 番目の使用です。
run-time に、これらの parameter は、subquery の evaluation の結果から (つまり、subquery の target list から) value を取得します。
subquery 自体の execution plan は parent query の init plan になります。InitPlan は、subquery の結果から value を取得する
parameter を知っており、"on-demand" で execute されます (query select \* from table where x > 0 and
y > (select max(a) from table_a) の場合、x > 0 でかつ y が index scan で使用されない
tuple がない場合、subquery はまったく execute されません)。

他のすべての type の subquery に対する SubLink は、新しい type の Expr node - SUBPLAN*EXPR に transform されます。
Expr->args は単に \_parent* query からの correlation variable です。Expr->oper は新しい SubPlan node です。

この node は InitPlan にも使用されます。これは、subquery の range table、_parent_ query の Var から
(つまり、Expr->args から) value を取得する Param の index、subquery の結果が substitute される Param の
index (これは InitPlan のため)、SubLink、および subquery の execution plan を保持します。

Plan node は、parent query と InitPlan の Param への dependency を認識し、changed Param (上記から) の
list を保持して、この list が NULL でなければ re-scan されるように変更されました。
また、InitPlan の list (実際、current query 用のすべてが現在 topmost plan node にあります) と他の
SubPlan (plan->qual から) も追加されました - これらを initialize し、changed Param について
それらの "interests" の list から知らせるためです。

すべての SubLink が処理された後、query_planner() は qual の canonificator を呼び出し、"normal" な作業を行います。
Param を使用することで、optimizer はほとんど変更されていません。

さて、Executor について。subplan を ExecutorStart() と ExecutorEnd() なしで (relation と
index の open と close なしで、また多くの palloc() と pfree() なしで - これは SQL-func が各 call で
行うことです) re-evaluate するために、ExecReScan() は現在、ほとんどの Plan type を support しています...

Explanation of EXPLAIN.

vac=> explain select _ from tmp where x >= (select max(x2) from test2
where y2 = y and exists (select _ from tempx where tx = x));
NOTICE: QUERY PLAN:

Seq Scan on tmp (cost=40.03 size=101 width=8)
SubPlan
^^^^^^^ subquery は Seq Scan の qual にあり、その plan は以下
-> Aggregate (cost=2.05 size=0 width=0)
InitPlan
^^^^^^^^ EXISTS subsubquery は subquery の InitPlan
-> Seq Scan on tempx (cost=4.33 size=1 width=4)
-> Result (cost=2.05 size=0 width=0)
^^^^^^ EXISTS subsubquery は Param に transform されたので
ここに Result node がある
-> Index Scan on test2 (cost=2.05 size=1 width=4)

Opened issues.

1. read permission の checking なし (easy、まだ行われていないだけ)。
2. readfuncs.c は subplan-s を read できない (easy、critical ではない、
   現在、execution plan の ascii representation をどこでも使用しないため)。
3. ExecReScan() はすべての plan type を support していない。少なくとも MergeJoin の
   support を実装する必要がある。
4. ExecReScan() の memory leak。
5. advice が必要です: NOT IN で導入された subquery が tuple を返さない場合、
   qualification は failed ですか?
6. Regression tests !!!!!!!!!!!!!!!!!!!!
   (MySQL の crash.me の data/query を使用できるか?
   Copyright-ed か? 彼らは我々に right を与えてくれるか?)
7. Performance.
      - subquery が InitPlan に transform されたときは良いはず。
      - ANY/ALL で導入された uncorrelated な subquery に対しては何かすべき - 考慮中。
        現在、subplan は各 parent tuple に対して re-scan される - 非常に遅い...

いくつかの test の結果。TMP は x, y (int4-s) を持つ table で、x は 0-9、
y = 100 - x、1000 tuple (各 tuple 10 duplicate)。TEST2 は x2, y2 (int4-s) を持つ table で、
x2 は 1-99、y2 = 100 - x2、10000 tuple (100 dups) です。

Trying

select \* from tmp where x >= (select max(x2) from test2 where y2 = y);

and

begin;
select y as ty, max(x2) as mx into table tsub from test2, tmp
where y2 = y group by ty;
vacuum tsub;
select x, y from tmp, tsub where x >= mx and y = ty;
drop table tsub;
end;

test2(y2) に index なし:

SubSelect -> 320 sec
temp table を使用 -> 32 sec

index あり

SubSelect -> 17 sec (2M の memory)
temp table を使用 -> 32 sec (12M の memory: -S 8192)

Vadim

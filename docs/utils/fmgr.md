src/backend/utils/fmgr/README

# Function Manager

[このファイルはもともと V0 から V1 interface への移行を説明していました。
現在は V1 interface に関する内部実装と設計の根拠のみを説明しています。
V0 interface は既に削除されています。]

## The V1 Function-Manager Interface

設計の中核は、function lookup の結果を表現するための data structure と、
特定の function invocation に渡される parameter を表現するための data structure です。
(function lookup を function call から分離しておきたいのは、
system の多くの部分が同じ function を繰り返し適用するためです。
lookup overhead は tuple ごとではなく query ごとに 1 回支払うべきです。)

pg_proc で function が lookup されると、結果は次のように表現されます。

typedef struct
{
PGFunction fn_addr; /_ pointer to function or handler to be called _/
Oid fn_oid; /_ OID of function (NOT of handler, if any) _/
short fn_nargs; /_ number of input args (0..FUNC_MAX_ARGS) _/
bool fn_strict; /_ function is "strict" (NULL in => NULL out) _/
bool fn_retset; /_ function returns a set (over multiple calls) _/
unsigned char fn_stats; /_ collect stats if track_functions > this _/
void _fn_extra; /_ extra space for use by handler _/
MemoryContext fn_mcxt; /_ memory context to store fn_extra in */
Node *fn_expr; /_ expression parse tree for call, or NULL _/
} FmgrInfo;

通常の built-in function の場合、fn_addr は function を実装している C routine の
address そのものです。それ以外の場合は、対象となる function を含む function class に対する
handler の address です。handler は、function OID と必要に応じて fn_extra slot を使用して、
実行する具体的な code を見つけることができます。(fn_oid = InvalidOid は、
まだ初期化されていない FmgrInfo struct を示すために使用できます。
fn_extra は、FmgrInfo が function lookup code によって最初に埋められたときは常に NULL ですが、
function handler は、同じ FmgrInfo が query 中に繰り返し使用されるときに、
自身の lookup を繰り返し行わないようにするためにこれを設定することができます。)
fn_nargs は function が期待する argument の数、fn_strict はその strictness flag、
fn_retset は set を返すかどうかを示します。これらの値はすべて function の pg_proc entry から取得されます。
fn_stats は、この function を呼び出すための runtime statistics を track するかどうかを制御するためにも設定されます。

function が SQL expression の一部として呼ばれている場合、fn_expr はその function call の
expression parse tree を指します。これを使用して、実際の argument に関する parse-time の知識を抽出できます。
このフィールドは function に関する情報というよりは argument に関する情報ですが、
論理的には FunctionCallInfoBaseData に置く方が自然である一方、
FmgrInfo に保持する方が便利であることが判明しています。

function の呼び出し中には、次の data structure が作成されて function に渡されます。

typedef struct
{
FmgrInfo _flinfo; /_ ptr to lookup info used for this call */
Node *context; /_ pass info about context of call _/
Node _resultinfo; /_ pass or return extra info about result _/
Oid fncollation; /_ collation for function to use _/
bool isnull; /_ function must set true if result is NULL _/
short nargs; /_ # arguments actually passed _/
NullableDatum args[]; /_ Arguments passed to function _/
} FunctionCallInfoBaseData;
typedef FunctionCallInfoBaseData_ FunctionCallInfo;

flinfo は呼び出しの実行に使われた lookup info を指します。通常の function は
おそらくこのフィールドを無視しますが、function class handler は呼び出されている
特定の function の OID を見つけるためにこれを必要とします。

context は「通常の」function call では NULL ですが、特定の context で function が
呼び出される場合は追加情報を指す可能性があります。(例えば、trigger manager は
ここで現在の trigger event に関する情報を渡します。) 詳細については、
後述の "Function Call Contexts" を参照してください。

resultinfo は単純な Datum の結果が期待される function を呼び出すときは NULL です。
function が Datum 以上のものを返す場合は、Node の subtype を指す可能性があります。
(例えば、後述のように set を返す function を呼び出すときに resultinfo が使用されます。)
context フィールドと同様、resultinfo は拡張のための hook であり、
fmgr 自体はこのフィールドの使用を制限しません。

fncollation は、parser が導出した入力 collation、または collatable type の入力がない場合や、
共通の collation を共有しない場合には InvalidOid です。これは事実上、隠れた追加 argument であり、
collation-sensitive な function はその動作を決定するために使用できます。

nargs と args[] は function に渡されている argument を保持します。
function に渡されるすべての argument (および結果値) は、現在ではすべて Datum type として
統一的に扱われていることに注意してください。後述のように、caller と callee は、
特定の function の実際の argument type に変換するために、標準の Datum 変換 macro を適用すべきです。
args[i].isnull が true のとき、args[i].value の値は未定義です。

通常、渡される argument の数が callee が期待しているものと一致することを保証するのは
caller の責任です。可変数の argument を取る callee を除いて、callee は通常 nargs
フィールドを無視し、args[] から値を取得するだけです。

isnull フィールドは呼び出し前に "false" に初期化されます。function からの return 時、
isnull は function 結果の null flag です: もしこれが true なら、実際の function の return 値に関わらず、
function の結果は NULL です。単純な "strict" function は、args[].isnull に TRUE 値が
あるときには呼び出されもしないため、isnull と args[i].isnull の両方を無視できることに注意してください。

FunctionCallInfo は、FmgrValues に加えて多数の ad-hoc な parameter convention、
global variable (少なくとも fmgr_pl_finfo と CurrentTriggerData)、
およびその他の見苦しい要素を置き換えます。

callee は、個々の function であろうと function handler であろうと、常に次の signature を持ちます。

Datum function (FunctionCallInfo fcinfo);

これは次の typedef で表現されます。

typedef Datum (\*PGFunction) (FunctionCallInfo fcinfo);

function は、Datum として表現される結果を返すとともに、fcinfo->isnull を適切に設定する責任があります。
すべての callee がまったく同じ signature を持ち、まったく同じ signature で宣言された
function pointer を通じて呼び出されることになるので、portability や optimization の問題は発生しないはずです。

## Function Coding Conventions

ここでは提案されている macro と coding convention を示します。

fmgr-callable function の定義は常に次のような形になります。

Datum
function_name(PG_FUNCTION_ARGS)
{
...
}

"PG_FUNCTION_ARGS" は "FunctionCallInfo fcinfo" に展開されるだけです。
この macro を使用する主な理由は、script が function 定義を見つけやすくするためです。
ただし、calling convention を再度変更することにした場合、この macro が用意されていると便利かもしれません。

非 strict function は、各 argument が null かどうかを確認する責任があり、これは PG_ARGISNULL(n)
(これは単に "fcinfo->args[n].isnull" です) で実行できます。null である argument の値を取得しようとすることは避けるべきです。

strict function と非 strict function のどちらも、必要に応じて NULL を返すことができます。
PG_RETURN_NULL();
これは次のように展開されます。
{ fcinfo->isnull = true; return (Datum) 0; }

argument の値は通常、次のような code を使って取得されます。
int32 name = PG_GETARG_INT32(number);

float4、float8、および int8 については、PG_GETARG macro は type が pass-by-value か pass-by-reference か
を隠蔽します。例えば、float8 が pass-by-reference の場合、PG_GETARG_FLOAT8 は
(_ (float8 _) DatumGetPointer(fcinfo->args[number].value))
に展開され、通常は次のように呼び出されます。
float8 arg = PG_GETARG_FLOAT8(0);
今となっては歴史的な理由により、float 関連の typedef と macro は型の幅を byte (4 または 8)
で表現していますが、integer type については幅を bit で label 付けすることを好みます。

非 NULL 値は、適切な type の PG_RETURN_XXX macro で返されます。
例えば、PG_RETURN_INT32 は次のように展開されます。
return Int32GetDatum(x)
PG_RETURN_FLOAT4、PG_RETURN_FLOAT8、PG_RETURN_INT64 は、必要に応じて palloc を行うことで、
data type が pass-by-value か pass-by-reference かを隠蔽します。

fmgr.h はすべての基本 data type のための PG_GETARG macro と PG_RETURN macro を提供します。
特殊化された SQL datatype (timestamp など) を定義する module や header file は、
それらの type に対する適切な macro を定義すべきです。これにより、その type を操作する function を
標準的なスタイルで coding できます。

非 primitive な data type (特に variable-length type) では、data type の pass-by-reference の性質を隠蔽することは
あまり実用的ではないので、それらの type に対する PG_GETARG macro と PG_RETURN macro は、
DatumGetPointer/PointerGetDatum と適切な typecast を行うだけです (ただし、後述の TOAST
の議論を参照してください)。そのような type を返す function は、結果領域を明示的に palloc()
する必要があります。これらの type の GETARG macro と RETURN macro には、pointer を生成または
受け取ることを示すために、末尾に "\_P" を付けて命名することをお勧めします。
例えば、PG_GETARG_TEXT_P は "text \*" を返します。

function が fcinfo->flinfo や FunctionCallInfo の他の auxiliary field にアクセスする必要があるときは、
そのまま行うべきです。これらのケースに syntactic-sugar macro を提供することが役立つとは思えません。

## Support for TOAST-Able Data Types

TOAST-able data type では、PG_GETARG macro は de-TOAST された data 値を提供します。
TOAST されたままの値が必要なケースもいくつかあるかもしれませんが、大多数のケースでは
de-toast された結果が望まれるため、それが default になります。de-toasting を引き起こさずに
argument 値を取得するには、PG_GETARG_RAW_VARLENA_P(n) を使用します。

一部の function は、入力値の変更可能な copy を必要とします。これらの場合、de-TOAST のために
data を copy したのであれば、追加の copy step を行うのは馬鹿げています。そのため、
各 toastable datatype には追加の fetch macro があり、例えば PG_GETARG_TEXT_P_COPY(n) は、
可能な場合は detoasting step と組み合わせて、確実に新しい copy を提供します。

PG_FREE_IF_COPY(ptr,n) macro もあり、これは与えられた pointer が n 番目の argument の元の値と
異なる場合に限り、その pointer を pfree します。これは、n 番目の argument が実際に de-toast
された場合に、その de-toast された値を free するために使用できます。現在、これを行うことは、
core backend code が temporary space を定期的に release するため、ほとんどの function では必要ではなく、
function 実行中に leak した memory は大きな問題にはなりません。ただし、7.1 以降、index search で
呼び出される function の memory leak は transaction が終了するまで clean up されません。
そのため、pg_amop や pg_amproc に list されている function は、detoast された copy を leak しないように
注意する必要があり、これらの function は toastable input に対して PG_FREE_IF_COPY() を使用する必要があります。

function は決して結果値を re-TOAST しようとすべきではありません。現在の memory context で
palloc されている untoasted な結果を提供するだけでよいです。値が実際に tuple に格納されるとき、
tuple toaster が toasting が必要かどうかを判断します。

## Function Call Contexts

caller が fcinfo->context に非 NULL pointer を渡す場合、それは Node の何らかの
subtype を指す必要があります。context の特定の種類は node type field によって示されます。
(callee は、どのような種類の context が渡されているかを知ったと想定する前に、
IsA() を介して常に node type を確認すべきです。) fmgr 自体は、このフィールドの使用について
他の制限を設けていません。

この convention の現在の使用例には以下が含まれます。

- Trigger function には struct TriggerData の instance が渡され、trigger context に関する
  情報が含まれます。(trigger function は通常の argument を受け取りません。) 詳細と trigger function で
  一般的に使用される macro については、commands/trigger.h を参照してください。

- Aggregate function (より正確には、その transition function と final function) は、struct AggState の
  instance を渡されます。これは caller の Agg plan node の executor state node です。
  window function として呼び出される場合は、struct WindowAggState の instance を受け取ります。
  これらの pointer は AggCheckCallContext() および sibling function を介してのみ使用することが
  推奨されます。これらは fmgr.h で宣言されていますが、source code は
  src/backend/executor/nodeAgg.c にのみ document 化されています。通常、これらの
  context node は、transition function と final function が、standalone な SQL function としてではなく
  aggregate 内で使用されていることを知ることに基づいて実行を最適化したい場合にのみ重要となります。

- 真の window function は struct WindowObject の instance を受け取ります。
  (trigger function と同様、通常の argument は受け取りません。)
  詳細については windowapi.h を参照してください。

- Procedure は struct CallContext の instance を渡され、CALL statement の
  context に関する情報、特に "atomic" な実行 context 内かどうかが含まれます。

- datatype input function の一部の caller (将来的にはおそらく他の class の function も) は、
  ErrorSaveContext の instance を渡します。これは、caller が transaction-terminating な
  exception を throw せずに "soft" error を処理したいことを示します。代わりに、callee は
  error 原因に関する情報を ErrorSaveContext struct に保存して、dummy の結果値を返す必要があります。
  詳細については、後述の "Handling Soft Errors" を参照してください。

## Handling Soft Errors

PostgreSQL の標準的な error 報告 mechanism (ereport() または elog()) は、あらゆる種類の
error 条件に使用されます。これは、ereport(ERROR) を介して exception を throw するには、
高価な transaction または subtransaction の abort と cleanup が必要であることを
意味します。exception catcher は何が悪かったのかについて多くの仮定をすることができないからです。
完全な transaction cleanup なしで recover できることが分かっている error を処理するために、
より軽量な mechanism が望まれる場合があります。SQL-callable function は、ErrorSaveContext
context mechanism を使用してこのニーズをサポートできます。

"soft" error を報告するには、SQL-callable function は、以前は
ereport(ERROR, ...)
としていた箇所で
errsave(fcinfo->context, ...)
を呼び出すべきです。
渡された "context" が NULL または ErrorSaveContext node でない場合、
errsave は ereport(ERROR) とまったく同じように動作します。exception は longjmp を介して throw され、
制御は戻りません。"context" が ErrorSaveContext node である場合、errsave の subsidiary な reporting call に
含まれる error 情報は context node に保存され、制御は errsave から正常に戻ります。
その後、function は caller に dummy 値を返すべきです。(dummy 値としては SQL NULL を推奨しますが、
何でも構いません。caller は error が ErrorSaveContext node で報告されたことを確認した時点で
function の return 値を無視することが期待されているためです。)

errsave() を呼び出した後、return 以外に何もすることがない場合、
ereturn(fcinfo->context, dummy_value, ...)
と書くことで、errsave() を実行してから "return dummy_value" するということを行い、1〜2 行節約できます。

"softly" に報告された error は、transaction の通常の処理を継続する能力に
問題がないという意味で安全でなければなりません。この方法で処理すべきでない error 条件には、
out-of-memory、予期しない internal error、または簡単に clean up できないものが含まれます。
そのようなケースは、以前と同様、ereport で throw されるべきです。

datatype input function を例として考えると、典型的な "soft" error 条件には input syntax error や
range 外の値が含まれます。input function は通常、単純な if-test でこれらのケースを検出するので、
それに続く ereport call を errsave または ereturn に変えることは簡単にできます。
この制限により、通常、ErrorSaveContext pointer を非常に下層まで渡す必要はありません。
low-level function によって報告される error は通常、internal とみなすことが妥当だからです。
(この区別を表現する別の方法として、input function はすべての invalid-input 条件を softly に報告すべきですが、
internal な問題は hard error であるべきだ、というものです。)

transaction cleanup は発生しないので、errsave() からの return 後に exit する
function は、resource cleanup の責任を負います。palloc された memory の小さな leak については
気にする必要はありません。caller は short-lived な memory context 内で function を実行しているはずだからです。
ただし、lock、open file、buffer pin などの resource は、non-error の code path で
行うように、きれいに close out する必要があります。

error を trap するために ErrorSaveContext mechanism を使用する caller の convention は、
nodes/miscnodes.h のその struct の宣言とともに議論されています。

## Functions Accepting or Returning Sets

function が pg_proc で set を返すと mark されている場合、ReturnSetInfo 型の node を指す
fcinfo->resultinfo とともに呼び出されます。set を返したい function は、resultinfo が NULL であるか
ReturnSetInfo node を指していない場合、error "called in context that does not accept
a set result" を発生させるべきです。

現在、function が set 結果を返すことができる mode は 2 つあります: value-per-call または
materialize です。value-per-call mode では、function は呼び出されるたびに 1 つの値を返し、
最終的に返す値がなくなったときに "done" を報告します。materialize mode では、
function の output set は Tuplestore object 内に instantiate され、すべての値が 1 回の呼び出しで
返されます。将来的には mode が追加される可能性があります。

ReturnSetInfo には "allowedModes" という field が含まれており、(caller によって)
caller が support できる mode の OR の bitmask に設定されます。function によって実際に使用される
mode は、別の field "returnMode" に返されます。後方互換性の理由から、returnMode は
value-per-call に初期化されており、function が別の mode を使用したい場合にのみ変更する必要があります。
function は、caller が support する意思のあるどの mode も使用できない場合、ereport() すべきです。

value-per-call mode は次のように動作します。ReturnSetInfo には "isDone" という field が含まれており、
これらの値のいずれかに設定する必要があります:

    ExprSingleResult             /* expression does not return a set */
    ExprMultipleResult           /* this result is an element of a set */
    ExprEndResult                /* there are no more elements in the set */

(caller はこれを ExprSingleResult に初期化します。) function が ReturnSetInfo に触れずに
単に Datum を返す場合、呼び出しは終了し、single-item set が返されたことになります。set を返すには、
function は各 set element に対して isDone を ExprMultipleResult に設定する必要があります。
すべての element が返された後、次の呼び出しでは isDone を ExprEndResult に設定し、null result を
返すべきです。(最初の呼び出しでこれを行うことで、empty set を返すこともできることに注意してください。)

value-per-call function は、completion まで実行されることを想定してはいけません。例えば、LIMIT のために
executor が単に呼び出すのをやめる可能性があります。そのため、最後の呼び出しで resource
cleanup を実行しようとするのは安全ではありません。通常、memory の cleanup は
必要ありません。file descriptor などの他の種類の resource を cleanup する必要がある場合は、
ReturnSetInfo node が指す ExprContext に shutdown callback function を登録できます。
(ただし、file descriptor は限られた resource なので、一般的に呼び出し間で open したままにすることは
賢明ではありません。file access が必要な SRF は、Materialize mode を使用して 1 回の
呼び出しで行う方が良いでしょう。)

Materialize mode は次のように動作します。function は (おそらく empty の) result set を保持する Tuplestore
を作成し、それを返します。複数回の呼び出しはありません。function はまた、tuple structure を示す TupleDesc
を返す必要があります。Tuplestore と TupleDesc は、context econtext->ecxt_per_query_memory
で作成する必要があります (これは function が呼び出される context とは _異なる_ ことに注意してください)。
function は Tuplestore と TupleDesc への pointer を ReturnSetInfo に保存し、materialize mode を示すために
returnMode を設定し、null を返します。isDone は使用されず、ExprSingleResult のままにすべきです。

allowedModes に SFRM_Materialize_Random が設定されている場合、Tuplestore は
randomAccess = true で作成する必要がありますが、そうでない場合は randomAccess = false で
作成できます (好ましくはそうすべきです)。ValuePerCall mode と Materialize mode の両方を
support できる caller は、好みに応じて SFRM_Materialize_Preferred を設定するか設定しません。

利用可能な場合、期待される tuple descriptor は ReturnSetInfo で渡されます。それ以外の context では、
expectedDesc field は NULL になります。function は expectedDesc に注意を払う必要はありませんが、
特殊なケースで役立つことがあります。

InitMaterializedSRF() は helper function であり、Materialize mode の適切な configuration で Tuplestore と
TupleDesc を埋めながら、single call のために function の ReturnSetInfo を setup できます。

set を受け入れる function の support はありません。代わりに、input set の各 element ごとに function が複数回呼び出されます。

## Notes About Function Handlers

function の class 用の handler は、この設計の中ではるかに楽で clean な生活を送ることができるはずです。
呼ばれた function の OID は渡された parameter から直接到達可能です。global variable の fmgr_pl_finfo は
もう必要ありません。また、fcinfo->flinfo->fn_extra を変更することにより、handler は lookup
情報を cache して、同じ function が何度も呼び出されるときの繰り返しの lookup を避けることができます。
(fn_extra は hint としてのみ使用できます。caller は FmgrInfo struct を再利用することを
要求されていないからです。しかし、performance が重要な path では通常そうします。)

handler が fn_extra data を保持するために memory を割り当てたい場合、CurrentMemoryContext で
それを行うべきではありません。current context は FmgrInfo が存在する context よりもはるかに
short-lived である可能性があるからです。代わりに、context flinfo->fn_mcxt または long-lived な cache
context で memory を割り当てます。fn_mcxt は通常、FmgrInfo struct が作成された時点での
CurrentMemoryContext だった context を指します。いずれにしても、FmgrInfo 自体と同じくらい
long-lived な context である必要があります。

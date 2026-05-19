src/backend/utils/misc/README

# GUC 実装に関する Notes

GUC (Grand Unified Configuration) モジュールは、複数の型 (現在は boolean、enum、int、real、string)
の configuration 変数を実装しています。
変数の settings は様々な場所から行うことができ、priority ordering によってどの setting が使用されるかが決まります。

## Per-Variable Hooks

GUC が認識する各変数には、customized behavior を提供するために、
オプションで check_hook、assign_hook、および/または show_hook を設定できます。
Check hooks は、変数値の validity checking (GUC が行う以上のもの) を実施するため、
非自明な作業が必要な derived settings を計算するため、
そしてオプションで user-supplied values を「canonicalize」するために使用されます。
Assign hooks は、GUC 変数が設定されたときに変更する必要のある derived state を update するために使用されます。
Show hooks は、変数のデフォルト SHOW display を変更するために使用されます。

check_hook が提供される場合、それは以下の signature を持つ関数を指します:
bool check_hook(datatype _newvalue, void \*\*extra, GucSource source)
"newvalue" 引数は、bool、int/enum、real、string 変数に対してそれぞれ bool _、int _、double _、char \*\* 型です。
check 関数は提案された新しい値を validate し、問題なければ true を、そうでなければ false を返します。
関数はオプションで他にもいくつかのことを行えます:

- 不正な提案値を reject する際、guc.c が出力する一般的な "invalid value for parameter FOO" の complaint に
  追加情報を append すると便利な場合があります。そのためには
  void GUC_check_errdetail(const char *format, ...)
  を呼び出します。format string と additional arguments は errdetail() の引数 rules に従います。
  結果として得られる string は guc.c の error report の DETAIL line として emit されるため、
  DETAIL messages の message style guidelines に従う必要があります。また
  void GUC_check_errhint(const char *format, ...)
  もあり、これも同様の方法で HINT message を append するために使用できます。
  時には guc.c の generic primary message や error code を override するのが appropriate な場合もあり、
  これは以下で行えます:
  void GUC_check_errcode(int sqlerrcode)
  void GUC_check_errmsg(const char \*format, ...)
  一般に、check_hooks は可能であれば error を直接 throw することを避けるべきですが、
  out-of-memory のような一部の corner cases では避けることが impractical かもしれません。

- newvalue は pass-by-reference なので、関数はそれを modify できます。
  これは例えば、string value の spelling を canonicalize したり、buffer size を最も近い supported value に round off したり、
  "-1" のような special value を computed default value で置き換えたりするために使えます。
  関数が string value を replace したい場合、replacement value を guc_malloc (palloc ではなく) し、
  previous value を必ず guc_free() しなければなりません。

- user name で represent される role OID のような derived information は、assign hook で使用するために store できます。
  これを行うには、その情報のために guc_malloc (palloc ではなく) で storage space を確保し、
  そのアドレスを *extra で返します。
  関連付けられた GUC setting がもはや関心の対象でなくなったとき、guc.c は自動的にこの space を guc_free() します。
  *extra は呼び出し前に NULL に initialize されるため、必要なければ ignore できます。

"source" 引数は提案された新しい値の source を示します。
それが >= PGC_S_INTERACTIVE であれば、interactive な assignment (例: SET command) を実行しています。
しかし source < PGC_S_INTERACTIVE のときは、postgresql.conf のような non-interactive option source を
読み込んでいます。
これは、setting が allow されるべきかどうかを判断するために時折必要です。
check_hook は、何が allow されるかを判断するために変数の現在の actual value を見ることもあります。

check hooks は、実際に setting を変更する intention なしに、単に値を validate するためだけに呼ばれることもあることに注意してください。
したがって、check hook は assignment が発生するという仮定に基づいて、いかなる action も取ってはいけません。

assign_hook が提供される場合、それは以下の signature を持つ関数を指します:
void assign_hook(datatype newvalue, void \*extra)
ここで "newvalue" の型は変数の kind と一致し、"extra" は check_hook が返した derived-information pointer です
(check_hook がない場合は常に NULL)。この関数は、変数の value を実際に設定する直前に呼ばれます
(したがって、例えば値が実際には changing していないときに work を行わないようにするために、
actual variable を見て old value を判定することができます)。

failure result code の provision はないことに注意してください。
assign_hooks は、failure が例えば transaction abort 中に GUC settings が properly に rollback されない事態を招く可能性があるため、
最も深刻な状況を除いて決して fail すべきではありません。
一般的には、conceivably に fail する可能性のあることはすべて代わりに check_hook で行い、結果を "extra" struct に渡して、
assign hook がデータをどこかに copy する以外にはほとんど何もしないようにしてください。
これは特に catalog lookups に当てはまります: 必要な lookups は check_hook で行う必要があります。
なぜなら、assign_hook は transaction rollback 中に execute される可能性があり、
その際 lookups は unsafe であるためです。

check_hooks は any transaction の外でも呼ばれることがあることにも注意してください。
これは、wired-in "bootstrap" value、postmaster の command line や environment から来る値、
あるいは postgresql.conf から来る値を processing するときに発生します。
したがって、check_hook で行われる catalog lookups は IsTransactionState() test で guard されるべきであり、
transaction 内での GUC setting の最初の subsequent use 時に derived values を compute できる fallback path が必要です。
typical な arrangement は、check_hook によって compute され assign_hook によって install された catalog values が、
新しい setting が行われた transaction の remainder でのみ使用されるというものです。
subsequent な各 transaction は、最初の use 時に値を fresh に lookup します。
この arrangement は、transaction の外で GUC values を check する必要があるという problem とは independently に、
stale catalog values の使用を prevent するのに有用です。

show_hook が提供される場合、それは以下の signature を持つ関数を指します:
const char \*show_hook(void)
この hook は、SHOW (および GUC 変数値を表示する他の SQL features) によって display される value の
variable-specific computation を可能にします。
show 関数は reentrantly に使用されないため、return value は static buffer を指してもかまいません。

## GUC 変数値の Saving/Restoring

configuration variables の prior values は、いくつかの special cases に対処するために remember される必要があります:
RESET (別名 SET TO DEFAULT)、transaction abort 時の SET の rollback、
transaction end 時 (commit または abort) の SET LOCAL の rollback、
そして SET option を持つ関数の前後での save/restore。
RESET は、current session で SET commands が一度も実行されていなかった場合に effective となる value を
select するものと定義されています。

これらの cases を処理するためには、各変数について多くの distinct values を track する必要があります。
primary values は:

- actual variable contents 常に current effective value

- reset_val RESET に使用する value

(各 GUC entry にはまた、wired-in default value である boot_val があります。
これは InitializeGUCOptions() 中に reset_val と actual variable に assign されます。
SIGHUP processing が、以前 postgresql.conf で指定されていた variable がそこにもう set されていないことを発見した場合に、
correct な reset_val を restore するためにも boot_val が consult されます。)

primary values に加えて、将来 restore する必要があるかもしれない former effective values の stack があります。
Stacking と unstacking は GUC "nest level" によって control されます。
これは any transaction の外では 0、top transaction level では 1、
SET option 付きの各 open subtransaction または function call ごとに increment されます。
stack entry は、GUC variable が given な nesting level で最初に modify されたときに作成されます。
(注: reset_val は non-transactional operations によってのみ変更されるため、stack する必要はありません。)

stack entry は state、GUC variable の prior value、その prior value の remembered source を持ち、
state に依存して "masked" value も持つことがあります。
masked value は、SET の後に SET LOCAL が same nest level で発生したときに必要です:
SET の value は mask されますが、transaction commit 後に restore するために remember する必要があります。

initialization 中、highest priority を持つ non-interactive source に基づいて actual value と reset_val を set します。
これらは same value になります。

GUC value に対する possible な transactional operations は:

SET option を持つ関数への Entry:

    prior variable value と state SAVE を持つ stack entry を push し、
    その後 variable を set する。

Plain な SET command:

    current level の stack entry がない場合:
    	prior value と state SET を持つ new stack entry を push
    そうでなく、stack entry の state が SAVE、SET、または LOCAL の場合:
    	stack state を SET に change し、saved value は change しない
    	(ここでは prior set action の effects を forget する)
    それ以外 (entry の state は SET+LOCAL でなければならない):
    	その masked value を discard し、state を SET に change
    	(ここでは prior SET と SET LOCAL の effects を forget する)
    そして new value を set する。

SET LOCAL command:

    current level の stack entry がない場合:
    	prior value と state LOCAL を持つ new stack entry を push
    そうでなく、stack entry の state が SAVE、LOCAL、または SET+LOCAL の場合:
    	stack entry には no change
    	(SAVE case では、SET LOCAL は func exit 時に forget される)
    それ以外 (entry の state は SET でなければならない):
    	current active を masked slot に put し、state を SET+LOCAL に set
    そして new value を set する。

Transaction または subtransaction abort:

    top < subxact depth になるまで、stack entries を pop して prior value を restore する

Transaction または subtransaction commit (successful function exit を含む):

    stack entry level >= subxact depth である間

    	entry の state が SAVE の場合:
    		pop して prior value を restore
    	そうでなく、level が 1 で entry の state が SET+LOCAL の場合:
    		pop して *masked* value を restore
    	そうでなく、level が 1 で entry の state が SET の場合:
    		pop して old value を discard
    	そうでなく、level が 1 で entry の state が LOCAL の場合:
    		pop して prior value を restore
    	そうでなく、exactly level N-1 の entry がない場合:
    		entry の level を decrement し、other state change はしない
    	それ以外:
    		以下に specify するように level N-1 と N の entries を merge する

merged entry は level N-1 と prior = older prior を持つので、
older entry を keep して newer を free するのが最も easy です。
すでに level N state = SAVE は処理したので、12 の possibilities があります:

N-1 N

SAVE SET discard top prior, set state SET
SAVE LOCAL discard top prior, no change to stack entry
SAVE SET+LOCAL discard top prior, copy masked, state S+L

SET SET discard top prior, no change to stack entry
SET LOCAL copy top prior to masked, state S+L
SET SET+LOCAL discard top prior, copy masked, state S+L

LOCAL SET discard top prior, set state SET
LOCAL LOCAL discard top prior, no change to stack entry
LOCAL SET+LOCAL discard top prior, copy masked, state S+L

SET+LOCAL SET discard top prior and second masked, state SET
SET+LOCAL LOCAL discard top prior, no change to stack entry
SET+LOCAL SET+LOCAL discard top prior, copy masked, state S+L

RESET は SET のように execute されますが、desired new value として reset_val を使用します。
(RESET LOCAL command は提供されていませんが、SET LOCAL TO DEFAULT が
RESET LOCAL が持つであろう behavior と同じものを持ちます。)
reset_val に associate された source は、actual value にも associate されるようになります。

SIGHUP を receive すると、GUC code は postgresql.conf configuration file を reread します
(これは signal handler 内では発生せず、next return to main loop で発生します。
transaction 内で execute される可能性があることに注意)。
postgresql.conf からの new values は、actual variable、reset_val、および stacked actual values に assign されますが、
これらの各々が current source priority <= PGC_S_FILE を持つ場合のみです。
(したがって、actual variable の現在の different interactive value があったとしても、
reset_val が config-file setting を track することは possible です。)

check_hook、assign_hook、show_hook routines は actual variable のみと連携し、
GUC によって maintain されている additional values を directly に aware していません。

## GUC の Memory Handling

string variable values は guc_malloc または guc_strdup で allocate されます。
これらは values が long-lived context に keep されることを ensure し、
bare な palloc よりも out-of-memory failures の handling に対する more control を提供します。

string variable の actual value、reset_val、boot_val、および stacked values が same storage を指すことを allow します。
これは space の free を slightly に harder にします
(free される value が、GUC entry または associated stack items 内の other pointers のいずれにも equal でないかを
test しなければなりません)。
main advantage は、transaction commit/abort 中に malloc する必要が決してないため、
そこで out-of-memory failure を cause できないことです。

check_hook routines によって return される "Extra" structs は string values と same way で manage されます。
"extra" structs は GUC variables の all types に対して support されていますが、main に strings で useful であることに注意してください。

## GUC と Null String Variables

GUC string variable は boot_val として NULL を持つことができます。
guc.c はこれを unsurprisingly に handle し、underlying な C variable に NULL を assign します。
そのような variable を使用する code、およびそのための hook functions は、NULL value を deal with する prepare ができていなければなりません。

しかしながら、他の方法で GUC string variable に NULL value を assign することは possible ではありません:
SET、postgresql.conf などから来る values は empty strings であることはあっても、決して NULL になることはありません。
そして SHOW は NULL を empty string と same に display します。
したがって、NULL value を distinct な user-visible setting として treat するのは appropriate ではありません。
NULL boot_val の typical な use は、startup 中に later で real value を receive する variable のために、
value がまだ set されていないことを denote することです。

underlying な C variable を使用する code が NULL values について worry する必要がないことが undesirable な場合、
variable には non-null static initializer と non-null boot_val を give することができます。
guc.c は InitializeGUCOptions 中に static initializer pointer を boot_val の copy で overwrite しますが、
variable が NULL を contain することは決してありません。

src/backend/utils/resowner/README

# Resource Owners に関する Notes

ResourceOwner objects は、buffer pins や table locks などの query-related resources の management を
simplify するために invent された concept です。
これらの resources は、query が error によって fail した場合でも、query end 時に release されることを ensure するために、
reliable な way で track される必要があります。
entire な executor が bulletproof な data structures を持つことを expect するのではなく、
そのような resources の tracking を single module に localize します。

ResourceOwner API の design は MemoryContext API を model にしており、これは memory leaks を防ぐ上で
非常に flexible で successful であることが prove されています。
特に、ResourceOwners が child ResourceOwner objects を持つことを allow するので、
それらの forests を form できます。parent ResourceOwner を release すると、その direct および indirect children すべてに対しても act します。

(ResourceOwners と MemoryContexts を single object type に unify することを考えるのは tempting ですが、
usage patterns が sufficiently に different であるため、これは probably に really helpful なことではない可能性があります。)

各 transaction または subtransaction ごとに ResourceOwner を create し、
また各 Portal にも 1 つ create します。Portal の execution 中、global variable CurrentResourceOwner は
その Portal の ResourceOwner を指します。
これにより、ReadBuffer や LockAcquire のような operations が、acquire した resources の ownership を
その ResourceOwner object に record するようになります。

Portal が close されると、remaining な resources (typically には locks のみ) は current transaction の responsibility になります。
これは Portal の ResourceOwner を current transaction の ResourceOwner の child にすることで represent されます。
resowner.c は child を release する際に、automatically に resources を parent object に transfer します。
同様に、subtransaction ResourceOwners はその immediate parent の children です。

transactions は、associated な Portal がまだ exist しない時点で、resources (query parsing など) を
require する operations を initiate する可能性があるため、Portal-related な ResourceOwners だけでなく、
transaction-related な ResourceOwners も必要です。

## Usage

ResourceOwner に対する basic な operations は:

- ResourceOwner を create する

- 何らかの resource を ResourceOwner と associate する、または deassociate する

- ResourceOwner の assets を release する (owned な resources をすべて free するが、owner object 自体は free しない)

- ResourceOwner を delete する (child owner objects を含む); beforehand にすべての resources が release されていなければならない

Locks は specially に handle されます。なぜなら、non-error な situations では、lock は originally に subtransaction や
portal によって take された場合でも、transaction の end まで hold されるべきだからです。
したがって、isCommit が true の場合、child ResourceOwner に対する "release" operation は、
actually に lock を release するのではなく、lock ownership を parent に transfer します。

transaction 内にいる間は常に、global variable CurrentResourceOwner が、
acquire した resources の ownership を assign すべき resource owner を show します。
ただし、CurrentResourceOwner は any transaction の内にいないとき (または failed transaction の内にいるとき)
には NULL であることに注意してください。この場合、query-lifespan resources を acquire することは valid ではありません。

buffer を unpin したり、lock または cache reference を release したりするとき、CurrentResourceOwner は、
buffer、lock、または cache reference が acquire されたときに current だったのと same な resource owner を
指していなければなりません。
additional な bookkeeping effort を払えばこの restriction を relax することは possible ですが、現時点では need はないようです。

## 新しい resource type の追加

ResourceOwner は many different kinds の resources の ownership を track できます。
core PostgreSQL では、いくつかの examples を挙げると、buffer pins、lmgr locks、
catalog cache references に使用されます。

new kind の resource を add するには、それを describe する ResourceOwnerDesc を define します。
For example:

static const ResourceOwnerDesc myresource_desc = {
.name = "My fancy resource",
.release_phase = RESOURCE_RELEASE_AFTER_LOCKS,
.release_priority = RELEASE_PRIO_FIRST,
.ReleaseResource = ReleaseMyResource,
.DebugPrint = PrintMyResource
};

ResourceOwnerRemember() と ResourceOwnerForget() functions は、その struct への pointer と、
resource を represent する Datum を take します。Datum の meaning は resource type に depend します。
ほとんどの resource types はある struct への pointer を store するためにそれを use しますが、
例えば file descriptor や library handle にすることもできます。

ReleaseResource callback は、resource owner が release または delete されるときに call されます。
それは、resource に associate されたすべての resources (例: files を close、memory を free) を release すべきです。
callback は transaction abort 中に call されるため、user visible effects のない
low-level cleanup のみを perform しなければなりません。
callback は、memory を allocate するなど、fail する可能性のある operations を perform すべきではありません。

optional な DebugPrint callback は、resources が leak している場合、
transaction commit 時の warning で used されます。specified されていない場合、
resource name と resource を pointer として print する generic implementation が used されます。

other modules が ResourceOwner release 中に control を get して、delete する必要がある objects を find するために
own な data structures を scan できるようにする another API があります。
RegisterResourceReleaseCallback function を see してください。
これは used to be に extensions が new kinds of objects で resource owner mechanism を use する唯一の方法でしたが、
nowadays では custom な ResourceOwnerDesc struct を define する方が easier です。

## Releasing

ResourceOwner の resources の release は three phases で行われます:

1. "Before-locks" resources

2. Locks

3. "After-locks" resources

各 resource type は、locks の before か after に release される必要があるかを specify します。
各 resource type は priority も持ち、これによって resources が release される order が determine されます。
phases は、next phase に move する前に whole tree of resource owners に対して fully に perform されますが、
各 phase 内の priority はその ResourceOwner 内の order のみを determine することに注意してください。
各 phase 内では、child resource owners は always に parent の before に handle されます。

For example、次のように 2 つの ResourceOwners (parent と child) があるとします:

Parent
parent resource BEFORE_LOCKS priority 1
parent resource BEFORE_LOCKS priority 2
parent resource AFTER_LOCKS priority 10001
parent resource AFTER_LOCKS priority 10002
Child
child resource BEFORE_LOCKS priority 1
child resource BEFORE_LOCKS priority 2
child resource AFTER_LOCKS priority 10001
child resource AFTER_LOCKS priority 10002

これらの resources は following order で release されます:

child resource BEFORE_LOCKS priority 1
child resource BEFORE_LOCKS priority 2
parent resource BEFORE_LOCKS priority 1
parent resource BEFORE_LOCKS priority 2
(locks)
child resource AFTER_LOCKS priority 10001
child resource AFTER_LOCKS priority 10002
parent resource AFTER_LOCKS priority 10001
parent resource AFTER_LOCKS priority 10002

all the resources を release するには、各 phase ごとに 1 回ずつ、合計 three times ResourceOwnerRelease() を
call する必要があります。phases の between に additional tasks を perform することはできますが、
ResourceOwnerRelease() への first call の後は、ResourceOwner を use して further な resources を
remember することはできません。また、release process を start した後は、resource owner に対して
ResourceOwnerForget を call して previously に remember された resources を "in retail" に release することもできません。

Normally には、commit 時に ResourceOwner が empty になるように、every resource に対して ResourceOwnerForget を
call することが expect されます (locks は exception です)。commit 時にまだ hold されている resources がある場合、
ResourceOwnerRelease はそのような each resource に対して WARNING を print します。
ただし、abort 時には、私たちは truly に ResourceOwner mechanism に rely しており、
release されるべき resources があるのは normal です。

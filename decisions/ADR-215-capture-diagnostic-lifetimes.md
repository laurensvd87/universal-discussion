# ADR 215 Capture diagnostic graph and transport lifetimes

Date: 2026-10-24
Status: SOURCE experiment design accepted by Root Native and Trust; implementations under review

## Decision and scope

Replace the unsuccessful ADR214 diagnostic allocation strategy in a small new
SOURCE candidate. Keep immediate immutable error reports, but reserve their
small object graphs separately from their later serialized output. Once the
whole capture phase has already failed, revoke a healthy journey without
constructing a second, redundant journey failure report.

The32768 logical private-byte ceiling is per batch, not a sum across historical
batches. Preserve each retained batch's accounting and the separate unchanged
parent/process limits. No claim here equates logical payload charges with V8
heap size. All consumed study source, packages, maps and output, plus the held
ADR213/214 candidate files, remain unchanged. This decision permits no actual
browser, model, database, service, crawler or new study phase.

## Evidence requiring a different allocation strategy

The final ADR214 capture candidate ran156 offline reports:137 passed and19
failed. Trust independently reproduced those counts. Its8192 reservation
suppresses previously required non-null diagnostics; this is an integration
failure, not a reason to weaken those assertions. The independent saved review
is `apps/local-service/data/native-capture-context-integration-adr214-failed-source-checkpoint-independent-review-20261024.json`,
FILE `eb0a2b665d65301edefbbc5f7a9ff5101a8362c4b28a759448a923d2a5afc8c8`.

A bounded numeric shadow probe recorded65 observations across all19 failed
reports' first reached iterations and seven additional original variants.
It allocated neither the proposed outer report nor transport and deliberately
left assertions failing. The saved executable instrumentation is
`apps/local-service/data/native-capture-context-integration-adr214-graph-first-capacity-probe-20261024.json`,
FILE `f3be56eb515ecba8d719c33222ac9b954495deda0b8f6ce736522a7d5b0f7b68`.
Its observations constrain the design; they are not a successful candidate run.

The largest first observation was32510: a256 first graph would total32766.
The same public-journey reply fixture later fell to29438 after the existing
journey notification finished. Another fixture instead grew from25507 to33699
because aborting an otherwise healthy journey created an8192 unavailable report.
It could not fund even zero additional output bytes at that point. A late fault
after normal batch release also found no module bridge despite retaining its
own batch callback. Both problems need explicit lifecycle fixes.

Root's closed public-journey byte test exhausts92160 legal witness combinations,
all27 primary codes,208 cleanup choices,22 stages and40 RPC choices using
additive independent-field maxima. The maximum capture graph is585 JSON bytes;
the maximum complete output including LF is695 bytes over all72 outer labels.
Test FILE `79fd4597bbbdd7cc0ed36ddeb7d9fb4db5f6001d258d62dd09f3426d1649ed03`
is in the held ADR214 candidate. Root and Trust each passed its six reports
including the earlier wire equivalence tests. Byte maxima do not prove object
ownership, graph allocation or all-live accounting.

## Minimal new files and unchanged components

Native owns only the new
`spikes/topic-resolution/harness/experimental/native-capture-context-integration-v2/`
collector, adapted capture tests and README. Root owns the new
`native-specificity-public-journey-v4/` journey, tests and README.
Reuse the held ADR214 owner and driver by explicit imports rather than copying
them. Root owns this decision, differential and byte-bound tests, integration
checks and status. Trust reviews the complete diffs and independent evidence.
No complete study copy, catalog, CLI, reviewed map or output directory is created.
Authenticate the frozen128 source entries before following their imports and
verify held candidate dependencies explicitly. Tests against frozen code are
reference evidence and must not be counted as candidate coverage.

Root and Trust separately accept implementation of ONLY the three new journey-v4
files. Trust read the complete draft FILE
`9170ba0cfb4f6f6866f4b1cf9a3e3a7810f9992807dcbf0eddcc16e3d9283f7a`.
The collector, its packed-cell design and transport ownership are not admitted
by that component decision. Root may add isolated byte-bound tests without
activating or importing an unfinished collector. The journey slice adds no cell,
helper, option or callback and leaves scalar widths unchanged. Its fallback abort
body must be byte-identical to v3. Run every old journey assertion and the new
revocation/identity/report-state/pending-original tests before independent review.

## Immediate graph and immutable first error

Acquire a sticky256 graph reservation before creating any first-primary graph
object. A descriptor of at most96 logical bytes must retire before the final
outer record is constructed. The proposed graph inventory is one80-byte nominal
record, one160-byte outer record and16 bytes of scalar construction scratch.
It is a hypothesis requiring a complete actual-constructor inventory. No
recursive freeze, Object.values traversal, spread copy, public-projector clone
or intermediate outer record belongs in this256 path.

Latch the original presence, original identity, nominal family/code, stage and
RPC before invoking any observation reader. Preserve falsy values and NaN with
presence flags and Object.is. Store construction state in already owned cells
and phase bits, not another holder, callable, ninth control cell or unfunded
snapshot. During synchronous construction, a reentrant public getter returns
null just as it did before the first complete original report. It must never
return a nominal-only record as though it were the public closed schema.

The selected construction design uses the EXISTING diagnosticValue cell as a
positive arithmetic word while building, then as the complete frozen object.
With primaryIndex0..206, stageIndex0..21, rpcIndex0..39 (including null), and
cleanupIndex0..207 (zero means absent), encode
1+((primaryIndex*22+stageIndex)*40+rpcIndex)+182160*cleanupIndex.
The inclusive maximum37889280 fits26 bits. Decode with division, floor and
remainder, never JavaScript bitwise truncation. A number is not a public report;
the getter returns null. diagnosticLatched plus null denotes a consumed failure
or denial, not a retry invitation. There remain exactly three module cells:
diagnosticLatched, diagnosticValue and the bridge.

Set global diagnosticLatched and the COMPLETE initial nominal/stage/RPC word
before any context selection/projection or diagnostic reader that could reenter.
The nominal helper itself uses only captured bounded intrinsics and cannot call
an observer. A cleanup arriving before graph256 is owned must fund the TOTAL
512 reservation, not assume that an additional256 is sufficient. If256 is
already owned, charge the remaining256; queued cleanup changes its word component
only once. No caller may complete construction from a stale copy of that word.

A bounded helper snapshots the nominal INDEX before context selection. Its
descriptor phase is charged to the original holder's128 view/scratch bytes
WHILE that view is absent; it returns before creating any context view. The
subsequent selected view uses at most112 plus16 scalar scratch. No primary DTO
exists yet. Snapshot stage/RPC into the word before observers, acquire graph256,
then read the private witnesses. A reentrant cleanup first funds the required
total512 (only the remaining256 if graph256 is already owned), then queues its
first cleanup index in that same word. Construction rereads
the current word after observers, never a stale pre-reader copy. Build only the
final primary/optional cleanup/outer graph. Construction failure consumes the
attempt and leaves null; it cannot revive an earlier denied attempt.

The original eight control references remain phase, first, bound, packed, view,
current article Symbol, ordinal and the module bridge to the same callable.
The last is counted once although referenced at module scope. first/bound clear
on consuming selection; the pure fold alone temporarily uses bound/packed and
always restores them. No nominal word may be stored in fold scratch.
Use phase low two bits for empty/claimed/selected/released,8 graph256-owned,
16 first-graph-attempted,32 emit-attempted,64/128/256 the original map-fold roles,
512 cleanup-upgrade-owned,1024 cleanup-upgrade-attempted,2048 general transport
owned,4096 journey transport owned,8192 transport-attempted and16384 fold-active.
The sum of every listed bit plus low state3 is32763; bitwise operations on phase
remain below2^15. General/journey owned bits are mutually exclusive. Slot release
clears slot-only references but never any graph/transport ownership or denial.
Pure fold eligibility depends on its explicit fold-active bit and actual private
collection identity, not on absence of a graph lease. Released late owners are
eligible only under the late-bridge conditions below. Every command must check
its exact arity and private state before reading payloads.

Obtain and directly adopt only the exact frozen views authored by the existing
private witness owners. Their backing owners and every previously declared
reservation remain charged. This is not permission to trust a caller-created
frozen DTO. Preserve every family's correlation/exclusion predicates, the
original primary-before-cleanup selection, and strict public projection.
Nominal projection must inspect only bounded own data descriptors of exact
allowed native-error prototypes and must not execute caller getters or proxies.

The first complete report remains immediately available from
captureFailureDiagnostic without waiting for emission, cleanup or another user
read. A cleanup replacement first upgrades the sticky graph reservation to512.
The proposed overlap is old outer160 + new outer160 + shared primary80 + cleanup
nominal80 +32 scalar scratch =512. Already-issued old graphs remain immutable
and funded; permit at most one replacement. If an allocation is denied, consume
that attempt without retry or fallback, preserve any earlier report and keep the
actual original error. Denial cannot reset an existing lease.

## Revocation without a secondary report

In journey-v4, add one exact overload to the existing abort method:
arguments.length must be1 and the argument must be the literal `phase-failed`.
No coercion or property read is involved. Capture may invoke this mode only
after setting its real local fatalLatched and global phaseFailureLatched flags.
The values need not be identical: a later local callback may differ from the
already established global first failure. Neither first value may be replaced.

If a journey already failed, change nothing, including report construction,
notification, compact packet, materialized report and unavailable state.
Otherwise set its existing failure cell to a new external-failure journey error,
reject its existing ready Promise and leave reportState absent, with both report
holders null. Do not run reportPreflight, snapshot/codec, onFailure, observers
or native operations. This is report-allocation-free, not allocation-free; the
new error remains under the existing logical error/control ownership.

Every later wait/check/assertComplete must fail, pending original continuations
must retain their settlement and debt semantics, and retire may only perform
cleanup. No facts, pending operations, coordinator records, network obligations
or physical-retirement evidence are cleared, invented or treated as settled.
The ordinary zero-argument abort and every other argument shape retain their
original semantics, including primary report allocation and notification.
The overload is revocation only; it cannot grant rights or accept a case.

## Graph output and sticky transport

Acquire transport only when the private emitter is actually invoked. Reserve3072
for the general closed graph, or2560 when the immutable first primary is the
proved public-journey family. Graph512 and holder256 are additional charges.
Choose the family from the latched nominal, never a mutable error property or a
caller's declaration. A complete closed general-family byte bound and actual
ownership inventory are required before implementation acceptance.

The transport proposal includes simultaneous UTF16 text, exact unpooled UTF8
Buffer including LF,96-byte outer envelope,64-byte Buffer header and128 bounded
scalar/descriptor scratch. At a900-byte wire ceiling the conservative expression
3*900+288=2988 fits3072. For the proved journey695 ceiling,3*695+288=2373 fits2560.
Use one outer envelope, one native JSON serialization and one exact Buffer.alloc;
no parse, secondary stringify, pooled backing store or validation clone.
Reservations must precede every owned allocation they cover. Graph and transport
may not be merged merely because the previous numeric probe suggests room.

Reject an inherited Object.prototype.toJSON before serialization using a fixed
captured own-descriptor lookup, not a getter or unbounded key enumeration.
Private graph records must be frozen and retain their known original prototypes.
Capture any relevant native serialization/descriptor/Buffer operations so later
replacement cannot turn the proof into arbitrary callouts. Do not mutate global
prototypes to make a test pass. The complete scratch and descriptor lifetimes
still require review against the implementation.

Invoke the fixed original emitter synchronously once, ignore its return and keep
the full transport charge through owned Node exit. Do not inspect thenables,
Promise constructor/species/prototype properties or returned collections. The
actual future composition discards stderr.write's boolean return. Existing
onRow Promise hygiene is unchanged; mistaken-emitter Promise tests pre-observe
their own Promises and make no general unhandled-rejection-hygiene claim.
False returns, throws, retained Buffers and repeated outer catches never refund,
retry, emit a generic suffix or acquire a second transport. Reentrant emission
must be blocked before any envelope or Buffer allocation.

## Late faults and bridge ownership

Keep normal successful release clearing its module bridge. Only an actual first
global remember from an already closed and released batch may reinstall that
batch's own still-held callable, and only when both bridge and activeBatch are
null. Account its real released-state owner, registries and reservations before
allocating. Do not reconstruct an article or helper merely to obtain identity.

If a newer batch already owns the module bridge, never replace or chain it.
The actual old callback consumes that bridge's context slot using its real
original and a guaranteed nonmatching binding, so equal falsy/NaN originals
cannot borrow the newer article's witness. Fund the global report on the active
batch's existing reservation. Preserve old stage/RPC/nominal values immediately;
any adopted old witness remains under its original owner's accounting too.
Reject the inconsistent bridge-null plus activeBatch-nonnull condition rather
than selecting arbitrary ownership. Once a global diagnostic, denial or lease
is latched, later callbacks cannot reset it. Each historical batch keeps its own
real payload accounting; separate process and cohort limits remain unchanged.

## Required executable acceptance

Run all original148 capture and26 driver reports as authenticated references.
Run their behavioral obligations against the new collector and explicit held
driver composition. Preserve assertions, required non-null witnesses, exact
original failures,700/900/1024 byte ceilings and32768/32769 boundary behavior.
Adapt only documented private-layout scaffolds; reference introspection is not
candidate coverage. The full ADR214156 suite and each of its19 failures must be
accounted for, including all falsy and nominal loop members, not merely the
shadow probe's first reached iterations.

Additional focused tests must cover first256 and cleanup512 exact boundaries;
denied attempts; nominal/stage/RPC mutation and reentrant readers; immediate
pending-third-discovery diagnostics; already-issued graph immutability; every
privately adopted witness owner and accounting charge; graph plus transport
at the actual failure, cleanup and emission points; and all terminal unions.
Prove pure numeric-owner and full accounting parity with the frozen original
plus the declared8-byte accumulator, including released states.

Journey-v4 tests must cover prepared/dispatched/resolved journeys, pending and
settled ready Promises, pending continuation fulfilment/rejection, already-failed
building/compact/materialized/unavailable states, abort argument-shape parity,
zero report/notification calls in the special mode and unchanged first failures.
Integrated tests must prove the real capture flags precede that mode and no
primary journey report is suppressed.

Late tests must cover fault before and after normal release, a newer active batch,
equal falsy/NaN originals, mismatched/absent bindings, no replaced active bridge,
inconsistent ownership refusal, immutable prior diagnostics/leases and honest
both-owner accounting. Emission tests include retained first Buffer, recursion,
false return, throwing/falsy failure, hostile toJSON, returned Promise/thenable
zero hooks, denied transport and later generic catch suppression.

Use only invented capabilities under the existing offline guard. Independent
full-source and saved-evidence review precedes any acceptance. A successful
source experiment still requires a separately reviewed complete study closure
and separately admitted actual phases. Topic quality, canonical persistence,
owner-wide/per-topic specificity, stable discussions and actual UI/crawler
latency and concurrency remain open parts of the original goal.

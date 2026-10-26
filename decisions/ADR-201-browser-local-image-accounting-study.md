# ADR201 Browser local image accounting in the native topic study

Date: 2026-10-24. Status: SOURCE design accepted by Root, Native and Trust;
implementation, complete tests, independent closure and final pins still required.
No actual phase, retry, model, TEST or live activation is authorized here.

## Failure and scope

ADR200's single TRAIN/CAL run closed exit1 after two batch drains and a third
batch start. Root and Trust authenticate the saved failure: unknown-network-response
during article navigation, cleanup passed without emergency termination, no
cohort/result/selection/model/TEST. The failed response's scheme/type/frame were
not retained. The last Fetch.failRequest observation does not establish cause.

The current source subscribes to broad Network events but populates request
identity sets only through HTTP(S) Fetch interception. CDP Network covers
non-HTTP resources too; Fetch patterns limit which requests pause. This establishes
a source coverage mismatch, not proof that an embedded image caused the old failure.
[CDP Network](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Network.pdl)
[CDP Fetch](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Fetch.pdl)

The new study corrects only response-born data: Image bookkeeping and adds an
enum-only exact-first-error network witness. All consumed v1-v14 studies and both
startup diagnostics remain immutable. This contract preserves the complete200
capture, ownership, semantic and phase boundaries below; original200 FILE SHA:
92e2c6344ce596e3871adc680b87ebb260bc482007aa99dd54b172eacf9598f7.

## Local image observations without admission

Use a private callback-closure ledger, at most32 historical IDs including terminal
tombstones. Never add these IDs to admitted, blocked or retirement-denial sets.
Only a Network.responseReceived on the current owned article/session/token/page
may create a record, while active, undetached, not retiring, not closeIssued,
not retired and before private read revocation. A record never contributes a
journey fact, network admission, lease, continuation, rights, content read or row outcome.

Require an exact own main frame and the closure-private provisional main-response
loader, assigned ONLY by a successful actual admitNativeMainResponse call. Do not
read an externally supplied state.provisional or boolean as proof. This provides
paired Fetch/Network/TLS/public-peer/header ownership before DCL, not completed
navigation authority. An existing independent reply loader must agree. All seven
fresh main facts and later independent reply/commit/loader/rights checks remain
mandatory before collection; the local path cannot help satisfy them.

Require type Image, a primitive literal data: response URL of5..33554432 UTF16
units, and a MIME of at most96 ASCII units matching image/ followed by1..90
ASCII letters/digits or . + - characters,
status200 and finite nonnegative non-minus-zero timestamp. No blob/file/about/
extension/HTTP(S) rescue, children, workers, missing frame/loader or main ID.
All ID namespaces must be disjoint; an observed identity is historical, never
reused. Reject visible redirect, extra-info, cache, service-worker and remote-peer
evidence. Response-only bookkeeping does not establish a request redirect history.
Absent/false cache/SW/prefetch flags and absent/empty remote address or
absent/zero remote port are local projections, not TLS or network proof.
Reject visible serviceWorkerResponseSource, serviceWorkerRouterInfo and
securityDetails fields, nonempty cacheStorageCacheName and true fromEarlyHints.
An inherited securityState alone is never TLS proof or a main-response fact.
Do not parse or retain URL payload, headers or bodies, and never stream/read a body.

Reserve one bounded ID/loader/frame/state record and charge retained bytes BEFORE
accepting the response, including a guard after insertion. Charge each row256
logical bytes plus twice the sum of requestId, frameId and loaderId UTF16 lengths;
this is conservative retained accounting, not a JS heap measurement. Reserve512
additional bytes per callback registry for private provisional/identity references,
witness/error association and Map baseline before listener/native event dispatch.
Reuse existing32768
aggregate accounting and original1024 article/4096 batch event limits. The URL's
primitive length is a conservative resource charge, not measured heap bytes;
bound it and charge it to the SAME32MiB resource envelope as local decoded
dataLength plus encodedDataLength. Optional response.encodedDataLength is a safe
nonnegative non-minus-zero integer up to33554432, with missing treated as zero.
Charge it once at birth alongside URL length; track it plus subsequent encoded
chunk lengths as the known cumulative encoded count. Safe integers, overflow and
capacity checks precede increments. Optional streamed data is refused. The final
cumulative encoded length must be at least that known count and adds only the
previously uncharged delta, never a refund, duplicate charge or another budget.

Allowed sequence is one response, zero or more data notifications, then one
loadingFinished; retain a terminal tombstone until normal retired release.
Unknown, duplicate, data-before-response, post-finish and stale events remain
fatal. A known original image may terminate during owned close only through the
existing exact closeIssued+canceled:true+ERR_ABORTED form, recording its terminal
state without changing the row; loadingFailed must still have type Image.
No new local response after read revocation or
retirement. Require all local records terminal before normal retirement; target
destruction or close alone cannot invent a missing terminal event. Preserve
original physical operation/continuation/denial drains and all first faults.

## Exact first unknown network witness

Add nullable networkWitness as the last existing capture DTO field. A nonnull
observation is bound privately and synchronously to the SAME freshly generated
error at an unknown response/data/finish/failure rejection. It may contain only
closed scheme, resource-type, frame-relation and loader-relation categories.
Field order is schema,event,scheme,resourceType,frameRelation,loaderRelation.
Schema is native-network-observation-witness/v1. event is response,data,finished
or failed; scheme is http,https,data,blob,file,about,extension,other or unavailable.
extension means only chrome-extension:. resourceType is exactly one of Document,
Stylesheet,Image,Media,Font,Script,TextTrack,XHR,Fetch,Prefetch,EventSource,WebSocket,
Manifest,SignedExchange,Ping,CSPViolationReport,Preflight,FedCM,Other,other or
unavailable; no remote/runtime enum import. frameRelation is main,child,other,absent or unavailable;
child requires a registered LIVE rooted child. loaderRelation is main,blank,other,
absent or unavailable; main means the private provisional loader and blank means
the authenticated initial blank loader. Missing fields are absent; malformed or
uninspectable fields are unavailable. No IDs, URL fragments/payload, headers,
error text, hashes, content or timestamps.
Inspect descriptors proxy-first without getters/coercion/toJSON or asynchronous
lookups; unavailable/unsafe projection is null and never replaces the original
failure. A later error, cleanup, other article or equal error code cannot lend
a witness to the first primary, including earlier falsy/nonidentity errors.

Projection requires primary capture and the exact code/event association:
unknown-network-response/response, unknown-network-data/data,
unknown-loading-finished/finished, unknown-network-failure/failed.
Local contract/sequence/capacity/unsettled refusals remain closed finite codes
local-image-contract, local-image-sequence, local-image-capacity and
local-image-unsettled, without a borrowed unknown-event witness.
Keep existing journey/timer/infrastructure restrictions. Charge new private
references/observations inside32768 before dispatch; preserve700B capture,
900B driver and1KiB total stderr ceilings. This field diagnoses unsupported
events, not a reason to silently admit them.

## Source ownership and verification

Root owns this decision, authenticated exact60 copy, driver/IO tests, status,
source maps and separate decisions. Native owns ONLY fresh browser-capture.mjs/capture.test.mjs/
README-capture plus supervise.py/test/README-guardian. Inventory owns the
seventeen new catalog/profile/entry/ledger/admission files, never old source.
Full inherited tests remain, with actual native parent AST checks and a causal
joined fake that emits a local image after authenticated main response but
before navigation reply/DCL. Assert no main-fact/read/continuation/outcome effect.
Cover malformed/hostile descriptors, wrong loader/frame/type/scheme, remote/cache/
SW evidence, duplicate/collision/late/stale events, missing terminal notifications,
zero encoded/nonzero decoded bytes, cumulative lengths, overflow, count/retained/
event budgets before acceptance, and exact first-error witness precedence.
Unknown HTTP responses remain fatal and receive no local exemption.

Readiness adr201-reviewed-execution/v1 requires whole source/tests/closure/pins
and fresh original resource floors. Root then may decide ONE fresh metadata
PREPARE, audit it independently, separately decide ONE96 TRAIN/CAL, and only after
successful actual selection plus independent audit separately decide72 TEST.
No automatic retry, old output adoption, provider/post/canonical/DB/services/
crawler change or implicit publication. Quality and product integration remain open.

## Preserved study contract

## Exact first error and bounded observation

Import createInfrastructurePolicy from the immutable ADR197 policy, retaining
the SAME StartupFatal class identity from native-extension-startup-dev-v1.
Privately retain the one actual policy passed to ArticleOwner. In the first
remembered-primary path, synchronously call its readFailureWitness with that
EXACT original thrown value, before cleanup or release. No caller object, code
equality, second error, cleanup error, other policy instance or retained payload
can establish the association. Earlier falsy or non-identity errors still win.
An unavailable or invalid observation is null; observation failure never replaces
the original error or changes policy state/admission/callback ordering.

Add nullable infrastructureWitness to the existing capture DTO, with the exact
ADR197 schema and closed site/role/predicate enums. A nonnull witness requires
trusted primary family startup and code infrastructure-identity. Descriptor-copy
with proxy-first refusal; no getters, coercion, toJSON, error-field inspection,
raw IDs, URLs, titles, payload hashes, timestamps, messages or stacks. Preserve
journeyWitness/timerWitness and their existing primary-error restrictions.
Read the diagnostic in the existing authenticated capture-to-driver path; no
new reporter, transport, parent protocol or retry path is introduced.

Reserve ADR197 diagnosticRetainedBytes()=320 inside the existing32768 retained
state sum BEFORE any launch/event/RPC dispatch, including boundary checks. Do not
increase it or the700B capture/900B driver/1KiB failure-output ceilings. Invalid
projection falls back to null with the same primary. Preserve first-error
booleans and physical original operation/callback ownership through failure.

## Original process and physical cleanup restrictions

Port only the accepted ADR199 ownership restrictions into the fresh study parent,
not its runner/protocol engine. Immediately retain the successful Popen original
handle, which remains Popen-owned: never manually double-close it. Identify its
PID, creation time and fixed selected image before opening/assigning an inspection
handle. Retain the inspection handle as assigned:false before comparing its full
identity to that launch identity; mismatch or fence failure occurs BEFORE Assign.
Latch assigned:true before any post-assignment membership/identity refusal.
The original pipe remains HELD until assignment, membership, resources and
bootstrap checks succeed under the original epoch and absolute deadlines.

Before assignment, cleanup may terminate only the exact retained Popen child,
never an unrelated PID/inspection handle. Assigned or uncertain owned Job
membership requires conservative owned-Job termination and emergency status.
A missing inspection handle does not prove exit. Confirm original exit and
complete empty-Job observations. Join the original reader and every writer,
requiring pending_physical zero under the EXISTING cleanup deadline, BEFORE
closing their buffered stdin/stdout or output handles. An unsettled thread must
not cause blocking stream.close, invented settlement or normal-cleanup success.
Retain original handle closure and cleanup failure reporting. No lease reset,
process query privilege, global kill, service change or pagefile change.

Popen ownership does not permit destructor deferral as closed-handle proof:
the parent still strongly retains both objects during final publication. After
confirmed original exit/latched returncode, physical thread joins/pending zero
and inspection/Job closures, close the retained launch handle exactly once
through its Popen-owned Handle.Close() API. Never raw kernel CloseHandle,
Detach or manually alter its closed flag. Clear only the extra retained
reference; Popen keeps the already-closed owner object, whose later destructor
is idempotent in the installed Python3.12 implementation. No poll/wait/native
identity operation may use it afterward. A Close exception is cleanup failure.
Actual AST tests bind owner-close count/order and failure to the cleanup claim.

Track successful termination of the exact owned Job separately from the
emergency flag: an earlier preassignment child kill may set emergency without
terminating that Job. A later live or UNKNOWN membership observation still
requires owned-Job termination unless that exact termination succeeded already.
Set the local job_terminated flag only after success. Before and after each
reader/writer join, require positive original cleanup time remaining; no
minimum timeout may extend an expired lease. Causal fakes cover the earlier
child-kill/later-UNKNOWN sequence and joins whose original deadline expires.

## Static inventory and source identity

Root copies ONLY the exact60 owned filenames from the externally authenticated
v14 source list/map into fresh native-specificity-study-v15. Replace only the
owned namespace, begin with the actual entry CLOSED, and never copy output,
profiles, freezes or reviewed maps. Replace the ADR200 document CODE key with
this complete restated contract. Preserve all other shared source, including the
immutable197 witness and unchanged29 producer aliases. The resulting new
producer recipe must bind the new owned sources rather than reuse old identities.

The closure stays128 CODE,142 base keys,243 CODE/package keys including115
package files,25 literal test entries. Keep maximum128 CODE,256 source keys,
144 base-ledger dense keys and the exact IO148 inclusive/149 refusal unchanged.
PREPARE/TRAIN-CAL remain144 actual entries; TEST still requires all six fixed
bootstrap/freeze/independent-audit/train-supervisor/result/selection controls.
Cardinality and readiness confer no runtime, model or TEST authority.

## Aggregate workspaces and unchanged study

Sum seventeen fixed roots explicitly: fourteen consumed study outputs, both
consumed startup-diagnostic outputs and fresh v15 output. Every old root remains
required. Only the trusted pre-creation helper may explicitly grant initial
fresh-root absence after checking HERE; active/final resource calls grant no
exception. Preserve reparse/type/ancestry checks and all diagnostic exclusions.
Charge all roots to the SAME8GiB/344064-entry aggregate ceilings, with no old
output deletion, new per-root allowance or resource/deadline increase.

Maintain the exact168-row/73-family panel,48 TRAIN/48 CAL/72 TEST,166 supported
labels/two unverified. Preserve the fixed16-root model/cuts,25-node scope,
body.75/title.25/lambda.1,24 MEMBER/12 STOP/12 OUTSIDE TRAIN annotations, all
unavailable rows and full denominators. Capture all96 rows with24 normal batch
and final-cohort drains before sequential field encodes: exactly two per available
input, at most192. Run exactly one CAL fit with the unchanged270 cut combinations
per local node across twelve nodes, not270 separate model fits. Independent successful selection audit precedes a
separate72-case TEST decision; no replacement/retry/relabel/post-TEST tuning.
Raw text and CAL/TEST vectors remain transient; saved TRAIN uses exact binary64
codec. Preserve source/asset authentication, original-pipe framing and physical
Job enumeration, native no-reparse sampling and no-reference publication.

Retain batch360s active/420s total/60 CPU seconds; TRAIN9420/9480s/1920 CPU,
TEST7005/7065s/1395 CPU; heap256MiB, Job/RSS/private1536MiB,128 members,
host physical/commit1GiB reserve, C2GiB/D4GiB. Batch512MiB/8192 entries,
evidence32MiB/log1MiB/result512KiB and every package/asset/proof/callback/stage/
cleanup ceiling remain unchanged. The static IO148 distinction is the ONLY
cardinality adjustment; it does not relax these runtime limits.

## Verification and separate phases

Retain all previous typed-event/terminal-denial/causal-continuation/5040-order
and actual Python AST tests. Add actual197 -> ArticleOwner -> capture -> driver
joins: events during pending discovery, exact first-error precedence including
falsy/nonidentity values, second/cleanup/other-instance/released policy refusals,
hostile projections without hooks, maximum byte shapes and retained accounting
before first dispatch. Exercise two completed fake extension batches followed by
third-discovery identity failure without changing that sequence or admission.
Port actual parent AST tests for creation/PID mismatch before Assign, faults at
each original-handle retention edge, already-exited Node with surviving/unknown
Job members, blocked/unsettled reader/writer cleanup and successful close order.

Whole Root/Trust source review, all literal test entries, actual Python tests,
independent closure/pins/secret scan and current original-floor resources precede
readiness. Readiness marker adr201-reviewed-execution/v1 is NOT phase authority.
Root may separately authorize ONE fresh metadata PREPARE, independently audit
its saved evidence, then separately decide ONE96 TRAIN/CAL. Successful actual
selection plus independent saved audit precede a separate72 TEST decision.
No automatic retry, output adoption, provider/post/owner-profile/canonical/service
or crawler changes. Actual semantic quality and hierarchical product integration
remain unfinished until measured and implemented.

## Preserved capture and retirement contract

## One terminal boundary

Every allowed terminal frame callback and new child-Document denial must execute
through the same private synchronous
callback dispatcher after actual journey retirement and network gate closure,
exact current article/token/session/page, retiring, closeIssued and not retired.
Do not return an authorization boolean or accept caller proof flags. Preserve
all existing health, first-fault, event, clock, resource and native-read fences.
The active pre-retirement branches and all seven fresh facts remain unchanged.
Terminal observations confer no main facts, rights, lease renewal, reads or
continuations. No frame event changes a previously fenced captured row outcome;
active children still have the existing restricted-unavailable outcome.
Terminal restricted-rendering bookkeeping must not replace a fenced collected
row or a deferred unavailable reason, or re-enter active outcome selection.

| Terminal event | Bounded treatment |
| --- | --- |
| CDP frameAttached | Unique bounded non-main/non-self frame ID, exact owned undetached main or LIVE rooted parent, no reused/removed ID. Required frameId/parentFrameId and optional stack only; descriptor-copy the complete envelope once under existing aggregate copy caps and discard optional metadata. Reserve parent link before further callbacks. |
| CDP frameNavigated | Keep exact typed Navigation envelope and complete bounded frame copy. Only a registered LIVE child with exact stored parent and bounded loader, all ancestors LIVE to the owned undetached main. Never call owner.commit or journey.commit. Main commits stay fatal. |
| CDP lifecycle | Preserve ADR194 exact four fields, finite names/time and main authenticated blank-or-verified loader rule. A child must have LIVE rooted ancestry. Counter only. |
| CDP frameDetached | One exact remove for a known LIVE ID, then tombstone. Descendant removals may follow a removed parent, but no fresh attach/navigation/lifecycle under a removed ancestor. Unknown/reused/duplicate/swap remains fatal. |
| Playwright child framenavigated | Same current owned page and independent bounded object-parent chain to exact captured main, unchanged stored parents and non-detached maintained Frame capabilities. No child URL, CDP-ID equality or native-document claim. Main navigation stays fatal before URL access. |
| New descendant Document Fetch pause | Actively deny only a validated request-stage Document from a known LIVE rooted non-main child through the original bounded retirement ledger. Never continue/admit/read it. Main Document, unknown frame, response-stage/redirect/error pause remains fatal. |

Every newly reserved child retirement Fetch pause, including existing non-Document
resource types, requires the complete LIVE rooted ancestry and undetached owned
main. Do not apply that check retroactively to an already reserved denial:
LoadingFailed and original physical fulfillment may arrive after ancestor removal
and still must settle the original ledger record. No removal invents settlement.
The Playwright terminal chain checks non-detached state for every object including
the captured main, and rejects fresh child navigation after owned main removal.
This uses the existing exact owned-page root, not child CDP/PW ID correlation.

CDP permits optional attachment stacks and distinguishes DOM removal from a
process swap; the latter can create another target. These are distinct contracts,
not interchangeable teardown signals. [CDP Page protocol](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Page.pdl)
Playwright exposes separate object-frame navigation and detachment state; detached
frames do not supply a parent. Its object graph stays independent from CDP.
[Playwright Frame API](https://playwright.dev/docs/api/class-frame#frame-parent-frame)
No new detach-event listener is needed; terminal parent-chain validation cannot
bless an unknown null-parent object. Newly created unowned targets, process swaps,
new pages, main navigation, stale incarnations and unsafe capabilities stay fatal.

Charge new terminal links/references/flags within the existing32KiB aggregate.
Retain the original16 historical CDP children and16 Playwright non-main objects,
unchanged depth/event/copy limits, tombstones and normal payload release. No new
per-workspace budget or cap increase. Final page.close, exact target destruction,
complete absence census, original denial fulfillment and all callback/socket/
coordinator physical drains remain mandatory; destruction is not settlement proof.

Use a genuine causal fake while page.close remains pending: attach with/without
stack, child init before commit, typed child commit, independent PW child commit,
nested attach/lifecycle, bounded denied child Document/secondary pause, reentrant
lifecycle/removal before denial ACK, and only original denial fulfillment can
complete close and destruction. Exercise CDP/PW ordering permutations and parent-
first/child-first cascading removals. Negatives include missing/failed revocation,
unknown/removed/changed ancestors, duplicate IDs, main Documents/commits, swaps,
new targets, proxy/accessor/extra/oversized optional metadata, historical-count/
byte/event exhaustion before dispatch, stale callbacks and rejected/nonsettling
originals even after destruction. Preserve valid captured rows unchanged when a
terminal-only child is first observed after read revocation.
Cover fresh Image/Document denial under a removed ancestor being refused before
dispatch, while already reserved original denials can fulfill after removal.

## Terminal lifecycle validation

Use fresh study-v15 only. A private callback closure records read revocation
only after the actual owned journey.retire(token) and network gate closure
both succeed. No caller boolean, event or teardown result can manufacture this
proof. Require the exact current opaque article/session, retiring, closeIssued,
not retired and that private proof before terminal lifecycle handling.

Read exactly four enumerable own data fields frameId, loaderId, name, timestamp
without proxy/getter access. Validate bounded frame and loader identities, a
finite nonnegative non-minus-zero timestamp, and DOMContentLoaded or the existing
IGNORED_LIFECYCLE names. The main frame's loader must equal the authenticated
initial blank loader or verified navigation loader. Capture the former only
from the initial owned frame setup, never a callback, and charge its retained
bytes plus private state under the unchanged32KiB bound. Unknown main loaders
remain fatal. Known LIVE rooted child frames require either the existing active
restricted-rendering refusal or private terminal-child membership, plus the
existing bounded loader grammar. Terminal membership never rewrites a row outcome.
Unknown, removed, detached or
stale frames and unsafe/extra descriptors remain fatal.

Accepted terminal events increment only the existing teardown counter. They
never enter the journey, supply navigation facts, renew a lease, grant rights,
read content, or dispatch continuation work. Preserve active navigation,
main-loader checks, all seven independent fresh facts and native rights byte
identically. Clear the private proof and initial blank loader only at normal
retired payload release. Keep full page close, exact target destruction, complete
absence census, original denial fulfillment and callback/socket/coordinator
physical drains before any normal row completion.

Split terminal state/frame/descriptor/name/timestamp/loader refusals into closed
finite codes in the existing diagnostic family. Do not save raw fields or raise
output/resource limits. The nullable networkWitness specified above is the only
additional DTO field beyond the inherited infrastructureWitness. Causal joined fakes cover main DCL,
verified and authenticated blank loaders, known child close events, missing
revocation, unknown main loader, unknown/removed/stale children and hostile
fields; retain all denial-original and physical-drain negatives.

## Active rejection without collection authority

Use a separate bounded retirement-denial ledger in fresh study-v15. Keep callback
health, original article/session incarnation and event checks before handling.
Require retiring, closeIssued and not retired, a new unique request-stage Fetch
pause, exact current main frame or already-known live child with irreversible
restricted-rendering refusal. Reject responseStatusCode, responseErrorReason,
redirectedRequestId, main Document/unknown resource types, malformed descriptor/ID/
URL/method/header data and unknown/removed/stale frames. Main NetworkID reuse
remains fatal before any known-request return. Validate only bounded HTTP(S)
request metadata; never retain URL, headers, body or credentials in this ledger.

Reserve one compact record before native dispatch, keyed by NetworkID with
FetchID, frameID and original-fulfillment state. At most32 records, with every
retained byte included in the unchanged32KiB aggregate registry accounting.
Never add these IDs to the admitted or general blocked-resource sets. Submit
only Fetch.failRequest(BlockedByClient) through the existing serial denial lane,
which can run concurrently with ordinary page.close. No continuation, fulfillment,
Fetch.disable, unsubscribing, passive discard, body read or new network admission.

Only successful physical settlement of the ORIGINAL denial promise marks its
record fulfilled. LoadingFailed, target destruction or an observer/coordinator
completion is not that proof. LoadingFailed may match only the two existing
exact blocked spellings or the already permitted closeIssued+canceled:true/
ERR_ABORTED form. Response, data or loadingFinished for a retirement-denied ID
is contradictory. Rejected or nonsettling native originals remain fatal even if
a target disappears; no closed-target error-message rescue or implicit settlement.

After successful page.close, exact owned target destruction, complete absence
census and callback/socket/coordinator physical drain, explicitly require all
denial records fulfilled before owner.retired and normal publication. Clear them
only at normal retired payload release. Earlier articles retain opaque tombstones:
callbacks from them cannot acquire the next article or ledger. Preserve all
original operation/event/byte/clock/deadline caps. Closed finite refusal codes may
distinguish state/frame/stage/type/identity/denial contradictions and unsettled
records without new diagnostic fields, raw values or larger caps.

Passive teardown is not a denial proof: Chromium's [interceptor](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/devtools/devtools_url_loader_interceptor.cc)
can detach a waiting interception by continuing it with empty modifications.
Freeze/stopLoading cannot fence an already queued pause and are not added.

## Preserved callback corrections

Retain ADR192's exact owned-block .Inspector alternative and descriptor-safe
known-live-child lifecycle isolation, with no contribution to main journey facts
or native rights. Preserve exact four lifecycle fields, bounded IDs, finite
nonnegative non-minus-zero timestamp and existing names. Unknown/removed/late
callbacks outside the explicit terminal contract remain fatal; shared public-journey-v2 stays byte-identical.

## Preserved navigation and security contracts

Active main navigation retains exact typed frameNavigated outer
{frame,type:'Navigation'}, descriptor-copy
of the complete bounded frame, including parentId, and one copied {frame}
projection to owner then journey. Reject missing/unknown/BFCache/extra/unsafe
envelopes. Keep original first-error identity and synchronous witness scope.
Shared public-journey-v2 remains byte-identical, including its narrow ignored
initial-blank replay before any fresh loader fact/candidate. All seven fresh facts
and native foreground/document/permission/rights checks remain mandatory.

Response continuation remains separate from response admission. Validate exact
sealed frame/URL/NetworkID, unique FetchResponseID, integer100-599 status and
descriptor-safe bounded header syntax before reserving/submitting once. Preserve
64 headers,256 ASCII name units,8192 UTF16 value units,16384 aggregate UTF8 bytes,
HTTP-token names and valid HTAB/C1 grammar; controls/CR/LF remain rejected.
Track the original continuation promise, including reentrancy. Independent
Network and Fetch response identities/status/TLS/selected-public-peer/header/MIME
checks still precede native reads. Refusal may resume rendering, never admission.
Missing independent evidence, duplicate reservation, late contradiction or failed
settlement is fatal. Never failRequest an already resumed response. Publish a
refusal only after physical settlement, normal article retirement, destroyed
target, census absence and callback/socket/coordinator drain. No raw body reads,
response fulfillment/modification, redirects, retry, alternate host or peer.

Keep nullable journeyWitness and timerWitness bound privately to the exact first
error. Timer metadata is only the original entry-owned lane/RPC. No error-property
hooks, messages, stacks, content, raw IDs/URLs or timestamps are retained. Preserve
700B capture/900B driver/1KiB total failure output, existing clocks/timers/deadlines.

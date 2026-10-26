# ADR194 Terminal lifecycle validation after read revocation

Date: 2026-10-23. Root and independent Trust accept this source-only design.
Complete implementation, final pins and actual phases remain separate gates.

## Closed retirement failure

ADR193 metadata preparation4396 and independent saved audit pass. Its ONE
TRAIN/CAL77579 closes exit1 during article retirement with late-lifecycle.
Root and independent saved failure audits pass: six pairs4159B, stderr351B,
cleanup true, emergency false, endchecks false. No drain, result, selection,
E5, fit or TEST exists. Last observed RPC page.close is not causal proof;
the precise failed lifecycle subpredicate is unknown.

The source has a definite prospective mismatch: active known-child lifecycle
is isolated safely, but retirement rejects every child and main DCL. This
successor addresses that mismatch without claiming it caused the actual failure.

## Terminal lifecycle validation

Use fresh study-v12 only. A private callback closure records read revocation
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
remain fatal. Known LIVE child frames require irreversible restricted-rendering
refusal and the existing bounded loader grammar. Unknown, removed, detached or
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
finite codes in the existing diagnostic family. Do not save raw fields, expand
DTOs or raise output/resource limits. Causal joined fakes cover main DCL,
verified and authenticated blank loaders, known child close events, missing
revocation, unknown main loader, unknown/removed/stale children and hostile
fields; retain all denial-original and physical-drain negatives.

## Active rejection without collection authority

Use a separate bounded retirement-denial ledger in fresh study-v12. Keep callback
health, original article/session incarnation and event checks before handling.
Require retiring, closeIssued and not retired, a new unique request-stage Fetch
pause, exact current main frame or already-known live child with irreversible
restricted-rendering refusal. Reject responseStatusCode, responseErrorReason,
redirectedRequestId, Document/unknown resource types, malformed descriptor/ID/
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

Retain exact typed frameNavigated outer {frame,type:'Navigation'}, descriptor-copy
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

## Source closure and unchanged study

Root mechanically copies the60 owned v11 files into fresh v12; all consumedv1-v11
CODE/maps/output remain immutable. In the new catalog replace only the ADR193
document CODE key with this restated contract; preserve the original file.
Keep124 CODE,138 catalog,239 complete
source keys,14 non-CODE pins,115 package files,29 producer keys and144 inclusive
TEST IO cap. No runtime dependency on the replaced document may remain.
Entry readiness starts closed; no old map, freeze or output is adopted.

Root owns this ADR, copy, catalogs, source maps, release, phase decisions and
status. Matcher owns only new v12 browser-capture.mjs, capture.test.mjs and
README-capture.md. Root also owns supervise.py/test and README-guardian for
adding the twelfth fixed workspace under the original aggregate caps. Independent
inventory and Trust reviews precede release and all actual decisions.

Maintain the exact168-row/73-family panel,48 TRAIN/48 CAL/72 TEST,166 supported
labels/two unverified. Preserve the fixed16-root model/cuts,25-node scope,
body.75/title.25/lambda.1,24 MEMBER/12 STOP/12 OUTSIDE TRAIN annotations, all
unavailable rows and full denominators. Capture all96 rows with24 normal batch
and final-cohort drains before192 sequential field encodes and exactly one
unchanged270-grid CAL fit. Independent successful selection audit precedes a
separate72-case TEST decision; no replacement/retry/relabel/post-TEST tuning.
Raw text and CAL/TEST vectors remain transient; saved TRAIN uses exact binary64
codec. Preserve source/asset authentication, original-pipe framing and physical
Job enumeration, native no-reparse sampling and no-reference publication.

Retain batch360s active/420s total/60 CPU seconds; TRAIN9420/9480s/1920 CPU,
TEST7005/7065s/1395 CPU; heap256MiB, Job/RSS/private1536MiB,128 members,
host physical/commit1GiB reserve, C2GiB/D4GiB. Charge all twelve workspaces to the
same8GiB/344064-entry ceiling, batch512MiB/8192 entries, evidence32MiB/log1MiB/
result512KiB. Preserve original package/assets/proof/callback/stage/cleanup caps.
No deleting old profiles, Windows changes or unrelated-process termination.

## Tests and execution gates

The joined causal fake must generate a new current-article request from page.close
and withhold destruction/close completion until the original denial fulfills.
Cover both exact blocked spellings, reentrant callback delivery, callback before
ACK, denial rejection/nonsettlement even after destruction, wrong frame, main ID
reuse, duplicate Fetch/Network IDs, Document/response-stage/redirect/error pauses,
unsafe descriptors/proxies/getters, response/data/finished contradictions, late
old-article callbacks and complete normal row/batch retirement. Demonstrate ledger
count/byte accounting refuses under original caps before another dispatch.

Retain all earlier typed-event, child lifecycle, causal continuation, first-error,
5040-order and pure guardian regressions. Root and independent reviews must accept
full literal source closure, original old pins, all guarded entries, actual pure
Python AST checks, secret scan and final external pins. Entry readiness starts
closed. Only then may Root separately authorize ONE metadata PREPARE after fresh
adequate original-floor resources. Saved independent actual preparation audit
precedes separate96 TRAIN/CAL; successful actual selection and independent audit
precede separate72 TEST. No retry/adoption, cap increase, provider/post/owner-profile/
canonical/service/crawler change. Quality and product integration remain unfinished.

## Completed source checks

Root, independent Trust and inventory review accept the complete source. The
private revocation closure performs actual journey retirement and gate closure,
then records proof; terminal observations contribute counters only. Main blank
and verified loaders, live restricted children, exact fields and all original
physical retirement requirements are covered. The stale inherited DCL-fatal
README paragraph was corrected after the hash-fenced full sweep completed.

All24 literal test entries pass sequentially with96MiB heaps:386 reports,
384 pass, zero fail, two expected offline-child skips,32652.478500000005ms sum.
These are repeated test reports, not unique cases or matching latency. Actual
pure Python suites pass71 supervisor/54 guardian tests, independently repeated.
Independent capture75/75 passes with no skips. The literal124-file secret scan
finds zero findings and its six self-tests pass.

Closure is124 CODE/138 catalog/239 complete sources including115 package files,
14 unchanged non-CODE pins,29 producer aliases and144 inclusive TEST IO entries.
All261 relative imports,31 query references and13 source/test/directory newURL
references are accounted for, alongside the existing asset-directory exception.
The60 owned files comprise42 strict namespace copies and18 declared changes.
All externally authenticated v1-v11 CODE/maps and both four-file probes remain
unchanged. No actual v12 output or phase decision exists at this checkpoint.

Only the reviewed readiness marker and matching documentation/test assertion
are updated now. Focused checks and independent final external pins precede a
separate actual phase decision. Neither this marker nor source acceptance grants
collection, model inference, TEST, canonical or runtime activation authority.


# ADR212 public article journey v3 - source-only


Pure, inert `createPublicJourney(options)` joins seven internal facts: the six
public requirements with request and response continuation settlement separate.
There is no IO, browser/CDP invocation, timer, cancellation, model or permission
grant. No closed entrypoint or old journey module is imported.

The original exact eight options are `{incarnation,frameId,blankLoaderId,url,until,guard,clock,onFailure}`.
ADR212 also permits optional `reportPreflight`, absent/null or a nonproxy function.
The opaque token and independently authenticated frame/blank loader belong to
the trusted future owner. `until` is its absolute pre-setup20s lease; callbacks
cannot renew it. HTTPS URL syntax is checked by unchanged `inspectPageUrl`, not
treated as DNS/TLS/robots/TDM or user-consent evidence.

After `begin(token)`, supply `reply`, `commit`, `response`, `lifecycle`,
`finished` and original physical continuation promises. `response` accepts the
exact existing `native-main-response-journey/v1` gate DTO (including independent
Fetch request/response IDs). The trusted network gate has already checked HTML
MIME, HTTP headers, actual peer and ordinary TLS; boolean/hash mirrors here do
not reperform or authenticate those checks. It keeps HTTP/native document-ID
noncorrelation explicit. Native reader/rights brackets remain outside this helper.

`observeContinuation(token,{kind,fetchId,networkId},originalPromise)` accepts
`requestContinuation` or `responseContinuation`. `invokeContinuation` validates
the same metadata before invoking a trusted zero-argument action exactly once,
also preserving a synchronous original throw. Native rejections retain the
original error object; reports retain only finite codes. Successful observer
results are always `undefined`: unused native ACK payloads are discarded, never
forwarded into another Promise's thenable assimilation. Both observers reject
proxies, subclasses, thenables, own constructor/then properties and accessors
before observation. Benign async_hooks own data symbols are permitted. Intrinsic
Promise prototype/constructor/species belong to the trusted realm; this is not a
hostile-realm sandbox. The outer owner still charges all physical pending work;
caller timeout, helper failure and cleanup retirement never settle that work.

Metadata/token/duplicate/deadline validation precedes **authority/fact
registration**. An already-started supplied original may reject even when that
validation refuses registration. Only if it passes the same hook-safe native
Promise structural checks, a separate cleanup observer immediately handles its
rejection (and discards fulfillment values). It registers no fact, adds no events,
does not change the first failure, and implies neither settlement nor slot reuse.
Hostile/unsafe promises cannot be safely observed through constructor/species:
the caller MUST independently track/handle every original physical operation,
including invalid promises refused by this helper. The helper never frees them.

`wait` resolves only after all seven linked facts; navigate is mandatory and no
other callback chooses the authoritative loader. Early continuation/finished
candidates and ignored lifecycle loader are bounded and must agree later.
Prepared exact-blank replay supplies no readiness. Article lifecycle rules remain
strict. `loadingFailed(token,{requestId})` gives only finite `network-failed` for
a known matching request, not a normal-unavailable classification or rights grant.

ADR186 additionally quarantines an exact initial-blank lifecycle in dispatched
phase ONLY for the existing ten IGNORED_LIFECYCLE names and before any accepted
reply/commit/response/dcl fact or private fresh-lifecycle candidate. Direct private
state closes this exception permanently; continuation/finished facts alone do
not select a loader. All original token/frame/ID/timestamp/name/lease checks run
first. The event is charged once and only increments the existing initialReplay
counter. It adds no fact, candidate, order, readiness, phase change or time lease.
Commit/DOMContentLoaded/unknown names, blank replies/commits/responses and all
post-fresh blank lifecycle events still refuse. No listener or native call changes.

Late contradictions latch the first failure and notify the outer owner, including
after readiness resolves. **Call `assertComplete(token)` synchronously before
and after every native/rights await and immediately before publishing a row.**
The fulfilled readiness Promise cannot be revoked. `retire` permits resolved
retirement or failed-terminal cleanup-only retirement, never publication or slot
reuse. Target destruction, tombstones, complete census and physical drain remain
the owner's independent requirements. A failed cleanup retirement may occur
after the read deadline without granting any new reading capability.

Limits:4096 events,160 ASCII-unit IDs,2048-unit URL, one slot/candidate per fact,
32KiB logical retained private record state and8KiB finite JSON report. Counters
include attempted invalid/overflow callbacks where event admission is reached.
This is not a V8/native/Promise allocation bound. No raw URL, hashes, protocol IDs,
headers, peer, text or arbitrary errors appear in reports.

Guarded invented-only tests:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v3/test.mjs
```

Tests exercise all5040 fact orders both unchanged and with pre-fresh idle injection,
the observed request-continuation-only state, every closing fresh fact/candidate,
all ten names, event4097 and post-fresh rejection. No public diagnostic cohort, actual browser,
model, artifact, capture, metadata freeze or study execution is authorized here.
Root and independent Trust must review source before any future integration.

## ADR212 first-report ownership

The ordinary live snapshot and every admission/event/continuation/retire method
remain unchanged. First failure saves phase, closed chosen code and blank flag
before the optional trusted metadata hook. Existing postfailure retire/lifecycle
mutations remain possible but cannot change that captured first report.

Storage control costs128 logical bytes from construction; an installed hook
costs another128. Before any first-report allocation, building reserves7168 and
checks the component's numeric32768 ceiling, then calls the hook once and requires
exactly undefined. This injection is composition, not authentication. Actual
capture binds pure aggregate arithmetic over the actual registered journey; no
guard, clock, native work or report read runs in that hook. Returned objects or
Promises are never inspected/assimilated or adopted as physical operations.

The private fixed Uint16Array40 costs80 payload+128 ownership=208. Cells retain
phase/code/events4097/seen mask,7 arrivals,10 ignored,13 replay and6 tristates.
No packet escapes actual storage. Pure exported codecs accept metadata, not
native provenance. They reject unsafe shapes/views/coercion without hooks.

The fixed full-record bound is3652. Actual separate scratch maxima are2730 for
first snapshot,1158 for record validation,1366 for packet validation,2680 for
decode construction and320 for indexed accounting. Round their maximum up to
3072:3652+208+3072+24=6956 fits7168 with212 slack. Returned helper frames do not
retain prior entry/descriptor/key-array histories. This is logical accounting,
not a heap measurement; the outer LIMITS.reportBytes remains8192.

The retained-byte accessor now uses bounded indexed existing constants and seven
literal own-field branches: frame,loader,requestId,responseId,networkId,settled,
fetchId. It creates no lookup container, entries/keys array, descriptor, iterator,
callback or prototype walk. All original bucket/field/value/counter sums remain
exact; a source-authenticated reference differential covers every actual row
shape, null/continuation states, failure, retirement and repeated steady reads.
With only320 scalar scratch, a steady3652 full view fits4096 (3972 including the
accessor). No old owner, native or unrelated report reservation is discounted.

Keep7168 through packing, original ready rejection and the entire synchronous
onFailure notification/handler registration. Only a still compact packet with
all temporary references cleared drops to208. A notification reader materializes
and memoizes one deeply frozen original report, staying at7168 THROUGH that
notification, including nested readers/accounting. Only after notification and
actual packet/temporary clearing does the steady full view cost4096. Repeated
reads return the same object. No later live fields reconstruct it. The reader preserves
ignored extra arguments, and returns null before failure without operator calls.

Any preflight/packing/materialization failure or building-reader reentry becomes
irreversibly unavailable, clears partial references, retains8192 and makes every
reader throw the SAME original journey error. Rejection and onFailure still run;
their original ordering and swallowed callback exceptions remain unchanged.
Neither notification cleanup nor reentry may restore compact/full state.
Unavailable8192 takes priority even while notification remains active.

A first late compact read does only numeric own-capacity preflight; no hook,
guard or clock. Aggregate callers must separately reserve7168 before that read.
Physical originals, native rights, failed retirement and all lease rules remain
independent. No actual study or model action is authorized by these sources.


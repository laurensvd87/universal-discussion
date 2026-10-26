# ADR186 public article journey v2 - source-only

Pure, inert `createPublicJourney(options)` joins seven internal facts: the six
public requirements with request and response continuation settlement separate.
There is no IO, browser/CDP invocation, timer, cancellation, model or permission
grant. No closed entrypoint or old journey module is imported.

Options are exact `{incarnation,frameId,blankLoaderId,url,until,guard,clock,onFailure}`.
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
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v2/test.mjs
```

Tests exercise all5040 fact orders both unchanged and with pre-fresh idle injection,
the observed request-continuation-only state, every closing fresh fact/candidate,
all ten names, event4097 and post-fresh rejection. No public diagnostic cohort, actual browser,
model, artifact, capture, metadata freeze or study execution is authorized here.
Root and independent Trust must review source before any future integration.

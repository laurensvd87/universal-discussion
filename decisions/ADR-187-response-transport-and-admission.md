# ADR187 Response transport and independent admission

Date: 2026-10-23. Status: Root and Trust accept the complete implementation;
Versions independently accepts the complete source closure. Final fixed pins
precede any separately recorded actual invocation below.

## Response ordering and the closed timeout

ADR186 preparation and independent audit pass. Its sole TRAIN/CAL attempt closes
at the first browser capture with capture/rpc-deadline, article-navigation and
last RPC Fetch.continueRequest. The exact timed operation is not retained. The
saved failure passes independent audit; cleanup passes without emergency
termination, while source endchecks do not complete. No batch drain, E5, fit or
selection exists. All consumed source, maps, output and profiles remain immutable.

A concrete upstream liveness defect is independently identified in the source:
our finishResponse waits for both Fetch's response pause and Network's response
before continuing that paused response. Chromium's response interceptor holds
the response and notifies Fetch; continuation forwards it to the navigation
client. Navigation response instrumentation then emits Network.responseReceived.
This gives a circular dependency for that pipeline. The original fake transport
emits Network response without requiring response continuation and hides it.
This is a source-level defect, not proof that ADR186 reached response pause or
that the current upstream revision exactly identifies the installed binary.

Primary sources checked2026-10-23:

- [Chromium response interceptor](https://chromium.googlesource.com/chromium/src/+/lkgr/content/browser/devtools/devtools_url_loader_interceptor.cc),
  OnReceiveResponse and InnerContinueRequest, lines2068-2095 and1458-1464.
- [Navigation response forwarding](https://chromium.googlesource.com/chromium/src/+/lkgr/content/browser/loader/navigation_url_loader_impl.cc),
  OnReceiveResponse to NotifyResponseStarted/delegate OnResponseStarted.
- [Navigation request](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/renderer_host/navigation_request.cc),
  OnResponseStarted invokes OnNavigationResponseReceived at5401.
- [Network event instrumentation](https://chromium.googlesource.com/chromium/src/+/lkgr/content/browser/devtools/devtools_instrumentation.cc),
  OnNavigationResponseReceived dispatches NetworkHandler::ResponseReceived.
- [Fetch protocol](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)
  specifies paused response transport and continuation separately.

## Transport continuation is not admission

Create a fresh native-specificity-study-v7 from the60 frozen v6-owned files.
Retain the unchanged, pinned public-journey-v2 and all seven fresh readiness
facts. Preserve ADR186's exact pre-fresh initial-blank lifecycle quarantine;
do not widen its names, phase, private-fact/candidate predicate or authority.

At the actual current main response pause, require descriptor-safe fields,
the exact sealed main frame/URL/NetworkID, a unique valid FetchResponseID,
integer status100-599 and bounded plain header name/value syntax before any
continuation. Keep the existing64-header/256-name/8192-value/16384-UTF8-byte
bounds and existing well-formed value grammar, including valid HTAB whitespace;
never permit CR/LF or the controls already rejected by the old header parser.
Names must be ordinary HTTP tokens. No accessors, proxies or coercion run.
Record an immutable
reservation and consume a one-use continuation-submission latch BEFORE the
trusted native action. Preserve the serial Fetch lane, original returned native
promise and physical pending tracking, including reentrant callbacks.

Submit exactly one responseContinuation for that reservation without waiting for
a later Network response. It contributes only the existing transport-settlement
fact, not response admission, rights, readiness, availability or a native read.
The journey already supports early continuation facts and later exact-ID joining.
If independent Network evidence is already present, validate that evidence first
so an already observed fatal identity/TLS/peer contradiction prevents dispatch.
A nonfatal authenticated status/header refusal may still need transport resume
to let navigation settle; it grants no collection authority.

When both independent response records exist, retain the original identity-first
URL/frame/request/status agreement, ordinary TLS, actual selected-public-peer,
status/MIME and header-policy checks unchanged. Only their successful existing
admitNativeMainResponse result may supply journey.response. Only after those
same independent checks may an ordinary HTTP/MIME/rights refusal be classified.
Both arrival orders must preserve fatal TLS/peer/identity priority. Missing
Network evidence remains a fatal bounded deadline, never unavailable input.
No Fetch.fulfillRequest, response modification, alternate peer, retry or raw
response-body API is introduced. Redirect requests remain subject to the same
exact primary/resource request gate; no new host or URL is authorized.

An already resumed response must never receive Fetch.failRequest for that same
FetchID. Duplicate pauses, changed reservations, unknown responses, rejected or
nonsettling original continuations and late contradictory callbacks remain
fatal. A refusal is held privately until the original continuation physically
settles and the existing normal article retirement, target-destruction receipt,
census absence and callback/socket/coordinator drain all pass. Only then publish
that article's unavailable row. Origin-policy skips without an article are
unchanged. Successful raw rows may retain their existing provisional RAM path,
but no semantic work or completed batch/cohort bypasses its original full drain.

The browser may now receive/render the response before independent header/peer
admission. This is an explicit transport-order change, not a claim that rendering
is collection authorization. Fresh isolated profiles, ordinary certificate
validation, bounded interception and request scope remain unchanged. No DOM
snapshot, native text extraction, model encoding or persistence is permitted
until the existing full response and native rights checks pass.

## Exact timer observation without changing deadlines

Add nullable timerWitness to the closed capture diagnostic, containing only
{lane,rpc}. Lane is ordinary/denial/cleanup; rpc is a member of the existing fixed
RPC label set, with unclassified for unavailable labels. Each coordinator entry
copies its label at registration; last-RPC is not used to infer it. At the
existing timer callback, privately bind this projection to the exact first
coordinator error before the original fail/onFailure path. Attach it only if
that same error opens the global first-primary diagnostic slot. Earlier faults,
later timers and cleanup cannot overwrite or borrow it. Unsafe projection yields
null and cannot change the original error, fail/abort ordering or cleanup.
A cleanup-lane timer may be recorded only if that exact error genuinely owns
the first primary; it cannot borrow or replace an earlier body error.

Retain ADR185's diagnostic contract explicitly: the journey witness is private,
synchronous, descriptor-safe and exact-error-bound; save/restore nested scope,
no caller input across await, no getter/Proxy/coercion or error-property access.
Earlier owner.commit overlap suppresses only witness attribution, never the
original journey fail call. No raw URL, ID, content, timestamp, stack, exception
message or caller-controlled label is persisted. The new timer projection adds
no timer, guard, clock, event, retry or resource call. Keep700-byte capture,
900-byte driver line and1KiB combined stderr ceilings; test their actual boundary
with the largest closed combinations. The first original error always wins.

## Source closure and ownership

The current TEST IO catalog exactly fills144 entries. Replace only the
unexecuted ADR185 document key with this ADR187 in the new literal CODE catalog;
ADR185's diagnostic/error-flow contract is restated above, not removed. Preserve
ADR179/180/181/184/186 source contracts and all other unchanged shared CODE keys.
Verify that no import, runtime read or producer recipe depends on the removed
document. Frozen v5 and its authenticated map remain the immutable historical
evidence; do not mutate or adopt them. The new124 CODE/138catalog/239complete
source counts and inclusive144 TEST IO ceiling stay unchanged. All14 non-CODE
pins,115 package files and all semantic parameters/panel rows remain exact.
The producer's existing29 source keys truthfully bind the new implementation,
without fake salt, fallback, retuning or relabelling.

Root owns the mechanical60-file copy, this ADR, driver boundary/IO tests,
README-driver, final map/readiness, integration and separate actual decisions.
Matcher owns only new v7 browser-capture.mjs, capture.test.mjs, README-capture.md,
supervise.py, supervise.test.mjs and README-guardian.md. The parent adds the
seventh fixed workspace under original aggregate caps and changes no other
resource, enumeration or cleanup behavior. Versions owns new catalog/protocol/
profile/ledger/entrypoint/admission files and associated exact tests/docs, with
the entry initially closed. No shared/frozen file is edited.

## Required evidence and actual gates

The causal fake must withhold Network response until the one real response
continuation, fail with the old waiting order and pass the new callback path
through all seven facts, native rights and normal closure. Cover both arrival
orders, reentry/duplicate pauses, malformed headers before dispatch, bad TLS and
wrong/private peers even with non2xx or reserved headers, status/header refusals
with zero native reads and publication only after settlement/retirement, missing
Network response, rejected/pending originals and late contradictions. Timer tests
distinguish concurrent ordinary/denial deadlines even when last-RPC was changed,
first-error identity, cleanup, projection failure and the unchanged byte bounds.
Preserve all prior5040-order, quarantine, physical settlement and rejection tests.

Root and Trust must accept the complete design/implementation, unchanged old
inventories, guarded full literal tests, separate pure Python AST tests, literal
secret scan and independently fixed final pins before Root may separately record
ONE metadata PREPARE. Independent saved audit precedes any separate fixed96
TRAIN/CAL decision; successful actual selection and independent audit precede a
separate72 TEST decision. No automatic retry, timeout/cap increase, replacement,
old-output adoption, post-TEST retune, provider/post/owner-profile/canonical/
service/crawler mutation is authorized here.

## Source acceptance and conditional preparation

Root's full literal CODE suite passes354 reports:352 passed, zero failed and two
expected offline-child skips in52122.0168ms. Separately executing the same
exported pure Python AST regressions passes71 supervisor tests in1.530s and54
guardian tests in0.161s. The124-file literal scan finds zero secrets; all six
scanner self-tests pass. The six older study maps and117/118/119/120/121/124
literal CODE inventories, including the unchanged journey-v2 files, remain exact.
The new namespace has42 exact namespace-only copies and18 declared changed owned
files. No new source map or output existed at that checkpoint.

Trust independently accepts transport-only early response continuation, both
arrival orders' unchanged independent security admission, zero native reads for
refused input, physical settlement and normal retirement before refusal rows,
the causal fake and exact timer-to-first-error attribution. Its independent
guarded suites and actual pure parent AST checks pass. Versions independently
accounts251 relative references,21 query aliases and24 test entries with no
unexplained dependency, no removed-document runtime dependency, unchanged14
non-CODE pins/semantic protocol and both earlier four-file probes unchanged.
Root accepts the implementation and takes only the three execution-readiness
files for the marker, matching assertion and explanation. The marker grants no
actual phase authority.
Post-readiness execution/protocol/ledger checks pass53/53 in2887.5881ms.

After independently accepted final byte pins, Root may separately record ONE
fresh v7 metadata PREPARE under the original60-second active/120-second total,
60CPU-second and unchanged memory/disk/Job/host limits. It authenticates CODE,
the maintained package and fixed local assets, derives all42 stage maps and
publishes the fresh freeze, with no public collection or model evaluation.
No retry, duplicate or old-output adoption follows. Independent saved preparation
audit must pass before a separate unchanged96 TRAIN/CAL decision. Successful
actual selection and independent audit precede a separate72 TEST decision.
Consumed source, source map and output become immutable.

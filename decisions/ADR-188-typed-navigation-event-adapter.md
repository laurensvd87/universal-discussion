# ADR188 Typed navigation event adapter

Date: 2026-10-23. Status: Root and Trust accept the complete implementation;
Versions accepts the complete source closure. Final byte review and actual
phase decisions remain separate gates.

## Browser protocol mismatch

ADR187 preparation passed. Its sole 96-case TRAIN/CAL invocation, session17851,
closed with exit1 at the first article navigation: public-journey/descriptor,
commit witness, dispatched phase and mask53. That mask contains reply, admitted
response and both transport continuations, but no accepted commit, DCL or loading
finished. Cleanup passed without emergency termination; endchecks did not pass.
No batch drain, semantic evaluation, fit or selection exists. Root and independent
saved-byte audits pass. Consumed v1–v7 sources, maps and output stay immutable.

The pinned Playwright protocol types and the current [primary CDP definition](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Page.pdl)
define frameNavigated as {frame,type}, with Navigation or BackForwardCacheRestore.
The unchanged journey accepts exactly {frame}. Passing the valid typed envelope
reproducibly fails descriptor validation; existing fake events omit type and hide
the mismatch. The actual failed callback envelope was not retained, so this is a
concrete source defect, not proof of that historical event's exact shape.

## Closed adapter and unchanged readiness

Create native-specificity-study-v8 from the60 frozen v7-owned files. At the raw
frameNavigated callback, descriptor-copy an exact outer {frame,type} envelope and
require primitive type Navigation. Reject missing/unknown types,
BackForwardCacheRestore, extra outer keys, accessors, proxies and malformed data;
there is no legacy missing-type fallback. Preserve the complete bounded copied
frame, including parentId and all existing identity fields. Build one fresh
{frame:copiedFrame} projection for owner.commit, journey.commit and synchronous
witness scope. Preserve owner-first, fail-both and exact first-error identity.

The projection removes only the already validated transport discriminator, not
any frame checks. Existing parent/child, frame, loader, URL, incarnation, phase,
duplicate and late-event rules remain exact. Child navigation remains restricted
rendering with no collection authority. Shared public-journey-v2 is unchanged,
including its narrow initial-blank lifecycle quarantine. All seven fresh facts,
response and native rights checks remain necessary before native reads.

## Retained transport and error contracts

Retain ADR187's transport/admission separation in full. The current main response
pause requires exact sealed frame/URL/NetworkID, unique FetchResponseID, integer
status100–599 and descriptor-safe header syntax before dispatch. Preserve64
headers,256 ASCII name units,8192 UTF-16 value units,16384 aggregate UTF8 bytes, HTTP-token names and the
existing valid HTAB/C1 grammar; disallowed controls and CR/LF remain rejected.
Freeze the reservation and consume its one-shot submission latch before the
trusted serial native continuation. Track its original promise physically,
including reentrant callbacks. Early responseContinuation is transport settlement
only, never response admission or collection permission.

Both independent response records must still pass the original identity-first
URL/frame/request/status agreement, TLS, selected-public-peer, status/MIME/header
and native rights checks. Already present fatal evidence prevents dispatch;
nonfatal policy refusal may resume transport but supplies no read authority.
Missing independent Network evidence remains fatal. No response modification,
fulfillment, raw body read, retry, alternate host or peer is introduced. Never
failRequest an already resumed response. Duplicate or changed reservations,
rejected or nonsettling originals and late contradictions remain fatal. Publish
a refusal row only after physical settlement and normal article retirement,
target destruction, census absence and callback/socket/coordinator drain. Browser
rendering may precede admission; DOM/model reads may not. Completed batches and
semantic work still require the original full drain.

Keep nullable journeyWitness and timerWitness exactly error-bound. The former is
private synchronous descriptor-safe scope with nested save/restore; owner overlap
suppresses attribution only, not the original fail call. The latter contains only
the existing entry-owned {lane,rpc}, privately bound at its original timer to the
same first primary error. Later timers/cleanup cannot borrow or overwrite it.
No error-property access, getters, proxy hooks, raw IDs/URLs/content/timestamps,
stacks or exception messages are persisted. Keep700-byte capture,900-byte driver
and1KiB combined stderr bounds. Add no clock, timer, retry, cap or deadline.

Retain ADR179/180/181/184/186 and all other bound contracts: exact fixed source
authentication; physical Job enumeration with bounded mismatch handling; original
resource/cleanup limits; fresh source/asset verification; no-reference publication;
and unchanged panel, root model, cuts, annotations, recipe and TEST separation.

## Ownership and source closure

Root owns the mechanical60-file namespace copy, this ADR, driver/IO boundary
tests, README-driver, final readiness/map, audits and actual decisions. Matcher
owns only new v8 browser-capture.mjs, capture.test.mjs, README-capture.md,
supervise.py, supervise.test.mjs and README-guardian.md. Parent aggregation adds
the eighth fixed workspace under original aggregate limits; nothing else changes.
Versions owns the same16 catalog/protocol/profile/ledger/entrypoint/admission
files and tests/docs as v7. Entry readiness starts closed. No consumed file or
shared journey file is edited.

Replace only the unexecuted ADR187 document CODE key with this ADR188, whose
sections above retain its authority and error contracts. Verify no runtime read,
import or producer recipe depends on the removed document. Keep124 CODE,
138catalog,239complete sources, the inclusive144 TEST IO limit,14 non-CODE pins,
115 package files and29 producer keys. No capability, semantic retuning, new
module, diagnostic field or permission expansion is introduced.

## Required tests and actual gates

Use genuine typed CDP events in the joined causal fake, including both response
arrival orders. Demonstrate valid Navigation reaches unchanged native readiness
and normal closure; reject BFCache, missing/unknown/extra/unsafe outer fields,
malformed frames, child/late/duplicate contradictions and changed identities.
Include nested frame getters/proxies and copied-frame independence tests.
Preserve all earlier causal continuation, security-admission, timer, witness,
physical-settlement,5040-order and quarantine regressions. Inspect adjacent
protocol event adapters for the same static mismatch before another actual cohort.

Root and independent reviewers must accept source closure, unchanged old pins,
full guarded literal tests, actual pure Python AST checks, secret scan and final
fixed pins. Only then may Root separately authorize ONE metadata PREPARE.
Independent saved preparation audit precedes a separate unchanged96 TRAIN/CAL;
successful actual selection and independent audit precede a separate72 TEST.
No automatic retry, replacement, old-output adoption, timeout/cap increase,
post-TEST retune, provider/post/owner-profile/canonical/service/crawler change.
Hierarchy quality remains unmeasured and product integration remains unfinished.

## Source acceptance

The full24-entry guarded literal CODE suite passes359 reports:357 pass, zero
fail and two expected offline-child skips in42496.2427ms. Separate execution of
the actual exported pure Python AST checks passes71 supervisor tests in1.296s
and54 guardian tests in0.131s. The literal124-file scan finds zero secrets and
all six scanner self-tests pass. Old v1-v7 CODE inventories and authenticated maps,
including shared journey-v2, and both four-file Job probes remain unchanged.
The new namespace contains42 exact namespace-only copies and18 declared changed
owned files. No output or reviewed map existed at this checkpoint.

Trust independently accepts the full typed envelope/copy boundary, zero-hook
malformed paths, owner-first/fail-both/first-error ordering, unchanged readiness,
typed causal and both response orders, restricted child handling and eighth-root
aggregation under unchanged limits. Independent capture/parent/journey checks
pass83 tests with one expected offline skip; actual parent AST passes71 tests.
Versions independently verifies253 relative references,23 query aliases and24
test entries, no unexplained dependency or removed-document runtime dependency,
unchanged14 non-CODE pins and29 producer keys, and all frozen inventories.

Root accepts the implementation and takes only execute.mjs, execute.test.mjs and
README-execution.md for the reviewed readiness marker and matching assertion.
That marker does not grant actual phase authority. Final fixed pins and an
independent byte audit must precede a separately recorded ONE metadata PREPARE
under the original60-second active/120-second total/60CPU-second limits. Saved
independent preparation audit still precedes any separate96-case TRAIN/CAL.
Post-readiness execution/protocol/ledger checks pass53/53 in3466.6692ms.

# ADR169 Native article navigation witness

Date: 2026-10-20. Status: independently accepted for source-only implementation.
Preparation, source-freeze audit and a single native invocation remain separate
gates. No public acquisition, model access, semantic scoring or live activation.

## Problem and required result

ADR168's one actual invented-article diagnostic failed at navigation verification
after Page.navigate and Playwright DCL returned, before native document lookup or
text read. Its source, freeze and output are closed and immutable. The retained
finite error does not identify whether commit was missing, frame/loader identity
disagreed, or the navigation result contained errorText. Do not claim that event
ordering caused the observed failure or that HTTP delivery failed.

Different CDP sessions do not establish a shared callback-delivery fence. The
successor must explicitly join the navigation facts on its own authenticated
article session before invoking the unchanged owner's navigation verification.
It must also retain enough finite predicate evidence to distinguish another
failure, without storing raw protocol identities, URLs, content or native errors.

## Private five fact rendezvous

Arm one private journey before dispatching the single intended navigation. Retain
at most one bounded record for each of these independently observed facts:

1. The successfully settled Page.navigate RPC response.
2. The actual Page.frameNavigated main-frame commit.
3. The Network.responseReceived Document response.
4. Page.lifecycleEvent DOMContentLoaded for the same main frame and new loader.
5. Successful physical settlement of the one synthetic route.fulfill operation.

Accept any arrival order. Each fact must belong to the same private article
incarnation and agree on the exact authenticated frame, fresh loader and fixture
URL wherever the protocol supplies them. DCL has frame/loader, not URL: do not
invent cross-protocol fields or equate Chrome scripting document IDs with CDP
loaders. Contradictions fail immediately; missing facts wait only within the
original absolute20s article lease, which begins before the first setup RPC.
There is no new deadline, navigation, retry, additional session or fallback.

Install the existing-session lifecycle callback before enabling lifecycle events
with one Page.setLifecycleEventsEnabled({enabled:true}) command. Independently
capture the initial blank frame and loader first. An early candidate event may
be quarantined but never selects the authenticated article loader merely by
arriving first. Only the exact authenticated initial blank events can be ignored
under a declared pre-navigation rule. Structurally checked non-DCL events may be
ignored only through a literal bounded event-name enum; unknown names, subframes,
contradictory loaders and retired article incarnations fail closed. Ignored
events remain counted against the existing event ceiling.

Retain every original owner.commit check at the actual commit. Invoke unchanged
owner.verifyNavigation exactly once only after all five facts agree. A same-
document reply without a fresh loader, any own errorText property even empty or
undefined, isDownload true, redirect, duplicate, stale/blank loader or unexpected
navigation remains invalid. A subsequent duplicate or contradictory callback
must still suppress publication after the rendezvous has resolved. The same
owner.assertReading, rights, native-document and post-read checks remain required.

Fulfill settlement means the actual route.fulfill promise fulfilled, not token
reservation, dispatch start, timeout, a wrapper that swallowed rejection or a
fulfilment ACK used in place of document evidence. Physical operations remain
charged until they settle. An unsettled operation cannot free capacity or permit
profile reuse; owned cleanup retains its existing failure behavior.

## Finite failure evidence and limits

Reserve one fixed-shape predicate report for the first failed journey. Store
only seen flags, bounded arrival ordinals/counters, frame/loader agreement and
freshness booleans, finite failed-predicate categories, and these finite result
states: errorText absent/undefined/empty/nonempty/malformed; download absent/
false/true/malformed. No raw IDs, URLs, arbitrary strings/errors, hashes or input
text. Capture the first fault once; observation must not mask the original
failure, defer an action, suppress a validation or change cleanup.

Journey state has one record per fact, fixed-enum counters and one first-fault
record. Integrate it with existing4096 event,32 target,32 summary and64KiB report
ceilings. Test maximum serialized diagnostic size and explicit per-journey storage
bounds. All earlier Job CPU60s/memory1536MiB, Node heap256MiB, output512MiB and
guardian350/360/420s child/active/wall ceilings remain unchanged. No expansion of
public networking or authority follows from this diagnostic.

## Source composition and ownership

Matcher owns exactly six new files under
`spikes/topic-resolution/harness/experimental/native-article-journey-dev-v1/`:
run.mjs, journey.mjs, source-ledger.js, supervise.py, test.mjs and README.md. Root
owns this ADR and compact evidence outside the closure. No edits to ADR168 or any
of its209 frozen source entries, its freeze or output.

Reuse the unchanged, individually pinned ADR168 article owner, fixtures, native
adapter, worker and manifest. Never invoke its old runDev/main/supervise.run or
mutate old module globals. The new entrypoint and guardian may be narrow
mechanical copies where closed HERE/OUTPUT/OWN/staging constants require them;
review their exact consequential deltas rather than introducing a generic runner.
Reused worker schema identifies the same four invented cases; a new study ID and
new diagnostic/freeze/result namespaces distinguish this attempt explicitly.

The literal217-source closure is ADR168's authenticated209 sources plus its fixed
freeze metadata, the six new files and this ADR. Authenticate the fixed168 freeze
bytes before following any inherited path. Required168 freeze SHA256 is
cc765e8d98f5909142bd229a842e4523ae959999152872fd51ce238b7554bc73;
its ordered source-map digest is
e1240c83b7f98995b5e31b0b849a7ce5a5e179a42c68337c58b79f092ffe2136.
Old source imports confer no permission to open outputs, profiles, captures,
models, closed study inputs or artifacts. All transitive executed code and the
installed byte-pinned package remain covered by the actual initial/end inventory.

## Required tests and separate gates

Invented-client tests must execute the real new journey integration, not a second
model of its behavior. Cover all120 orders of the five facts, delayed commit after
Playwright DCL, each missing fact/deadline, mismatches, duplicates, descriptors/
proxies/getters, blank/stale/subframe lifecycle, unknown lifecycle names, any
errorText property, missing loader, downloads, failed/unsettled fulfill, late old
incarnations, late post-settlement faults and exact lease boundaries. Prove zero
input publication on all refusals and unchanged physical settlement accounting.
The actual parsed guardian Python tests must run separately as before, including
new report-schema validation and bounded failure projections.

Root and independent Trust must read all six files and consequential imported
paths, inspect the mechanical adaptations, run focused tests and accept the source
before one metadata preparation. Both actual217-source inventories and exact
freeze bytes must then pass before separate authorization for ONE owned DEV.
Any actual attempt closes this version, pass or fail; no automatic retry or
rewriting of evidence. Success would establish only four invented native article
lifecycles and cleanup, not public rights/TLS or hierarchical matching quality.
The full held-out root/child/STOP/sibling/outside study and canonical/client/
crawler/owner-control integration remain required for the original goal.

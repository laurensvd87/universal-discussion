# ADR-109: Independent canonical feed and optional projection lane

Date: 2026-10-13
Status: Approved by the owner; implemented, reviewed and backend activated

## Evidence and approval

During active crawling the owner still saw Not connected, a context-change
warning, failed page matching and an indefinitely loading Discussion tab.
ADR-108 kept health responsive, but selected catalog context still waited for
related, historical and revision-invalidated Ridge planning. Actual selected
context hit its five-second deadline twice; subsequent optional calls returned
capacity. Fast health alone did not prove the selected-page experience worked.

The owner explicitly approves returning canonical context/discussion first,
loading optional matching separately, and a thirty-second response lease for
authenticated optional matching only. Core reads and raw ingress stay at five
seconds. This does not authorize provider inference, capture expansion, hosting,
database migration, credential rotation, or command replay.

## Decision

Normalized disk startup uses two separate bounded read-only worker lanes:

- Core: catalog, selected catalog context, catalog page, discussion, discussion
  page and exact Source. Existing 32 distinct tasks, 4,096 coalesced waiters and
  fifteen-second queue lifetime remain; HTTP/client core deadlines are five
  seconds. This worker receives no optional metric artifacts.
- Projection: enrichment, related, earlier same-Source Topics and alternate
  discussion. Eight distinct tasks, 4,096 coalesced waiters and a thirty-second
  queue lifetime. Each worker retains its existing 256/32 MiB heap limits,
  bounded inputs/results, cancellation, awaited retirement and exact version
  delivery guards. There is no dynamically growing pool.

Selected catalog context no longer computes related, prior or Ridge metadata.
The ingestion commit barrier drains only core reads; an optional computation
cannot prevent a prepared guarded ingestion from committing. No SQLite read
transaction is held through optional CPU work. A changed version invalidates
the optional result, rather than rebasing it or pretending it is current.

POST `/v1/sources/enrichment` accepts exactly nonnull sourceId and topicId and
boolean includeAlternate. After Host, Origin, pairing, optional account, schema
and original five-second ingress checks, trusted transport grants an absolute
thirty seconds from socket acceptance. It cannot revive expired ingress, be
repeated, cross another lease, or accept caller-selected duration. Existing
related/alternate endpoints and all other ordinary routes retain five seconds.

The response contains coherent catalog and canonical discussion plus nullable
related, priorDiscussions and alternateDiscussion sections. Errors are fixed
nullable unavailable/capacity/conflict/invalid-response codes, not raw details.
Supplemental metadata includes exact related Sources, historical Topics and
alternate canonical destinations. Oversized optional data may be omitted with
capacity; oversized mandatory core data still fails closed. All remaining
sections share the exact generation/revision, checked again before delivery.
Public account labels are renewed on the main service, not sent into workers.

The extension strictly validates schema, requested Source-to-Topic assignment,
all section versions/metadata and existing full alternate-thread proofs. It
publishes canonical ready before optional work, with one enrichment flight per
current context and bounded transient read-only recovery. A newer bundle must
retain the same generation/Source/Topic and cannot roll back the revision. Its
catalog and canonical discussion replace together. Foreground/window/document,
capture session, actor, epoch, disposal, edit/deletion and draft fences remain.
Neither commands nor page reading/embedding/ingestion/provider operations gain
automatic retry. Optional failure does not clear the canonical feed or keep
its loading spinner running. Paired health evidence is displayed separately
from page-match readiness; uncertainty is not described as proven navigation.

## Verification and limits

New isolated synthetic port-4175 load holds a real optional worker response for
ten seconds after computation. All 2,000 concurrent core reads return 200 under
five seconds (observed maximum 1,374 ms), while optional completion takes 12,208
ms. A guarded ingestion commits while optional work remains held; its old
optional result returns 409 without content and a fresh result returns 200.
Cancellation, deletion, authority expiry and separate 8/32-task overload checks
preserve core health. No owner data or provider call is used by that harness.

This demonstrates bounded concurrent core reads, not thousands of distinct
expensive projections or writes per second, a new-connection burst, hosted
release readiness, unlimited catalog growth, or verification of the owner's
Chrome profile. Canonical full-thread response bounds and other account,
private, search, grouping and model limits remain. Activation and final test
evidence are recorded in STATUS and IMPLEMENTATION_HANDOFF.

Independent reviews also found and corrected a stale human-edit race: a local
editor now binds the original full target body/actor/Topic/discussion, detaches
changed or deleted targets while retaining unsent text, and rechecks before
dispatch. Binding metadata never enters the command wire DTO. Partial related
failure no longer clears successful alternate data; newer bundles clear old
related/historical bodies before refreshing. The toolbar publishes its verified
canonical badge before a detached strict enrichment request.

The normal service was restarted while idle with saved pairing. Canonical,
private and crawler database fingerprints, generation/revision3063 and
2,434 Sources/2,449 Topics/75 contributions are exact before/after; saved pairing
and connected protected provider sign-in remain. Actual selected context takes
13 ms, discussion6 ms, optional enrichment11,299 ms with all sections successful;
32 simultaneous core probes during it all return200/max18 ms. No owner
ingestion, private generation, provider inference or crawler start was performed.
Extension0.13.62 requires an owner reload; actual owner-profile UI remains for
the owner's check, not established by isolated Chrome fixtures.

Final offline verification: full backend1,006 pass/five platform skips;
exact restricted extension1,537 pass; independent transport/storage/frontend
reviews accept; isolated Chrome31 captures including pending/busy canonical
visibility pass. Secret scans779 backend/245 extension files report zero.
An unchanged ready-status poll cannot bypass bounded read recovery. Detached
toolbar work is accounted for before the status-query fixture's read baseline;
status requests themselves still perform no capture, embedding or extra read.

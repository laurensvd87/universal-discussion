# ADR172 Native article retirement

Date: 2026-10-20. Status: root and independent Trust design accepted for
source-only implementation. Metadata preparation, frozen audits and one actual
owned invocation remain separate gates.

## Verified retirement instead of redundant detach

ADR170's one actual Chrome diagnostic passed the first invented article's five
navigation facts, native tab/document lookup, rights snapshots, text read and
fixture hash validation. Actual page close, transport drain, the owner's exact
target-destruction signal and the subsequent full census completed. The next
article-detach operation failed with finite client-operation classification.
The underlying error was not retained; do not attribute it retroactively.

The installed pinned Playwright coreBundle.js at lines36386–36446 rejects
CRSession.detach when the session is already closed, and its CDPSession wrapper
disposes a session after matching Target.detachedFromTarget. That supports a
post-close detach hazard, not proof of the actual ADR170 exception. Its217-source
freeze and all outputs are closed immutable and cannot be rerun.

Remove only the redundant explicit cdp.detach RPC after verified retirement.
Do not move it earlier, catch-and-ignore its failure, remove listeners or weaken
the owner, document, reading or source checks. The required order remains:

1. Retire the journey and owner; stop the fixture transport.
2. Await actual page.close, actual transport settlement and the owner's exact
   owned-target retirement signal within the original retirement allowance.
3. Run the complete census and prove that article absent while the exact anchor,
   infrastructure and extension-worker identities remain valid.
4. Check fatal/deadline state, call unchanged owner.retired, mark that incarnation
   retired and clear the active article before allowing the next slot.

Keep all callbacks installed and strict. Late old navigation, frame, lifecycle,
target or transport callbacks must neither mutate the next article nor enable
publication. Removing a command does not prove explicit session disposal.
Final context/browser close, physical drain, exact final census and the guardian
acknowledgment remain mandatory for success.

## Tests and unchanged bounds

Use the actual new runner with an invented automatically closed CDP session
whose detach would throw. Prove zero detach invocations and four completed
articles. Missing target destruction, lingering/revived/wrong target, unsettled
transport or callback work, duplicate destruction, late original events and
final close/drain failure must prevent slot reuse or returned publication.
Retain both final close attempts exactly once and every earlier negative test.

Preserve the20s article lease, bounded retirement allowance, five-fact agreement,
initial-blank replay policy, event/registry/report caps, resource/Job limits,
physical-operation accounting and all fixed-source authentication. Update
operation-stage enums, tests, result validators and documentation to remove
only the obsolete RPC; do not claim explicit detach occurred.

## Source ownership and execution gates

Matcher owns exactly six new files under
`spikes/topic-resolution/harness/experimental/native-article-retirement-dev-v1/`:
run.mjs, journey.mjs, source-ledger.js, supervise.py, test.mjs and README.md.
Root owns this decision and evidence outside the closure. Mechanically derive
from170 without importing or executing170 runtime code, main or guardian, or
reading its output. Journey behavior is unchanged except new namespaces.

Reuse the unchanged pinned168 owner, fixtures, native adapter, worker and
manifest. The literal closure is217 entries: original authenticated168209,
its fixed freeze metadata, the new six files and this decision. No170 source
or output becomes a runtime dependency. All older frozen material remains exact.

Root and independent Trust must read complete source and consequential deltas,
pass guarded tests plus the actual parsed Python validator, and agree on both
actual code inventories before one metadata preparation. Exact frozen bytes and
all217 entries must then pass both actual audits before root may authorize ONE
owned DEV. Any actual attempt closes the version without retry. This diagnostic
confers no public, model, provider, HBA, native database or live-runtime authority.

Even four successful invented articles do not establish hierarchical matching
quality. The full held-out hierarchy study and production integration remain
required for the original goal.

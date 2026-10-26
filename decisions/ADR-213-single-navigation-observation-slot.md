# ADR-213: One bounded navigation-failure observation slot

Date: 2026-10-24
Status: SOURCE design accepted by Root and Trust; standalone prototype only

## Problem and evidence

The one ADR212 TRAIN/CAL attempt, session32975, closed with exit1 after three
batch drains and a fourth start. Its first diagnostic was
`capture:terminal-frame-navigation` during article retirement. All seven
witnesses were null. Root and independent saved-failure audits pass; the exact
callback, frame, branch and underlying browser cause remain unknown. `page.close`
was the last observed RPC, not causal proof. The authenticated Playwright path
for `runBeforeUnload:false` uses `Target.closeTarget`; it does not establish a
close-induced blank navigation that could justify an admission exception.

Evidence:

- Root failure receipt: `apps/local-service/data/native-specificity-study-adr212-train-cal-failure-20261024.json`,
  FILE `8c9b08f9f0395a923ee6863e08cf55f44fa49b57a1ab7fe035b8b80a0bedd470`.
- Independent audit: `apps/local-service/data/native-specificity-study-adr212-train-cal-failure-audit-20261024.json`,
  FILE `bc986ddec76df9f815f41fd8e9efbf97fbedec6cd2c64ee32242859d26796b91`.

No result, selection, E5 inference, fit, TEST or quality acceptance followed.
All consumed v1-v19 source, maps, packages and output remain immutable.

## Proposed prototype API and sequencing

`createCaptureContextObservation()` returns one callable with these fixed
command forms, not an object of separately retained method closures:

```text
navigation(original, binding, site, state, balance, urlRelation)
terminal(original, binding, site, predicate, frameRelation, mainDetached)
selectPrimary(original, binding)
selectCleanup(original)
release()
retainedBytes()
```

Here `binding` is a primitive Symbol, not a helper, page, frame, callback or
caller-created DTO. The holder does not authenticate its issuance. A future
collector port must independently prove the exact token belongs to the actual
private helper/article at the original call site; replacing the original helper
identity check with token equality alone would not establish that proof. Both
variants use the same exact-binding rule. There is no null-binding wildcard.

The first claim latches presence and original before validating context or
packing context. It allocates no view and returns before any view construction.
All later claims are inert. Invalid context leaves sticky null. Every actual
first-global catch must synchronously
invoke exactly one selection command at its existing first-error latch,
including faults with no context candidate. Primary selection succeeds once
only for the exact original (`Object.is`) and binding. Selection with no claim,
wrong identity/binding, or cleanup selection irreversibly blocks all later
claims and returns null. No caller-supplied earlier-fault boolean is accepted.
The prototype cannot authenticate the caller's global chronology; eventual
source wiring must prove this synchronous handshake and priority.

Release clears the holder's original, binding, packed context and own view and
permanently revokes it. Late or reentrant claims/selection cannot restore it.
A view already held by a caller remains caller-owned; release cannot reclaim
or revoke those bytes. Keep the full256 reservation in every state while the
capability or its issued view may be retained; no early-refund API is added.

The internal scalar path uses literal comparisons/switches to validate and pack
the context into one scalar, with no descriptor, key, array, iterator or lookup
container. The control inventory is128 bytes: one callable and at most eight
retained scalar/reference cells. Its separate128 construction/view allowance
covers the maximum six-field view (`64 + 6*8 =112`) plus at most16 simultaneous
scalar scratch while that view exists. View materialization occurs only during
the later matching primary-selection invocation, after the claim frame has
returned. Selection irreversibly consumes eligibility and clears retained
original/binding references before projection. A post-projection phase check
prevents reentrant release from restoring the view. Nested selection returns
null and cannot replace the already-selected first primary; projection failure
is sticky null without another materialization attempt.

Clearing named parameters alone is not proof of reference retirement: strict
JavaScript has an unmapped `arguments` object whose indices can still hold its
incoming values. The two-invocation lifetime removes claim-context overlap
without relying on that false claim. Selection has only already-owned original
and Symbol identity arguments. VM-frame/arguments-object overhead and arbitrary
original object graphs are explicitly outside the logical metadata allowance
and remain the external owner's accounting obligation. No physical heap bound
or garbage-collection claim follows. Shared fixed literals are not
caller payloads. A source inventory must prove these lifetimes; the numbers are
logical accounting, not a JavaScript heap measurement.

Adversarial wire-projector copies, outer diagnostic storage and transport
allocations are outside this holder proof. A standalone wire validator may
exercise its own declared bound; passing its tests does not prove those
allocations fit the actual collector's32768-byte lifetime envelope.

## Proposed smallest source slice

Build a standalone three-file prototype of a single first-context holder. Do not
copy another full study, change the frozen collector, create a new execution
entry, or run a browser. The holder is diagnostic data machinery, not native
provenance, publication, queue or assignment authority.

The intended later port replaces the existing navigation observation holder,
rather than adding another reservation. Its wire representation is a closed
union in the existing `navigationAccountingWitness` field. The original main
navigation observation retains its exact schema and meaning. A terminal variant
names only fixed call-site and refusal-predicate enums. It must not be inferred
from a later callback label, last RPC, an error property or a reinspection of raw
event payloads.

Six distinct existing terminal branches need distinguishable observations:

1. Typed fresh navigation: the frame is the main frame.
2. Typed fresh navigation: a non-main frame lacks its parent field.
3. Typed fresh navigation: the known child's stored parent differs.
4. Typed within-document navigation: the frame is the main frame.
5. Playwright terminal navigation: the main frame is already detached.
6. Playwright terminal navigation: the object is the captured main frame.

This enumeration must preserve existing short-circuit priority: typed main
before missing parent; Playwright detached before main-object equality. The
existing terminal revocation/session/token/page/close-state checks still precede
these branches. Passing a terminal check is not permission for a new read.

## Non-negotiable constraints

- Preserve the original thrown value and existing failure dispatch. A presence
  latch, not truthiness, controls first observation. `Object.is` binds the exact
  original, including NaN and falsy primitives.
- Fixed site/predicate literals come from the actual refusal call site in a
  later reviewed port. Equivalent-looking DTOs or a prototype caller do not
  authenticate the native origin of an observation.
- Projection failure is sticky null; it neither replaces the original error nor
  permits another branch, cleanup failure, wrapper error or later article to
  lend a witness. Getters, proxies, thenables and error hooks are never inspected.
- The holder may retain only bounded scalar/context metadata. No raw URL, frame
  ID, payload, document text, native error message, stack or browser object may
  be hidden in its observation view.
- Derive the worst retained holder and view lifetimes explicitly. A future port
  must genuinely share or replace the existing256-byte observation budget;
  distinct simultaneous candidates must never receive a mutual-exclusion
  discount without proof. No extra uncharged callback or retained binding.
- Keep the existing32768-byte aggregate and700/900/1024-byte diagnostic ceilings.
  Closed-schema exhaustive byte checks must cover the unchanged old diagnostic
  space as well as the terminal variant, not just one successful example.
- Keep original clocks, timers, guards, callbacks, physical cleanup, seven fresh
  facts, independent TLS/peer/header checks and native document/rights proofs.

## Review and test gates

Root owns this decision and integration boundaries. Native owns only the newly
assigned prototype module, test and README. Trust independently reviews its
source, retention inventory, unsafe-input behavior and exhaustive wire checks.
Exact paths and API require Root's separate assignment before implementation.

Tests use invented values under the external-capability guard and authenticate
all nominal frozen dependencies before following or importing them. Cover both
union variants, all six predicates and their short-circuit priorities, all falsy
originals, competing first faults, projection faults, cleanup/release/late calls,
unsafe shapes with zero hooks, bounds and invalid combinations. Claims must
distinguish prototype behavior from actual collector wiring.

After prototype review, an actual collector port would require its own source
design, exact binding and allocation proof, unchanged full fixture assertions,
complete source review and separately authorized actual phases. This decision
grants none of those steps automatically. It does not authorize a retry or
adoption of ADR212 output, TEST, provider work, live database changes, service
restarts or crawler changes.

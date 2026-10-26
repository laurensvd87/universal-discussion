# ADR197 Finite infrastructure identity diagnostics

Date: 2026-10-23. Status: Root, Trust and inventory accept this source-only design
with the implementation clarifications below incorporated.
No actual browser diagnostic or study successor is authorized by this decision.

## Observed failure and next evidence

ADR195 preparation22187 passes Root and independent saved audit. Its ONE
TRAIN/CAL89765 closes exit1 after two normal batch drains and the third start.
The first failure is startup/infrastructure-identity during target-discovery;
lastRPC Target.setDiscoverTargets is observational. The event, target role,
identity subpredicate and raw values were not retained. Cleanup passes without
emergency; endchecks fail, with no final cohort drain, E5, fit or selection.
All consumedv1-v13 source/maps/output remain immutable. The saved audit is
apps/local-service/data/native-specificity-study-adr195-train-cal-failure-20261023.json.

TargetInfo attached describes a client attachment; context and parent/opener
fields are optional. Chromium constructs snapshots and emits changed information
as targets change. These facts expose a fake-coverage gap, not this failure's
cause or permission to accept a changed identity. See the
[Target schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl)
and [Chromium target handler](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/protocol/target_handler.cc).

Keep every rejection and first-error rule. Add enough finite evidence to identify
the failed predicate before designing a behavioral change. The next actual
diagnostic should stop after startup/pre-load census and normal closure, before
extension loading, public navigation, native reads or inference. Its parent,
source inventory, resource accounting and one-attempt permission are separate
unfinished gates; this first slice creates only the pure policy component.

## Pure diagnostic policy

Create exactly policy.mjs, policy.test.mjs and README.md in
spikes/topic-resolution/harness/experimental/infrastructure-identity-witness-v1.
Extract the complete createInfrastructurePolicy implementation and its minimal
pure descriptor helpers from the immutable exact-browser-infrastructure-v1
compatibility-variant.mjs. Import the same immutable StartupFatal definition from
native-extension-startup-dev-v1/run.mjs. This necessarily evaluates its existing
default-inert static dependency graph, including browser/adapter/source-ledger
modules; a named import does not bypass module evaluation. That exact existing
graph is allowed, not invocation of its runners, browser operations, model or IO.
The pure component introduces no such operation or import-time IO. Root authenticates
the original module before treating its extracted predicates as the baseline.
No old source, study list, map, package or output changes.

Preserve the original method behavior, validation order, descriptor handling,
input grammar, errors, return values, state mutations, two allowed endpoints,
all census comparisons and closing rules. Do not add a new accepted transition,
target, context fallback, attachment exception or duplicate rescue. Do not expose
the private member maps, target IDs or validated payloads through diagnostics.

Inside the new private closure, retain the exact first internally thrown policy
error and, only if that error is infrastructure-identity, its frozen witness:
schema native-infrastructure-identity-witness/v1, site, role and predicate.
Site is one of created, changed, census or worker. Role is one of anchor,
ui-root, ui-aim, worker or other. Predicate is the first failed original test:
terminal, type, url, context, attached, parent, opener, duplicate-created,
duplicate-role, duplicate-id, target-capacity or worker-present. Derive labels
only from already descriptor-checked private primitive data. Retain no raw IDs,
URLs, titles, hashes, timestamps, stacks, values or caller records in the witness.
The diagnostic must not overwrite, decorate or replace the original error.

readFailureWitness(error) accepts exactly one argument and returns the witness
only for that exact first private error; forged/equivalent/other/proxied errors
and wrong arity return null without inspecting arguments. An earlier non-identity error prevents later identity
witness capture. Reading cannot change the first error or policy state. Normal
release clears the retained error/witness along with the original maps; later
callbacks cannot recover an earlier incarnation's witness. Add a fixed320-byte
logical reservation for diagnostic state, reported by diagnosticRetainedBytes().
The zero-argument reader always returns320, including after release; wrong arity
returns null and never becomes a policy fault. The reservation is not live usage.
This is retained-state accounting, not measured V8 memory. Future owners must
charge it within their existing32KiB aggregate before dispatch, not raise a cap.

Use a private synchronous site scope around original methods; nested descriptor
helpers do not alter the originating site. Labels are computed only after the
unchanged failing predicate, not by running a second unsafe parse. Diagnostic
projection must never invoke getters, proxies, coercion, promises or caller hooks.
No diagnostics callback or caller assertion supplies evidence.

Latch all original throwing entrypoints, including seal and targetPayload.
Keep original policy behavior after a fault; only witness selection is sticky.
Stored roles determine same-record labels; allowed candidate roles determine
creation checks; worker checks use the intended worker role even on wrong type.
Preserve compound short-circuit order: terminal/type/url/context; UI admission
context/attached/parent/opener/duplicate-role; add duplicate-id/target-capacity;
worker type/worker-present. Diagnostics are best-effort after creating the exact
original StartupFatal; a projection failure cannot replace that error. Reuse
already checked primitives, never reparse raw payloads. The capacity branch is
structurally unreachable through valid public state: one anchor, two UI slots
and one worker give at most four members. Prove that bound without changing it.

## Verification and ownership

Inventory agent owns only the three new pure component files. Root owns this
decision, receipts and later integration/actual gates. Independent Trust reviews
the complete design, implementation and test evidence before acceptance.

Run guarded64MiB tests with invented metadata only. Authenticate the immutable
baseline FILE before a test-only import. Differentially compare all old methods,
error class/code, return values and subsequent state across exact accepted flows,
each identity alternative, malformed descriptor inputs, census disagreement,
closing and release. Include real interleavings of target-created/info-changed
and census around a pending original discovery promise; no native browser runs.

Cover every reachable witness predicate/site/role, first-fault precedence,
multiple failures, fake/proxy errors, no diagnostic-input hooks, clearing on
release, immutable detached DTOs and the fixed logical reservation. If a branch
is structurally unreachable under prior state checks, prove that fact rather
than fabricate private state to claim coverage. Preserve all unknown-target,
worker lifetime, duplicate-slot, attachment, context, parent/opener and terminal
negatives. Full source review and literal secret scan precede a source receipt.

This component alone does not reproduce the actual failure, repair browser
compatibility, measure hierarchical quality, provide a native parent, authorize
public capture or complete canonical/crawler/client/owner-controls integration.

## Completed source checks

Root and independent Trust accept all three files after full policy/test/README
review and normalized comparison with the authenticated immutable baseline.
Guarded64MiB tests pass72/72 with no failures or skips: Root98.1038ms,
independent108.2081ms. Trust separately repeats nonenumerable/null-prototype
differentials and confirms acceptance plus subsequent error/state equivalence.
The literal three-file secret scan finds zero findings and passes six scanner
self-tests. All124 consumedv13 CODE pins remain unchanged.

Exact source pins and review limits are recorded in
apps/local-service/data/infrastructure-identity-witness-adr197-source-review-20261023.json.
These checks establish source consistency, not the actual failed subtype or a
working native diagnostic. Its fresh parent/runner/inventory, normal physical
closure and separate one-attempt authorization remain required next.

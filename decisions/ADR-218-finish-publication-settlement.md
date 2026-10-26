# ADR218 Finish publication settlement and parent failure evidence

Date: 2026-10-24
Status: complete SOURCE design accepted by Root Native Inventory and Trust;
bounded implementation granted only as specified below

Root grants ONLY the exact60 authenticated namespace copies and disjoint Native6,
Inventory15 and Root39 SOURCE slices below, including the initially closed entry.
The independently accepted pre-grant design is23290 bytes, FILE
2fdd7daf1e0e4278f264d37f6815a262a7f0f098a36d7b95119b944806fd5f57.
No reviewed map, actual preparation, browser/model/TEST phase or activation is granted.

## Decision to review

Replace file visibility as the finish-service boundary with an explicitly
acknowledged, privately issued post-publication control exchange. Preserve the
existing filesystem proof protocol and all original deadlines and budgets. Add
bounded parent failure-site evidence before the existing sampler masking, without
changing the exception or cleanup behavior that determines success or failure.

The proposed implementation is a fresh, initially CLOSED v21 source namespace.
No actual preparation, browser/model work, retry, failed-output adoption or live
change follows from design acceptance. All consumed v1..v20 source, maps, package
bytes and output, and all four held ADR217 files, remain unchanged.

## Evidence and scope

ADR216 PREPARE42302 failed before finish ACK/completion. Its exact exception and
cause remain unknown. The failed partial freeze/result are not preparation.

ADR217's source harness is independently accepted. Root authenticated and fully
read the9397-byte independent receipt
`apps/local-service/data/native-finish-publication-adr217-independent-review-20261024.json`,
FILE40a9c9dc8670cdef44d0e4c1d380a43bab651f4368e050d8810805cf1ea23190.
Its9 Node and15 Python tests exercise unchanged actual source with invented
capabilities, not one physical IPC execution. They establish two concrete gaps:
visible final files can precede original publication settlement, and an empty
proof queue can precede a later final-read proof request. The parent can ACK
under its own predicates while the independently tested Node continuation fails
its earlier exchange deadline. These findings justify repairing that ordering;
they do not identify the cause of42302.

This proposal covers only the final finish publication boundary. Startup,
batch-start, stage and drain boundaries are not claimed fixed by analogy.
Their existing behavior and deadlines remain unchanged. Actual semantic quality,
canonical publication/ingestion, owner controls and rendered UI remain open.

### Governing baseline and precedence

The full frozen ADR216 contract is incorporated by this explicit review policy:
`decisions/ADR-216-funded-diagnostic-hierarchical-study.md`,154105 bytes, FILE
`b5f7007f467df228d4f9b1b567a2c92a7da7a80b92e76f4535e05f8b91b2c700`.
Reviewers must authenticate and fully understand that baseline before accepting
this successor. All its unchanged capture, rights/admission, funded diagnostic,
privacy, physical ownership/cleanup, phase/TEST, semantic cohort/gold, numerical,
artifact and resource obligations remain normative. This proposal overrides only
the explicitly described finish/control/failure-observation deltas and mechanical
namespace/decision/inventory substitutions. It does not discard the rest of the
contract merely because the old decision leaves the active CODE catalog.

Historical source grants, readiness literals and actual phase decisions never
transfer. Active implementation targets become v21/ADR218; v20 is the immutable
authenticated seed, not a runnable successor entry. Historical evidence and old
map/output references keep their original identity and cannot be adopted. The
new decision remains the sole active CODE decision; this normative reference is
an explicitly reviewed SOURCE-only edge, not permission for runtime to follow an
unlisted file. Independent review must accept this incorporation policy before
copying; otherwise the complete inherited text must be restated first.

## Private Node publication token

Add `io.publishFinishExclusive({bytes,beforePublish})`, fixed internally to
`finish.request.json`. Ordinary `publishExclusive` retains its existing contract.
The specialized path must await the same original complete publication, including
pending verification, final link, after proof, final read/close and final proof.
Only after the original completes and private IO busy/pending/handle/unsafe/fault
state is healthy may it mint one frozen opaque token. No supplied snapshot or
public `done` boolean can mint or authenticate a token.

A module-private WeakMap associates that token with the actual owner IO object,
its exact configured proof-adapter function identity and the actual published
FILE hash. Retain no request bytes, paths beyond the fixed literal, page data,
vectors or exception references. At most one finish attempt/token is permitted
per IO instance, with no reset or refund. Construct functions first, then assign
the actual frozen API object to its private owner variable before returning it;
no method can run before that identity exists. Validate token/owner/adapter
identity without mutating a foreign owner;
then irreversibly consume/delete a valid owned token BEFORE a private-health
recheck or transport can fail. Forged, cross-instance, cross-wire, pending, failed and replayed tokens
must be refused. A valid consumed token cannot be reused after transport failure.
Failure must poison the consuming wire; a forged foreign token must not mutate
an unrelated IO owner merely because it was supplied as an argument.

`proof.ioProofAdapter` is one stable closure belonging to that actual wire. It
replaces the current driver's six-field-to-four-field projection closure; it
must preserve descriptor/proxy-safe projection and must not use a caller-selected
`this`. Actual driver passes this exact function into IO. The token consumer
receives the expected adapter from the consuming wire's own closure, not from
request JSON. Authentic foreign IO tokens with matching hashes remain invalid.

`proof.finishPublished(io,token,startupBindings)` dynamically resolves only the
fixed local IO token consumer inside the gated finish call. Do not add an IO
static import to the initial builtin-only execute adapter. Default import
inertness, assignment-header ordering, repeated CODE authentication and ledger
gates remain intact. Track the original dynamic import and physical exchanges;
guard before and after their actual continuations. No timing observer may
replace, cancel, refund or claim settlement of those originals.

Reserve the single control attempt, its exclusive wire busy ownership and its
original15-second request epoch BEFORE the dynamic import. Track that original
import and check the same guard/deadline after settlement, before token consume.
The FS-head snapshot requires no preexisting FS exchange/pending/unsafe state;
the control's own busy ownership must not be mistaken for forbidden FS activity.
Read private FS cells rather than calling a public checkpoint method that rejects
this same legitimate control busy state.

## Closed control request and receipt

The single control request has exactly these ordered fields:

```text
schema = native-specificity-finish-publication-request/v1
controlSequence = 1
phase
sourceIdentityHash
sourceMapHash
nodeIdentityHash
readySha256
startupAckSha256
baselineHash
finishRequestSha256
fsProofCheckpoint
```

Bindings are the existing actual phase/source/startup/node identities. The FILE
hash comes only from the consumed private token. The FS checkpoint comes only
from the actual wire's current committed head with no busy/pending/unsafe
obligation; neither is caller-declared completion evidence. Reject replay,
wrong phase/incarnation/session, mismatched fixed request, stale/future head,
unknown fields, proxies/getters, malformed framing and all existing fatal states.

The receipt has exact insertion order: schema, controlSequence, phase,
sourceIdentityHash, sourceMapHash, nodeIdentityHash, readySha256, startupAckSha256,
baselineHash, requestHash, finishRequestSha256, fsProofCheckpoint, receiptHash.
Its schema is `native-specificity-finish-publication-receipt/v1`; controlSequence
is integer1, not Python bool. Both checkpoints have exact order sequence,chainHash.
Hash canonical request bytes without the framing LF. Embedded `receiptHash`
hashes the exact preceding receipt body excluding its own field. Returned
`controlReceiptHash` is a DIFFERENT domain: SHA256 of the entire exact consumed
receipt bytes, including the receiptHash field but excluding framing LF.
The wire accepts only
the actual matching physical receipt and returns bounded metadata containing the
finish FILE hash and control request/receipt hashes. No raw frame is retained.

The returned object has exact keys finishRequestSha256,controlRequestHash,
controlReceiptHash. The control request/receipt hashes here both mean complete
canonical byte hashes excluding LF, never a guessed or reconstructed success.

This is authenticated producer ordering evidence, not a native filesystem proof,
atomic confinement, document freshness or rights authority. The original FS
sequence, chain and64-entry checkpoint history remain FS-only. Control1 has
separate hashes joined to the exact FS head, never a fictitious native proof.

## Parent service ordering and clocks

Keep pumping the original channel until the one valid finish control is
physically receipted. Visibility may latch the original first-visible finish
observation once, but may not stop service or renew that lease. The control is
admissible only in the actual parent-owned finish-wait state after startup;
declaring a phase in JSON cannot authorize it during startup or capture/drain.

One shared private visibility observer is used by the outer wait and control
dispatch. A control dispatched first must check the fixed finish path immediately:
absence refuses control-file; presence latches an unset timestamp before native
read/proof work. An earlier timestamp always wins. JSON cannot set or overwrite
it. End this held finish lease's work scope only after original finish ACK
publication succeeds; do not extend it over later completion/exit work, which
retains its existing frame/phase/guardian clocks.

Before receipt, perform only bounded request/binding/head and fixed finish-file
checks, not the expensive result/freeze/source validation. The marker must join
the actual fixed finish request FILE hash. Constructing a receipt is not commit:
the same original response write and flush must physically settle under the
unchanged tracked writer before distinct control state commits. Pending/rejected
writes, guard failure or uncertain cleanup cannot unlock heavy validation or
expose a committed receipt. Do not infer settlement from an empty queue, absent
current lease, a fixed sequence offset, a caller flag or a pause.

Only after physical receipt commit may the existing result/freeze/source checks
run. All existing validation, checkpoint, guardian, drift, quiescence, normal
exit and cleanup predicates remain mandatory. A late ACK-file read is still a
real FS proof request. The existing post-finish run loop must service those
requests and completion publication before normal exit/empty-Job acceptance.

Parent's original15-second finish lease begins at its first actual visibility
observation and is never restarted by marker arrival or receipt. Every physical
frame/control retains its original15-second exchange lease, and the original
phase/guardian clocks are unchanged. Define first-observation handling even if
a queued marker is first serviced before the outer visibility loop next runs;
no missing observation may silently grant a fresh finish budget. Node begins the
existing ACK-file poll only after its actual control receipt validates. Missing
ACK polling remains the existing wire-free bounded filesystem metadata path;
present ACK reads still use proofs. Long validation can still legitimately fail
an original deadline; this design does not promise timeout immunity.

## Accounting and saved evidence

All request/receipt bytes and transient buffers share the existing16KiB frame,
8-frame/128KiB queue,64MiB combined wire and65536 aggregate-exchange limits.
The single control consumes one of those exchanges, not an extra allowance.
FS sequence plus control count must satisfy the unchanged total limit at every
consumer; later ACK/completion proofs may not bypass it. Prepared receipt state,
pending original writers, token and compact evidence need explicit bounded
accounting. Do not claim a V8 or CPython heap proof from logical byte counts.

Save one compact, distinctly named control record with exact FS-head join and
committed request/receipt hashes in existing supervisor stats. Before physical
commit, no record may claim a committed receipt. Append committed control hashes
to the existing finish ACK; Node compares them with its actual receipt, and
completion's existing finishAckSha256 binds them transitively. No new output file
or caller-selected key is proposed. Saved evidence is a compact source-attested
record, not independent raw-frame replay. Future actual audits must recompute
closed control hashes and joins and check normal completion, not adopt a failed
partial record.

The committed stats field is `finishPublication`, null before physical commit,
otherwise the exact ordered object schema,controlSequence,fsProofCheckpoint,
controlRequestHash,controlReceiptHash. Its schema is
`native-specificity-finish-publication-evidence/v1`; controlReceiptHash is the
COMPLETE receipt FILE hash, explicitly distinct from the embedded body hash.
Append `controlRequestHash` and `controlReceiptHash` to the existing finish ACK's
ordered fields. Metadata-owned test-admission.js and its invented fixtures must
validate this closed stats field, reconstruct both canonical control bodies and
their hash domains from authenticated joins, and enforce FS+control totals.
Its existing success/native/selection/quality gates must not be relaxed. No
committed control may be synthesized to make an old fixture pass admission.

Original Job, CPU, clock, heap, disk/commit floors, workspace8GiB/344064-entry,
evidence and Node32768-byte diagnostic limits are unchanged. The fresh study
would have25 aggregate roots,24 required historical roots and50 root scans per
report_reserve (two complete scans, not all native ancestry operations).
Read-only inventory derives exactly1851 exclusions:21*87 +2*8 +2*4, preserving
the original diagnostic root shapes and historical study indices. These are
template cardinalities; independently verify final literal copies/closure before
readiness. Count every historical owned output, with no cleanup to manufacture room.
No new allowance funds the token, control or parent observer.

## Parent failure site before masking

Use a parent-session-private observer with two bounded scalar cells and static
closed site/predicate tables. Record only the first actual terminal guard/refusal
at its literal site before the existing throw. Instrument the relevant original
phase/frame guards and sampler refusal branches without changing their truth
conditions, ordering, thrown values or reverse retained-handle cleanup.

The two cells are phase and word. Phase0=open-empty,1=open-note,2=selected-null,
3=selected-note. Word=siteIndex*47+predicateIndex,0..845; zero is valid. Note only
changes phase0, select changes0 to2 or1 to3, and selected states never mutate.
The active native sampling step is a stack local, not a retained third cell.
The exact18 site literals are:

```text
phase-guard, frame-guard, enumeration-guard, native-scope, native-path,
native-attributes, native-open, native-info, native-compare, native-close,
finish-wait, finish-control, finish-request, finish-result, finish-recheck,
finish-ack, completion, cleanup
```

The exact47 predicate literals are:

```text
phase-deadline, phase-cpu, job-resource, headroom, disk-capacity,
evidence-capacity, proof-frame-deadline, census-deadline, own-cleanup-deadline,
bootstrap-deadline, capture-deadline, batch-deadline, drain-deadline,
model-deadline, model-stage-deadline, post-complete-clock, proof-audit-phase,
proof-control-phase, proof-workspace, asset-before-drain, proof-path,
proof-depth, proof-reparse, proof-open, proof-identity, proof-drift, proof-close,
node-exited-before-finish, finish-request, finish-bytes, finish-deadline,
finish-pending, finish-ack, proof-checkpoint, prepare-result,
unexpected-selection, selection-phase, selection-bytes, completion,
control-state, control-binding, control-head, control-file, control-replay,
control-frame, capability-failed, validation-failed
```

These tables do not authorize arbitrary pairs: source callsites select literal
site/predicate pairs; unknown failures remain null. A boundary-only parser or
recheck error may use validation-failed, never a guessed inner predicate. An
exhaustive846-pair upper-bound calculation gives109 ASCII serialized bytes for
the exact three-field view; that calculation is not callsite coverage evidence.

For an escaped external native capability error, record only the current literal
sampling step and `capability-failed` if no earlier witness exists, before the
sampler's existing mask. Never inspect or retain exception args, messages, stacks,
types selected by a caller, raw error references, native paths/handles/PIDs or
private content. Do not record expected absence/FileNotFound paths as failures.
Existing outward proof-failed masking and failure_projection remain unchanged;
adding names to that projection is not a substitute for observing before masking.

At run_session's actual first-primary catch, irreversibly select the observer
including null BEFORE cleanup and projection. Otherwise an uninstrumented primary
could borrow a later cleanup witness. If cleanup is genuinely the first failure,
select there. A separate presence/selection state must preserve a valid zero enum
value; truthiness cannot decide whether a witness exists. Later errors/cleanup
cannot replace the selected first site. Unknown sites remain null, not guessed.

The view is a closed metadata object with schema
`native-parent-failure-site/v1`, literal `site` and literal `predicate`, or null.
Prove its maximum serialized size by exhaustive finite-domain construction and
bound retained state within the existing reserved parent evidence capacity.
Formatting/observation failures must not replace the original operational failure.
Constructor failures outside the existing run_session catch remain outside this
reporting guarantee unless separately designed; do not imply complete coverage.

Proposed logical construction accounting reserves512 bytes before work:128
observer control,16 for its two cells,80 for one adopted three-field view and128
for decode/build scratch (352 total, rounded conservatively). Static literal
tables are fixed code constants, not a growing per-failure collection. This is
not a claim about actual Python heap object sizes; source must prove this declared
retention model and unchanged host/resource limits. Build the view once after
selection and insert it directly as `parentFirstFailure` on the failed report's
existing failure object, not inside the separately bounded resourceObservation
union. Include its actual serialized bytes in existing supervisor/evidence
reservation and512KiB checks. No serialization fallback may replace the original
failure, and no per-failure arrays, raw exceptions or cached extra views are kept.

## Source ownership and acceptance gates

Proposed ownership after a separate grant: Root performs the exact mechanical
60-file namespace copy and initially closes the actual entry. Native owns exactly
these six new files: io.mjs,io.test.mjs,execute.mjs,execute.test.mjs,supervise.py,
supervise.test.mjs. Inventory must not edit the execute pair concurrently.

Inventory owns exactly15 new files:

```text
source-paths.js, producer-profile.js, producer-profile.test.mjs,
protocol.json, protocol.test.mjs, manifest.json, manifest.test.mjs,
README-execution.md, source-ledger.js, source-ledger.test.mjs,
README-source-ledger.md, test-admission.js, test-admission.test.mjs,
README-test-admission.md, README-semantic.md
```

Root owns the remaining39 new namespace files:

```text
README-capture.md, README-driver.md, README-guardian.md, README-io.md,
README-pacing.md, README-pipe-channel.md, README-reference-builder.md,
README-reference-codec.md, README-run.md, README-stage.md, article-owner.mjs,
artifact-reuse.js, artifact-reuse.test.mjs, browser-capture.mjs,
capture.test.mjs, cohort.js, cohort.test.mjs, dns-resolver.js,
driver.mjs, driver.test.mjs, guardian.py, guardian.test.mjs, manifest.js,
native-adapter.js, network-policy.js, origin-policy.js, pacing.mjs,
pacing.test.mjs, pipe-channel.mjs, pipe-channel.test.mjs,
reference-builder.js, reference-builder.test.mjs, reference-codec.js,
reference-codec.test.mjs, run.mjs, run.test.mjs, stage.js, stage.test.mjs, worker.js
```

Root also owns this decision, the external reviewed map and readiness gates.
No owner may change unrelated algorithms while implementing these narrow deltas.
The mechanically derived shape remains60 own+68 shared=128 CODE,142 base,
14 nonCODE,115 package=243 complete,29 aliases and25 literal tests, with unchanged
v4 journey and148 inclusive IO/149 refusal boundary. Final byte pins, closed
import edges and exact copied-file inverse remain unverified until implementation
review. Do not edit old paths or held components. These source cardinalities do
not grant an actual phase.

Required causal tests must exercise the actual new IO/wire/parent methods with
invented capabilities, without importing/initializing a native parent. Cover:

- Token forgery, foreign authentic owners/adapters, replay, one-attempt behavior,
  no hooks and every original publication hold/failure edge before token issuance.
- Visible file and late final read after an empty queue; marker cannot be issued
  before actual IO completion, and parent keeps servicing those same originals.
- Receipt construction versus same physical write/flush/commit, rejection,
  nonsettlement, first failure followed by cleanup failure and mandatory cleanup.
- Original Node/parent/phase deadlines before and after settlement, no renewal,
  frame/byte/exchange boundary totals including control and later ACK proofs.
- Fixed request/head/binding drift, missing/duplicate/cross-session control,
  actual parser EOF/extra frames, unexpected exit and no heavy validation before
  receipt commit.
- ACK-present proof traffic, completion and normal exit under the new joins;
  all original admission/rights/capture/guardian predicates stay unchanged.
- First literal guard/refusal before mask, native capability failure, reverse
  close order, selected-null before cleanup, valid enum zero, first cleanup-only
  failure and unchanged exact outward errors/control flow with diagnostics off/on.
- Exact default-path parity and mechanical inverse for unrelated source; complete
  literal test suite, direct AST suites, import/source closure, secret scanner,
  original resource caps and all old consumed end pins.

Independent whole-source review and exact final pins precede any narrow readiness
transition. A separate Root decision and official exact-command approval would
still be required for ONE future metadata preparation. Its saved independent
audit and exact stage recomputation precede any separate TRAIN/CAL decision;
successful actual selection/audit precede a separate held-out TEST decision.
Neither this proposed design nor a source test grants any of those phases.

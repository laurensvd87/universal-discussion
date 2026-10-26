# ADR194 Complete owned enumeration and unchanged pure phase guardian

`guardian.py` imports only Python standard-library pure helpers. It does not read
files, initialize Windows APIs, start a child, create output or run a CLI. Root's
future reviewed supervisor supplies authenticated synchronous capabilities and
actual membership/resource/source/publication evidence; matching hashes do not
authenticate those capabilities.

`PhaseGuardian(config, capabilities)` privately copies fixed phase identities,
24/18 ordered batch IDs and the original Node/optional console identity.
Optional keyword-only `started_at` carries the original parent epoch sampled
before inventory/setup. It must be finite, nonnegative and no later than the
actual initial clock sample. Actual supervision passes it explicitly; omission
is only suitable when construction itself starts the phase. Constructor checks
retain elapsed capture/phase time, never resetting a late-created guardian.
Identity creation FILETIME stays an exact decimal string in1..2^64-1 without leading
zeros. `pathEncoding` preserves the actual old helper's
`win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1`; hashes are never
retagged. The new `pid`/`creationFileTime`/`imagePathHash`/`pathEncoding` field
names map actual helper values without renormalization. Config keys are `phase`,
`freezeHash`, `manifestHash`, `nodeIdentityHash`, `sourceMapHash`, `batchIds`,
`node`, `console`. Node identity hash is SHA256 of the library's canonical JSON.
Canonical requests are UTF8 compact ordered JSON, not JCS or a signature.

Capabilities: `clock` (guardian-local monotonic seconds), `resources` (exact
RESOURCE_KEYS snapshot, CPU includes exited Job children), `members` (fresh
same-Job identity rows), `census` (unchanged <=8 held-handle identity census),
`recheck(bindings)` (exact source/stage verification), and
`publish(kind, canonicalAckBytes, beforePublish)` (exclusive pending/closed/link
publication). `publish` MUST invoke `beforePublish` exactly once immediately
before its exclusive final link, after pending-file IO, then return actual ACK
byte SHA256. The private hook rechecks identities and resources. The owner must
not publish early or manufacture its callback return. All IO is bracketed by
fresh deadline/resource checks. Any async capability return refuses the phase
and remains charged; these interfaces are deliberately synchronous.
Immediately before the exclusive link, pending work must be EXACTLY that
publisher's own tracked ticket after nested census IO settles. Foreign tickets
registered during source/census/pending-write callbacks block the ACK and remain
charged. Final completion likewise requires pending empty AFTER all final IO.

Actual asynchronous operations use `start_operation('native')` tickets followed
by `settle_operation(ticket)` ONLY on original physical settlement. A timeout
does not free a ticket. Settlement after fault removes the physically finished
ticket but preserves/rethrows the first fault. The outer owner still observes
original failures and retains unsafe operations; this library cancels nothing.

Call `begin_batch(batchId)` before DNS/staging/browser setup. On the FIRST actual
complete request-path observation call `observe_request('batch-drain')` BEFORE
bounded request reading, residual polling or other setup IO. Duplicate or
out-of-order observation is fatal and never renews the held15s lease. The outer
native supervisor may poll its known residual same-Job PID subset under that
held lease; no Chrome acceptance or sleeping occurs in this library. Then call
`batch_barrier(exactRequestBytes)` only after four rows and actual browser/
callback/physical closure. Its exact request field order is schema, the four
config hash bindings, phase, batchId, batchIndex, batchCaptureHash,
captureSummaryHash, previousAckHash. Schema is
`native-specificity-batch-drain-request/v1`. First previous ACK is null.
The request binds owner-validated capture metadata, not caller boolean proofs.
Successful ACK permits the trusted driver to call cohort.finishBatch and
releaseCapturedBatch; neither operation is performed by this pure layer.

After all24/18 ACKs, FIRST observe the complete final request path with
`observe_request('cohort-drain')`, before reading/polling. This starts the model
clock including read/residual/ACK wait, without a later reset.
Capture wall/CPU cutoff is checked freshly at first final observation BEFORE
the transition. Afterwards ACK IO is charged to the model/15s/overall phase
leases, not charged again against the expired capture wall ceiling. Clock and
resource callbacks are fenced immediately on return: a callback cannot catch a
latched guardian fault and return a valid-looking snapshot to permit dispatch.
`cohort_barrier(exactRequestBytes)` uses schema
`native-specificity-cohort-drain-request/v1`, the same four bindings, phase,
accounted96/72, captureHash, ordered batchReceiptHashes, previousAckHash. The
first observation starts the model clock including the ACK wait. ACK field order
is schema, four bindings, phase, requestHash, previousAckHash, observedAt.
Schemas are `native-specificity-{batch|cohort}-drain-ack/v1`. No Python-local
timestamp is compared to a Node performance clock. The future Node adapter must
map its own timing conservatively while the guardian enforces authoritative
local deadlines. These DTOs are a new IO adapter contract, not a replacement for
cohort.js's already reviewed in-memory DTOs.

`advance_model` admits encoding→fitting/assessment→checks in order and
holds its entry clock before resource IO so stage ACK wait cannot renew a stage.
Old-stage validity is still checked before transition, and a fresh final check
rejects a new stage already exhausted by resource/setup work. `complete`
performs source/identity checks and returns bounded phase metadata. This is NOT
the later actual Node-exit/empty-Job success proof. The outer supervisor must
require exit0, exact result bytes, normal final empty Job, complete original
physical settlement and final source/assets checks. Emergency termination is
failure, never success. Sticky first fault/terminal state cannot reset.

The <=8 census is used only after membership is exactly original Node and known
optional console. Original identity is never reset; a console that disappeared
cannot reappear. Active Chrome monitoring allows at most128 Job members and
resource bounds, not an assertion that8 covers all Chrome processes. Baseline
identity/census operations must retain transient failures rather than hide them.
Fresh profiles/registries may be released only after actual ACK validation.

Bounds mirror protocol.json: batch360s/60 CPU seconds, drain15s; capture8640/6480s,
phase9420/7005s and1920/1395 CPU seconds; encoding540/405s, fitting180/assessment60,
checks60. Memory1536MiB, free host physical+commit1GiB, C2GiB/D4GiB; batch512MiB/
8192 entries, study8GiB/344064 entries, evidence32MiB/log1MiB/result512KiB. CPU is
finite/nondecreasing cumulative Job user+kernel accounting, never reset per batch.
The actual guardian also owns terminal cleanup60s/wall9480/7065s, heap256MiB,
query/physical callback limits and no-reparse output walking. This library does
not pretend to observe filesystem or instantaneous scheduler limits itself.

Source-only tests:

```
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v12/guardian.test.mjs
```

`PYTHON_AST_TEST` is exported verbatim for independent `python -B -c` execution
when the offline guard intentionally refuses a child. It parses/executes only
this pure source, with invented clock/resources/membership/IO. No native, browser,
network, artifacts, outputs, model assets, source freeze or phase is authorized.

ADR194 supervision sums the fixed v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11 and v12 workspaces under ONE unchanged
8 GiB/344064-entry whole-study ceiling, 32 MiB evidence ceiling and existing
combined log cap. Old retained output is counted, not adopted or deleted.
Both root ancestry and directory types are sampled before and after every walk,
including publication reservation; these checks are not atomic confinement.
Current-batch plus current-temp limits remain unchanged. After full source review,
the v12 readiness marker is adr194-reviewed-execution/v1. It grants no actual
phase authority; independent final pins and a separate Root decision still apply.

The fixed Node Popen uses only DETACHED_PROCESS (0x8), not CREATE_NO_WINDOW,
NEW_CONSOLE or BREAKAWAY. Its original pipes, fixed executable, assignment before
handshake and optional exact console identity policy are unchanged. This does
not identify historical unexpected members or promise a Chrome process count.

`CompleteJobEnumeration` owns class3 calls with the original fixed128 buffer.
Each logical observation allows at most three physical calls, without sleep or
new lease. Only BOOL-success unequal counts BOTH below128 permit another call;
the entire incomplete prefix is discarded without reading any identifier.
API failure, overflow, unequal boundary128, exhaustion or invalid complete
prefix is fatal. Complete prefixes retain bounded unique nonzero identifiers.
The first terminal work refusal remains sticky; an incomplete/failed sample
never proves absence, memory use or empty Job.

Every actual consumer uses the owned adapter: initial memory sampling, fresh
absence resampling, <=8-identity census, residual membership, normal final drain
and emergency cleanup. No old definition-bound default query is invoked.
Non-collecting fences run immediately before/after EACH physical query. They
check the original phase/model/stage/frame/bootstrap/census deadlines as
applicable, and never invoke resource collection recursively. Census/READY/drain
deadlines are held over all physical calls. Cleanup ignores expired work poison
but keeps its original overall/cleanup deadline; unknown membership still
triggers termination of only the already-assigned Job, with bounded physical
settlement and a complete final empty observation. Unverifiable cleanup fails.

Final supervisor stats (AFTER cleanup calls) add exact `jobEnumeration`:
`{schema:'native-specificity-job-enumeration/v1',logicalObservations,physicalQueries,retryQueries,firstMismatch}`.
Counters are safe nonnegative integers, physical is between logical and three
times logical, and retry equals physical minus logical. First mismatch is null
or only `{assigned,listed}` DWORD counts, never identifiers; only the first
BOOL-success unequal pair is kept. Successful reports can contain only a
retryable mismatch with positive retries. No enumeration metadata is authority.

Actual TRAIN/CAL result validation distinguishes the exact semantic union.
No-reference requires96 accounted, zero references/selections, testAllowed false,
null selection hash and absence of BOTH final and pending selection files.
Selected requires1..48 references, one calibration selection and one FILE-pinned
selection whose identity/packet/artifact claims match the semantic result.
Result/finish/completion preserve the same null-or-hash binding; no-reference
never authorizes TEST. Python does not recompute V8 numeric JSON identities.

Only failed supervisor receipts add `failure.resourceObservation`, with exactly
the nullable fields `collectorPrimary`, `collectorCleanup` and `guardian`, together
at most 1024 UTF8 JSON bytes. Successful `failure:null` and success fields do not
change. A collector row is `{stage,scope,operation,family,code}` with closed
literal enums. A guardian row is `{stage,field,family,code}`; stage is collect,
callback-fence, shape, cpu or counter, and only counter has an exact RESOURCE_KEYS
field. It observes the original try/catch locations, adding no clock, resource,
validation or fence calls. Existing refusal codes and primary/cleanup outcomes
remain authoritative; a diagnostic failure cannot replace them.

The actual assembled collector has an explicit injected-capability test seam;
normal calls use the fixed verified WinAPI helper, scoped metadata walker and
fixed drives only. Known exact builtin RuntimeError singleton literal arguments
and exact builtin OSError categories may project. Unknown/subclass/hostile errors
are unclassified without messages, names, stack, arbitrary values or attribute
hooks. No paths, PIDs, profile contents or sampled numeric resource values appear
in this observation. Cleanup starts a separate private observation slot.

`observed_tree_memory` owns a narrow copy of the authenticated helper algorithm.
The preserved memory-access policy uses minimum access mask 0x1000
(PROCESS_QUERY_LIMITED_INFORMATION), sufficient on current Windows for the two
unchanged membership/memory queries. The old 0x1010 helper and frozen studies are
not edited. There is no VM_READ fallback, new process/exit query, privilege,
sandbox/ACL change or loosened memory-success/cap requirement. Only the bounded
complete-list resampling above changes enumeration calls. Open, membership,
memory, fresh SAME-Job absence and close ordering remain unchanged. The helper
CODE is authenticated; its reviewed load_windows uses use_last_error=True, not
an assertion that every OS DLL byte is attested. A failed open/membership API/memory API
captures the cached error immediately, before resampling/close, into a private
candidate. Only 2/3/5/6/32/33/87/299 map to fixed categories; others become other.
Membership API success with belongs=false is semantic, not cached OS error.

A fresh SAME-Job absence is the only tolerated failed-sample case and does not
consume a terminal observation slot. Still-present unverifiable members remain
fatal; resample failure is independently labelled job-members/resample-members
and preserves its original throw. No exit status or Windows race is inferred.
Diagnostic labels are observed source operations, not proof of the historical
v2 cause. Samples and filesystem ancestry checks are not atomic confinement.

Guarded supervisor tests use `supervise.test.mjs`; both test modules export their
identical pure Python AST suites for separate `python -B -c` execution. Tests run
the actual assembled collector against fake WinAPI and metadata capabilities;
they do not initialize Windows DLLs, enumerate real processes, scan workspaces,
read profile/package/model bytes, create output or authorize a study phase.

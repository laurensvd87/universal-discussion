# ADR184 Complete owned Job enumeration for the hierarchy study

Date: 2026-10-23. Status: Root, Trust and Versions accept the source design.
Implementation, complete source review and fixed pins precede any separate
preparation or public study decision. No native attempt is authorized here.

## Preserve complete observations through bounded resampling

ADR181 localized a refusal to `job-pid-capacity`, but did not retain the failed
counts. ADR182 found unknown members after CREATE_NO_WINDOW resumption, not the
capacity refusal. ADR183's detached-only fixed Python schedule completed64
children and1174 queries with strict list checks and normal cleanup. Independent
saved-output audit passed. These observations do not establish the
historical extra members' identity or count-mismatch cause.

Microsoft's list contract distinguishes required and returned identifier counts.
Only a complete valid query can establish membership, process absence, memory
sampling or empty Job. A query can be resampled without using its incomplete
prefix. Keep the fixed128-slot buffer rather than granting a larger process cap.
[List contract](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_process_id_list),
[query contract](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject).

Create a new `native-specificity-study-v4` source namespace from frozen v3.
Preserve all prior source, maps, freezes, failed outputs and profiles at their
original paths. Only the following prospective repairs are included; model,
study inputs, scoring, cuts, annotations and quality gates are unchanged.

Semantic producer parameters remain identical, but truthful new-source recipe,
profile, manifest and root-transfer hashes must be minted for the new namespace.
Do not force frozen v3 source hashes onto changed v4 bytes. This rebinding is not
model training, semantic retuning or a new root model/cut choice.

## Bound every physical process-list query

Implement an owned complete-query adapter in the new supervisor, not a patch to
an old shared helper. Each logical observation permits at most three physical
queries to the same held Job, using the same fixed buffer. Retry only a BOOL
success with both counts strictly below128 and unequal. Discard the entire
incomplete response without following or consuming any prefix identifiers.
Do not sleep, enlarge the buffer, slide a lease or continue beyond three calls.
API failure, oversized counts, an unequal boundary128 count, retry exhaustion,
invalid prefix or expired original deadline is fatal. Retain equality and bounded
unique nonzero identifiers for the accepted observation. An empty accepted list
must be complete too. No incomplete sample establishes absence or memory use.

Use a non-collecting deadline/state fence immediately before and after every
physical call. It checks the existing phase, active/wall, model/frame/census and
cleanup deadlines that apply; it must not call raw_guard or raw_resources and
recursively enumerate. The first terminal refusal remains sticky. Add finite
aggregate logical/physical/retry counters and the first mismatched count pair
only, not PIDs or arbitrary exception values. Charge counters through cleanup;
retain them in the bounded existing supervisor report, without renewing limits.
Only parent-owned monotonic timestamps may enter these fences. Hold each
caller's existing logical census/absence deadline across all three calls rather
than making a new deadline per physical attempt.

Explicitly route every enumeration consumer through this adapter: initial
memory collection, all fresh absence resamples, baseline/census membership,
post-exit observation, normal drain and emergency cleanup. A helper function's
definition-bound default `members=job_members` must not silently retain the old
query. No global enumeration or arbitrary process lookup is added; existing
minimum-right own-Job verification precedes memory/identity access.

A work refusal or unverified cleanup list must not bypass emergency cleanup.
In the cleanup-only lane, an unverifiable list means unknown, never empty:
preserve the primary fault, still attempt termination of only the already-assigned
held Job, and observe bounded physical settlement and complete emptiness. Cleanup
fences use the original cleanup/overall-wall deadline, not an expired work/model/
census lease or permanent work poison. No failed work is readmitted or revived.
If completeness/settlement cannot be proved, cleanup fails honestly.

The supervisor's finite enumeration diagnostics need a closed versioned DTO and
coordinated validation in the new test-admission parser and tests; its old exact
stats contract cannot silently accept or discard new fields. Bound every counter
as a safe integer and retain only the first finite mismatch. Versions owns that
parser extension with Matcher supplying the exact producer DTO before release.

## Detached Node and the valid no-reference outcome

Change only the fixed owned Node Popen flag from CREATE_NO_WINDOW to
DETACHED_PROCESS. Keep shellFalse, fixed executable/arguments, heap256MiB,
filtered environment, original handles/pipes, Job assignment before handshake
and all timeout/cleanup semantics. No breakaway, new console or console allocation.
Keep the optional baseline console policy unchanged: null is valid, and any
observed console must retain its exact original identity without replacement,
late addition or reappearance. No assumptions about browser descendants follow.
[Creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

The driver must distinguish the exact TRAIN/CAL semantic result union before
calling takeSelection. `selected-pending-independent-audit` requires usable
references, exactly one calibration selection and one selection publication.
`no-reference-set` requires96 accounted rows, zero references, zero calibration
selections and testAllowedFalse. It retains the completed metadata result with
selectionSha256Null and no selection file, never calls takeSelection and never
authorizes TEST. Unknown or inconsistent outcomes fail. Validate semantic/null/
file-presence consistency in the actual supervisor before finish acknowledgement;
carry the same selection binding through result, finish and completion.

## Unchanged study and resource contract

Keep the168-case/73-family panel and48 TRAIN/48 CAL/72 TEST split, including both
unverified TEST labels. Reuse the original16-root model, cuts, producer recipe,
body/title weighting, lambda,12-node detail forest and270-cut calibration grid.
Capture every96 TRAIN/CAL input and24 batch/final-drain receipts before paired
sequential local E5 and one fit. TEST requires an independently audited actual
selection and its separate decision; it remains a fixed72-case/18-batch study.
No provider, AI posts, owner profile, canonical data or live matcher activation.

All original budgets remain: batch360active/420wall/60CPU, study9420active/
9480wall/1920CPU, TEST7005/7065/1395, heap256MiB and JobRSS/private1536MiB,
128 processes/4096 callbacks/32 targets/32KiB registry. Preserve all source/
asset/rights/native/pacing/physical-settlement and final-empty checks. Account
all four study workspaces in aggregate under the original8GiB/344064-entry
profile and32MiB evidence/1MiB logs/512KiB results caps; do not reset old use.
C2GiB/D4GiB and host physical/commit1GiB reserves remain mandatory. The running
crawler, API, worker, dashboard, credentials, pairing and existing data stay intact.

Root owns namespace copying, driver/publication repair, this ADR and integration.
Matcher owns new supervisor/tests/guardian README; Versions owns new literal
catalog, protocol, source-ledger inventory, manifest, entrypoint, test-admission
parser and associated tests/docs. Trust independently reviews all consequential
deltas and final source closure. Shared frozen sources are not
edited or whole-worktree activated.

## Required source and actual gates

Pure tests cover incomplete-to-complete/exhaustion/API/cap/deadline branches,
no prefix consumption from incomplete samples, non-recursive fences and every
assembled collector/census/cleanup consumer. Preserve finite first failure and
original cleanup checks. Test exact detached Popen kwargs and unchanged optional
console identity rules. Compose all-TRAIN-unavailable plus CAL-available through
the actual runner, publication branch and supervisor:96 rows/24 receipts, no fit,
null selection/no artifact and denied TEST. Also reject malformed unions,
inconsistent file/null/hash bindings and preserve the selected branch.

Full guarded tests, identical separate Python AST suites, literal source closure,
secret scan, frozen-source comparisons and independent source/pin acceptance
precede a separate Root preparation decision. Audit actual preparation before a
separate TRAIN/CAL decision. Actual selection audit precedes TEST. A passing
semantic-quality result and latency evidence still precede product integration;
no infrastructure-only pass is a topic-quality or hosted-scale claim.

## Source acceptance and preparation gate

Root and independent Trust accept the complete consequential source: bounded
complete-only enumeration and every actual consumer, non-collecting held fences,
unknown-membership cleanup, detached Node, post-cleanup diagnostics and the
no-reference publication/supervisor joins. The final reserved selection paths
use no-follow lexical presence; dangling entries and permission errors cannot
masquerade as absent artifacts. Versions independently accepts the catalog and
closed diagnostic/admission contract. The original numeric runner is unchanged.

The literal-CODE test collection has312 passes, zero failures and two expected
offline subprocess skips; the identical separate Python suites pass71 supervisor
and54 guardian tests. Final readiness-marker tests and exact source/map pins are
still required. All earlier study/probe source stays unchanged. The reviewed
readiness marker is not a phase grant.

After final release/closure/pin review, Root may separately record one metadata
PREPARE attempt in the fresh v4 namespace. It authenticates source/package/assets
and derives the fixed freeze/stage identities, without browser/public collection
or model evaluation. Retain all output on success or refusal without retry or
adoption. Independent actual saved-preparation audit must precede a separate
TRAIN/CAL decision; successful actual selection audit and another decision must
precede TEST. No live activation, provider, canonical or crawler action follows.

# ADR 241: Fund full recovery checkpoints and retain finite failure evidence

Status: source design only; no actual recovery authorized here.

The preceding goal turn made concrete progress: original29-table equality was
actually verified, ADR240 fixes the independently proven historical matcher
refusal and49 source tests pass. Whole-v1 remains a failed immutable attempt;
its parent filesystem-denied site and original child error were not retained.
Three public Windows controls did not reproduce access denial. No retry/ignore
rule or Windows/PostgreSQL cause claim is justified by those controls.

## A second, independently proven fixture defect

All73 checkpoints currently retain both pending and final paths:146 files, even
before the temp directory or proof/output files. The original publisher allows
128 total entries. A public-file experiment with the exact old guard rejects this
with output-count. This did not cause the earlier failure at38 checkpoints; it
would prevent a later complete run. Keep128 entries and512KiB output, not a cap
increase. The phase plan and all SQL/data/browser assertions stay unchanged.

Keep the original13 checkpoints' two-hardlink publication protocol exactly.
The60 added table/sequence/migration checkpoints use a distinct v2 record schema
and a one-final-file protocol. Exclusively create pending, write/fsync/close it,
copy to final with COPYFILE_EXCL, read back/fsync/close the exact copied final,
then unlink only that stage's pending file. Every original operation is awaited.
Never overwrite an existing pending or final. A failed operation retains its
evidence and refuses success; no cleanup retry adopts a partial publication.

The parent waits while an extra stage's pending file exists. It accepts its final
only after pending retirement, regular singlelink/size/identity/hash checks and
the original strict schema/stage/ordinal/clock/canonical-JSON checks. A previously
observed pending file may disappear only when that extra stage's valid final
exists. A late missing-path observation is allowed only for this explicit
pending-retirement transition. Original13 pending/hardlink assertions remain.
Recheck every accepted final's digest at every sample. This is sampled private
filesystem integrity, not a hostile-OS atomic sandbox. At most87 phase-related
files coexist (26 original paths +60 extra finals +1 transient pending), leaving
the original128-entry output budget for the existing proof/publication files.

## Finite diagnostics, no permission waiver

Before child cleanup, publish a bounded owner-failure witness with the last
completed fixed checkpoint ordinal and an allowlisted service/SQL/owner code.
Do not retain messages, stack text, paths, SQL, URLs, identifiers or row content.
Await its original write/fsync/close/exclusive publication. Witness failure must
not replace the original child failure, and is never acceptance authority.

The automatic18 application/browser rehearsal must also forward its first
original failure to that same owner publisher before its own cleanup, rather
than reporting only a generic application failure afterward. Its optional trusted
callback is accepted only as an own enumerable data function in the closed
automatic18 context; legacy17 context remains unchanged. Await publication once,
retain the original failure if witnessing fails, and report a first cleanup
error before subsequent cleanup. A later success-shaped application result
cannot clear the owner's failure latch. Persist only the owner's existing
allowlisted code and checkpoint ordinal, never the raw error. This 7 November
source continuation does not identify the cause of the whole-v1 failure or grant
an actual recovery run. The owner's primary-code projection must use that same
finite allowlist: an arbitrary uppercase error code must become the existing
generic failure rather than being persisted as a private string.

At the parent's first filesystem failure selection, retain the deepest known
trusted Python code-object site, source line and bounded winerror/errno values.
Use exact built-in exception types, fixed site aliases and bounded traceback
walking without stringification or native/filesystem reads. Unknown exceptions
retain existing classification; retain separate first primary/cleanup evidence.
Do not retry, suppress or reinterpret access denial. Existing failure latches,
all physical retirement checks and output bounds remain mandatory.

## New source and execution gates

Only a new whole-owner-recovery-v2 / whole-automatic18-v2 source namespace may be
created. Preserve all36 whole-v1 source files, its catalog and outputs, every
migration and the accepted fingerprint components. Use the current ordinary
ADR240 owner/runtime code and explicitly include the new supported matcher module
and test in the new whole catalog. Account for the three intentionally changed
ordinary implementation files; do not claim all inherited pins remain unchanged.

Keep600 CPU/600 active/620 normal/630 absolute seconds and500-second callback;
Job1GiB,Node64MiB,32 processes,8 clients and every original memory/disk/admission
and allocation bound. No automatic budget increase. Preserve the full fixed
archive, original28 receipt comparisons, all29 original tables/sequences, all28
preserved tables/queue/state/roles/identities,73 stages,18HTTP, actual Chrome and
normal SQL-stop/closed-clients/empty-Job/end-pin requirements. No smaller dataset,
job reset, unsupported model, partial result adoption or live service change.

Source tests must reproduce the old count refusal; execute the real new file
publication and sampler against all73 public control records under the unchanged
publisher; exercise pending writes/copies/sync/close/unlink/failures, checkpoint
tampering and disappearance, and finite diagnostics/privacy/first-failure rules.
After complete source review, catalog, held inputs, fresh admission/live process
identities and port checks, archive exact source and record a separate ONE actual
decision. Source-ready flags and this design do not authorize an actual run.
Full matching/discovery quality and the broader product/live goal remain open.

# ADR 239: Separate the full-data recovery workload from archive authentication

Status: source design; no actual execution authorized by this document.

The fixed schema17 backup is already local. A restored PostgreSQL cluster is a
second copy, not an in-place replacement of the live database. The last stopped
plain-v5 cluster occupied 2700662791 logical bytes. It must not be described as
requiring another download or as evidence that matching itself needs this space.

Plain-v5 consumed its one actual run and remains failed and immutable. It
authenticated and restored the complete archive, then confirmed the first22 of
29 original table fingerprints. The last completed checkpoint was
original-table-semantic_installation-verified at205966ms. The parent observed
300.296875 aggregate Job CPU seconds and stopped its owned processes. There is
no completed semantic_inputs checksum, migration, application, browser or normal
SQL-stop proof. This is evidence about the administrative test workload, not
production matching latency or per-process CPU attribution.

## New purpose

Create only a new whole-owner-recovery-v1 namespace, fixed root
whole-automatic18-v1 and closed whole-automatic18-browser command. Do not rerun,
adopt or change any consumed source, catalog or output. Freeze predecessor and
component pins before copying. A separate source review, complete catalog,
fresh resources/process identities/port absence and ONE actual decision are
required. Source-ready flags are not actual authority.

This purpose explicitly budgets600 aggregate CPU seconds,600 seconds active,
620 normal drain and630 absolute. Its private callback has at most500 seconds,
clamped to retain the original20-second stop and25-second report reserves.
This is a declared new full-data workload budget, not an automatic retry or an
undocumented increase to the consumed300-second purpose. Do not raise it again
on failure. Keep Job1GiB/32 processes, Node64MiB,8 clients, physical/commit1GiB
running floors, C2GiB/D4GiB running floors, original stronger admissions,
cluster allocation4GiB/logical6GiB and noncluster128MiB. No service, HBA, live
schema, crawler, update or pagefile change is part of this purpose.

Archive authentication and physical restore keep the existing backup operator's
own bounds. Its verifyRestored callback checks the authenticated header against
the fixed receipt and joins the same physical client, database OID and exact SQL
server epoch. Return from the archive operator before beginning the exhaustive
schema/fingerprint/migration verifier. Then require a valid restored result and
repeat the physical identity join before running that unchanged verifier.
The archive file remains held and is reauthenticated at final cleanup. An inner
restored result proves archive completion only; it never proves row equality.

Before any application work, still require every original28 receipt comparison,
all29 restored tables, all28 preserved tables, queue pre/post equality without
inventing independent legacy queue coverage, exact columns/owners/OIDs,
sequences/state/CAS, upgradev3/exact fingerprint implementation and all73 awaited
checkpoints. Preserve18HTTP and genuine Chrome checks, both fixture retirements,
normal owned SQL stop, closed clients/pipes/handles, empty Job and final pins.
Do not shrink data, remove assertions, reset jobs or accept a partial result.

Tests must show that invalid/unsettled archive completion cannot reach upgrade,
that the original restore promise retires before upgrade starts, and that
fingerprints/migration finish before application. Test exact new time boundaries,
truthful CPU failure values and all original memory/disk/physical-cleanup guards.
Retain byte/AST inverse evidence for the copied supervisor apart from explicit
time constants and its fixed predecessor inventory anchor.

Full topic discovery, hierarchical assignment quality, canonical identity,
owner controls, user-interface/load tests and complete future backup coverage
remain separate unfinished obligations. This test alone cannot complete the goal.

## Actual evidence and remaining failure

Source36 files and catalog were reviewed by Root only and archived/pushed in
b82d5b7f.112 purpose Node tests,19 unchanged verifier tests and119 Python tests
passed before the separate actual decisionba71bce2...52bc. Catalog420979 bytes,
SHA c692594c8ee79ca4a4912061356956f56cd67d7672116e9b8bda3d1b72ffee3e,
authenticates2722 files/279995135 bytes. All47 purpose/catalog/component Git blobs
match. Three fixed inputs authenticate/close, fresh admissions and original five
live identities/isolated port absence pass before the one actual.

Actual session34029 closed exit1 after38 of73 stages: the complete authenticated
archive restored, all29 original table fingerprints (including the exact local
semantic_inputs implementation) and original sequences verified. Last closed
original-sequences checkpoint244569ms. This is the first complete original-table
comparison for this fixed backup. It does not prove migration or post-comparison.
The parent's primary is filesystem-denied with no retained native code/site.
Aggregate last validated CPU365.640625s was below600. There is no child lifecycle
report, original child failure code, completed migration/HTTP/Chrome or normal
SQL-stop proof. Parent owned-emergency/emptyJob/closed handles/EOF/endpins pass.

Root terminal audit15233 bytes hashes
f8c8b107c3c10db43cb9f671abe72c55979f63b38cd9ada6045f4d6ca974779c,
rechecking all2722 pins before subsequent ordinary-source development. Every
consumed purpose/catalog/output remains immutable. At rest the identical metadata
sampler can read the remaining489MB cluster; two public-file Windows controls do
not reproduce access denial. Neither supplies the earlier error's actual cause.
Do not ignore/retry access errors or infer a Windows/DB/library defect from them.
ADR240 separately identifies a deterministic archived-matcher compatibility
refusal and implements its correction. Further instrumentation must retain a
bounded finite child failure before cleanup and locate filesystem failures;
that is still unfinished, with no further actual grant here.

Only stopped scratch PGDATA489117703 bytes was subsequently removed after20 pure
guards, full read-only1331-entry/1302-file inventory and separate Root decision
fb3ab29e...12e7. Exact paths/ACLs/all hashes and fresh PID/reference/port absence
are rechecked twice; original controls/phases stay outside deleted PGDATA.
Preflightfc5a20bc...64fb/completion1e2e8c14...4dab. Independent post
6e86c6e5a681b153ab8ab06b82bae2fe8552d03521c6438eb54b25b0adf89056
verifies target absence, all8 controls,38 phase pairs and original5 live creation
identities. This is scratch disposition, not normal SQL-stop/recovery acceptance.

During the original crawler plus separate recovery,28 read-only authenticated
HTTP requests all returned200. Twelve exact known-URL selections at concurrency4
had median38.33ms/max229.28ms;12 version reads had median9.08ms/max184.22ms.
Report6e85f8887983ed045beb33cdd2239cd16f3add7324171671263cc2575e66d724.
No tokens, bodies or IDs were retained. These are small schema17 HTTP baseline
samples, not full UI latency, schema18 behavior or a many-user capacity claim.

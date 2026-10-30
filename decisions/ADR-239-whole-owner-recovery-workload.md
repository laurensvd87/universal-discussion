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

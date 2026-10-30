# ADR-234: Restore and preserve the complete schema17 table inventory

Date: 2026-10-30

Status: separate five-file source component Root reviewed; native consumer wiring
and a new whole-source/actual rehearsal are not authorized by this document alone.

The ADR233 complete archive process finishes within the original budgets and the
owned child smart-stops normally, but the first schema table/owner comparison
refuses. The historical restored relation list was not retained, so do not claim
its exact differing values as observed. Independent source census shows migration
DDL through17 creates29 tables, while the old28-entry table/fingerprint list omits
semantic_preparation_requests from migration12. A fixed live17 read-only catalog
query confirms29 relations and all expected owners; the one unexpected identifier
hash matches that known source identifier. This supports a concrete contract fix.

Do not rewrite ownership based on pg_dump's --no-owner flag: the official
[PostgreSQL17 pg_dump documentation](https://www.postgresql.org/docs/17/app-pgdump.html)
states it is ignored for archive output. Keep ownership checks and restore argv.

The new `restored-schema-contract-v1` leaves consumed originals untouched. Its
strict schema inventory contains29 tables before migration and55 after migration18
adds26. Tests independently parse the actual SQL DDL and bootstrap metadata table;
fake relations no longer silently derive the oracle from an incomplete constant.
Keep owner/public-ACL, manifests, state, policy and sequence checks. Missing,
extra or wrongly owned tables still refuse. No queue reset/deletion is allowed.

The fixed old backup legitimately has28 independent receipt row fingerprints.
Retain every one and all27 existing post-migration equality checks. Additionally
fingerprint the restored preparation queue before and after migration. That
proves migration preservation from the restored baseline, without retrospectively
claiming an independent original queue fingerprint in the old receipt. Exact
complete29 future receipts are supported and also verify original queue rows.
The new v2 upgrade proof reports29 restored and28 preserved original tables,
receipt count/profile, queue equality, row/hash and independent receipt coverage.

Root source review of all five files/30520 bytes hashes
`482378dcb6b4e6b64825279b6e0411c7954925d09ae43800237b427dc5d75f10`.
Twelve Node checks pass under64MiB in156.0841ms, including exact old/new receipt
profiles, all original row/role/CAS/sequence/reset cases, queue changes, missing/
extra tables and owners. These are source/fake checks, not actual SQL/migration/
browser acceptance or independent review. Existing live backup creation still
uses its old receipt scope; complete future backup coverage is required before
live cutover. No new proof consumer or service is activated by this component.

## Required next integration

Review a NEW plain-owner-recovery-v3 source purpose copied from immutable v2 with
its new root/catalog/output namespace. Bind the new upgrade module explicitly;
update the owner capability check/projector, parent completion and application
preservation metadata to v2 proof, actual29/28 counts and truthful legacy28 queue
coverage. The fixed legacy backup must require receiptFingerprintTables28,
profilelegacy28, queuePreservedtrue and queueReceiptVerifiedfalse plus bounded
queue row/hash fields. Do not silently claim complete29 receipt coverage or accept
old28-table proof as the new contract. Add mutation tests at both consumers.

Preserve all prior28 independent receipt+27 legacy equality checks, now augmented
by queue preservation, all18 HTTP cases, original real Chrome proof, role/OID/
Source/privacy/normal-retirement constraints and all original budgets. D admission
remains4GiB+128MiB, runtime D4GiB; Job1GiB/32, Node64MiB,8clients,300CPU and original
epochs/storage/memory floors are unchanged. No cap raise or data substitution.
Authenticate new whole-source/runtime closure including this component and its
package-scope absence, exact held inputs, current headroom/port/service identities,
archive source and obtain a separate Root ONE actual decision before execution.

The complete hierarchical matching/discovery, stable identity, indexed retrieval,
owner controls, actual UI/load/privacy and live activation goal stays active.

## New plain-v3 source and readiness

Separate source grant e659026b...2d5ea precedes34 new source copies. Root reviews
the complete normalized differences: only8 files differ beyond namespace;
26 namespace-only copies retain all original assertions and budgets. The native
lifecycle itself is exact after namespace replacement and its temporary closed
source-ready latch. All34 consumed predecessor source pins/catalog and all five
component pins remain unchanged. Only the two source-ready latches change after
tests; they are not actual execution permission.

119 Node tests pass64MiB/479.0368ms and108 Python tests pass4.105s. The initial
sandbox Python invocation fails temporary-directory access; identical tests pass
with workspace filesystem access. Both owner gate/projector and parent reject
oldv1/counts, false complete29 coverage, missing/changed queue flags, unsafe queue
counts and invalid hashes. Original SQL-guard AST,18 HTTP and real Chrome proof
checks remain. Root preparer parses without errors and its native declarations
are unchanged under namespace-only comparison; no setup is executed by parsing.

Root-only source review9637 bytes hashes
`35c44e6448e980ebaba59369000035071b7d3c91cdadb4d9fd4903afc30436a9`.
New catalog419688 bytes hashes
`0041bda98a8ed7a49ca061794e8b3dc67d6658dc9937e08f5f2660396159ab18`,
authenticating2715 files/279895100 bytes including all five component files and
its explicit package-scope absence. All2710 predecessor pins are freshly checked;
whole authentication/end pins and all seven runtime pins pass. Three fixed
backup/receipt/Chrome inputs are held, authenticated and closed. Three fresh
one-second resource samples meet original memory/C and stronger D admission,
minimum D4468826112 bytes. New root is absent. Readiness1430 bytes hashes
`05bdecb6066824062bd1e7195ab548f3c60c540f647689c7948db9157c34d5ef`.
This is source/readiness evidence, not actual restore/migration/browser acceptance.
Archive source, check fresh services/port/resources and record a separate ONE
actual decision before preparing the fixed new root and invoking the driver.

## One actual v3 run and retained failure

Source c72c7a34 is committed/pushed before separate ONE decision69cfd830...61bd1
and new root preparation. Session55439 closes exit1. Full archive authentication
and pg_restore process close reach restore-retired at212434ms. The next closed
upgrade checkpoint is absent. Parent selects resource-limit/jobCpuSeconds300.1875;
last validated user/kernel accounting is271.3125/28.875 seconds, not per-process
or per-phase attribution.192 closed numeric progress records observe COPY and
index work. Sampled allocation peaks2637185024 bytes, logical2637102912. Memory,
disk and time limits are not selected as the primary failure.

Parent owned-emergency retirement verifies empty Job, all handles closed, both
EOFs and all end pins. No child lifecycle report or normal SQL-stop proof exists;
do not infer migration, fingerprint equality, HTTP/browser or recovery success.
Terminal root audit5514 bytes hashes
`d2f08d8cf6f48e5ec63dcfa005f771aa3c5a4b6050ae5a6a8b55bb9df3f78674`.
All2715 source/runtime pins are reauthenticated. Audit source3b37a3 saves its
complete report before a final-print None dereference; separate readonly2b1cd7
authenticates and accurately projects the saved report. No report is rewritten.
All consumed v3 source/catalog/output are immutable, without rerun or adoption.

New fixed-path scratch-disposition source480aa28f...a7e9a passes20 pure refusal
checks and native-declaration compilation, then the real readonly audit verifies
1457 entries/1428 files/2637051827 logical bytes. Exact stale PID37564/start1793373910
is cleanup-domain evidence only; SQL start is not retained. Node16916/PG37564,
nonce references and complete55433 listener are absent. Separate decision
0013654f...08633 precedes one actual retirement2e6ba9. Only exact failed PGDATA is
removed after twice complete inventory/ACL/hash and control/absence checks.
Preflight44c78ede...01e3 and completion3df6ace3...e4c are retained outside the run.
Independent post-read55c1f4 confirms target absent/all8 original controls unchanged;
receiptbcc3f624...7025e. All five original live process creation identities persist;
crawler26784 advances to13750 ingested. No live service or settings change occurs.

Nine bounded live READ ONLY64-row prefix EXPLAIN samples execute/rollback/close
without row-content output. Warm source/embedding/semantic-input samples take
about4.5/15.4/29.9ms per64 rows. These are selected warm-prefix timings, not full
table costs, past phase attribution or production latency. Next investigate a
source-designed fresh-cluster compression change with all original assertions
and limits; do not raise the CPU cap or retry this consumed run automatically.

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

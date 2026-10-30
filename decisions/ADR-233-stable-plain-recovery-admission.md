# ADR-233: Preserve runtime limits with safer D admission and first-site evidence

Date: 2026-10-30

Status: Root source design selected; no successor copies/catalog/actual execution
authorized by this document alone.

The first plain attempt does not reach PGDATA. Its primary storage refusal loses
the failed sample's field/value; a later cleanup separately retains D4292206592.
The measured readiness sample was D4368224256. Do not assume they are the same
sample, infer the missing primary value or claim a PostgreSQL/data failure.
The consumed plain-v1 source, catalog and output remain immutable.

A new `plain-owner-recovery-v2` should preserve the same complete archive,
formatNONE0 beforeinitdb, bulk-WAL/durability readback, exact SQL roles/28 tables/
27 legacy fingerprints/sequences,18 HTTP checks, real Chrome proof and normal
retirement obligations. Keep Job1GiB/32processes,64MiB Node,8 lifetime clients,
300CPU,360/380/390 epochs,6GiB logical/4GiB allocated/128MiB noncluster and C6.125GiB
admission. All original runtime C2/D4/physical1/commit1GiB floors remain unchanged.

Strengthen D **startup admission only** to4GiB+128MiB (4429185024 bytes). This
adds margin beyond the observed start-to-refusal difference without relaxing any
runtime check or guaranteeing host stability. Capture several fresh native
resource samples before a separate actual decision; the actual parent must also
enforce that stronger admission at both original admission sites. Do not bypass
an insufficient sample or count a later free-space recovery as an earlier pass.

Extract the existing resource-policy call into a pure tested adapter. When the
exact trusted StorageRefusal identifies one of four floor failures, retain its
already captured integer snapshot field and value in the original I.Refusal.
Do not query resources again before first-failure selection. Keep unknown shape/
volume errors finite and do not add arbitrary exception text, accessors or raw
filenames. Tests must distinguish the first floor value from a later sample,
preserve unknown refusals, prove original runtime D4GiB still passes, and reject
startup values below the new admission boundary. No raised caps or fake success.

The reversible storage work recovers per-file capacity, but live host free-space
values remain sampled and can vary. Recheck all consumed predecessor pins and
the new complete source/runtime catalog, exact held archive/receipt/Chrome,
resource/port/service identities and raw Git archival. Only then record a separate
Root ONE new actual decision. There is no retry permission for consumed v1 or
automatic subsequent run. Full matching/automatic discovery/canonical/owner/UI/
concurrency/privacy and live activation requirements remain part of the goal.

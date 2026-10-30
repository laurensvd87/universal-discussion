# ADR-238: Integrate the measured semantic-input fingerprint path

Date: 2026-10-30

Status: source design only; no new owner-purpose files/catalog/actual decision yet.

ADR237's local semantic-input row hashing matches original SQL on the bounded
actual sample and approximately halves that warm-prefix query+hash time. Other
tables have insufficient measured advantage and retain their original SQL path.
The new verifier must still prove every original receipt aggregate over the
complete fixed backup; sample equivalence cannot replace that requirement.

Review NEW plain-owner-recovery-v5 copied from immutable v4 with disjoint root/
source/catalog/output. Bind restored-fast-schema-contract-v1/upgrade.js explicitly,
all three verifier and two consumed prototype files in the whole catalog, plus
both package-scope absences. Owner gate/projector and Python completion require
upgradev3 and exact rowFingerprintImplementation=semantic-input-binary64-jsonb/v1
in addition to the existing29/28 counts/legacy28 coverage/queue proofs/flags.
Reject oldv2/missing/wrong implementation rather than accepting ambiguous proof.

Bind the new required onFingerprint callback to the existing bounded phase
writer. Add exactly60 completed original/preserved table/sequence/migration
stages, expanding both owner and parent to73 phases while keeping every original
stage in order. This makes a later stopped run's last completed check visible
without emitting private row content. Await and authenticate original marker
files/hardlinks; parent acceptance requires the whole list. Keep original final
cleanup and physical retirement, not only marker appearance, as requirements.

Keep fresh-only LZ4, complete fixed authenticated archive, exact manifests/
table/column/owner/ACL/OID checks, every original28 receipt+27post comparison
plus queue equality, generated sequences/state/CAS,18HTTP and genuine Chrome.
All original Job1GiB/32/300CPU,Node64MiB,8clients,storage bounds/free floors and
360-380-390 epochs remain. No retry/adoption of consumed v4 or smaller dataset.

Require source tests at each consumer, complete original regression checks,
whole source/runtime catalog/held inputs/headroom, source archival/fresh live/
port checks and separate ONE Root decision before actual. Complete future backup
coverage, semantic quality/discovery, identity/control/UI/load and final live
activation obligations remain open; fixture success alone does not complete them.

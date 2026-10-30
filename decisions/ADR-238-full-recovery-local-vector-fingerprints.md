# ADR-238: Integrate the measured semantic-input fingerprint path

Date: 2026-10-30

Status: new v5 source Root reviewed and readiness passes; no actual decision yet.

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

## Source/readiness evidence

Separate source grant44be4936...3441f precedes34 new files. Only6 differ beyond
namespace: explicit owner verifier/proof/73-stage wiring and tests, Python parent/
tests, README and the temporarily closed native lifecycle latch. The other28
are namespace-only. Native SQL/restore/client/physical-stop lifecycle is exact
relative to v4 after namespace and latch; LZ4 and every original bound remain.
All34 consumed predecessor source pins/catalog and all five new component pins
stay unchanged. Source-ready latches change only after tests/review and do not
authorize an actual run.

130 Node tests pass64MiB/820.202ms and108 Python tests pass4.055s. Wrong/missing
implementation and old proof versions refuse at both consumers. The real inert
JS and Python phase plans are compared directly: exact73, unique, all original13
stages remain in order. Preparer source parses without errors; native body is
namespace-only. No actual SQL/Job/Chrome is executed by source checks.

Root source review9528 bytes hashes
`c1c0079b9c769acf1228efb795b8b5ba2da0805d61a66c84120ac1247a6d6344`.
New catalog420584 bytes hashes
`643732447bb322926adc548027b855be92cae31478663cb64a2a5c86ac7a1859`,
authenticating2720 files/279943803 bytes. Whole authentication/end pins, all seven
runtime pins and all2715 predecessor pins pass. Three fixed backup/receipt/Chrome
inputs are held, authenticated and closed. Three fresh native samples meet all
original admission floors; minimum D4433162240 bytes. New root is absent.
Readiness1430 bytes hashes
`696d78d179d887241c2a6e577af62eac1795078d7e708372415e4661264a7a80`.
Archive exact source, recheck live identities/ports/headroom and record ONE
separate actual decision before setup/invocation.

To retain the original disk admission without deleting data, two exact public
encoder assets and578 Git-tracked old fixture source files receive only lossless
NTFS compression, with original fixed hashes/exclusive singlelink handles and
unchanged creation/write times/ACLs. Reported allocated recovery is27663561 bytes.
Independent post-close8dd986 rechecks every one of580 files/55672009 logical bytes
and all content/time/ACL invariants. No move/deletion, private data, backup, model
weight, live database/service or host setting change. Catalog end pins still pass;
all consumed CODE bytes stay identical. This sampled metadata/storage operation
is not a filesystem reservation or permanent headroom guarantee.

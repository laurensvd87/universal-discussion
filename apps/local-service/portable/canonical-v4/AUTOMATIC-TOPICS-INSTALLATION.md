# Registered automatic topic schema18

`hierarchy18` appends one checked-in migration to the unchanged registered1..17
manifest. Migration018 contains the exact bytes of fourteen reviewed component
SQL files in a fixed dependency order. The build-time helper only returns those
bytes; it never writes or installs them. Ordinary migration manifests read the
checked-in file. After live activation both this migration and its incorporated
source revisions must remain immutable; fixes require a later migration/source
revision rather than silently rewriting a registered checksum.

`upgradeAutomaticTopics` is an explicit trusted owner operation for an existing
installed17 database. It takes the same migration advisory lock first, requires
the writable READ COMMITTED schema owner and no pending/leased ingestion jobs,
then checks expected head/policy revisions and the exact packaged matcher. It
uses one physical transaction for all schema18 DDL and its manifest row. The head,
policy values and canonical records are preserved. Repeating the operation with
the unchanged expected revisions verifies the same manifest without reseeding.
No HTTP or startup path invokes this operation. The runtime operator must first
quiesce writers and obtain the required backups; this helper does not claim to
prove process absence or implement an automatic rollback over later writes.

`installAutomaticTopics` composes the existing owner17 numeric installation and
the upgrade on that same physical transaction for a fresh registered9 database.
Neither operation opens an E5 encoder or starts a worker. Older schema profiles
remain strict: a17 writer cannot silently accept an18 database. App/worker/crawler
repositories can explicitly verify `hierarchy18` using the same manifest reader.

The final joined hierarchy also permits a current confident named leaf to support
its actual parent without rewriting every older Source into a newly formed parent
cohort. The original exact direct-membership path remains valid. Inherited posting
checks the same current Source/material/canonical destination, current head labels
and active lineage; its private finalizer locks that leaf's bounded sorted chain
before publication. A missing/stale/unrelated child cannot authorize another topic.

The native proof adds fresh9->18 migration/install rollback, real17->18 upgrade
with an existing public thread/receipt, idempotence, old-profile/hash refusals,
SQL role checks and normal legacy HTTP reply tests on the original second scratch
database. It then executes all ten combined hierarchy cases with the complete
registered18 bundle present simultaneously, using a genuine numeric test matcher
and restoring the packaged matcher afterwards. App SQL uses SET LOCAL ROLE on the
existing ownerB physical session; workerB remains its existing separate role. No
third scratch database or additional physical connection is introduced.

The original170 reports remain mandatory. These joined tests are invented numeric
fixture evidence, not representative E5 quality, genuine browser/provider, many-user
load or live latency. Native execution is pending. Runtime/worker/dashboard wiring,
final breadcrumbs, protected full-data migration/recovery, real quality/UI/load
and verified live activation are still required.

On 29 October the first owned native invocation passed the fresh migration/install
rollback checks and the existing-thread upgrade, idempotence, strict-profile and
role checks. Its later legacy HTTP case refused the invented fixture token: its
length30 violates the unchanged browser contract minimum32. A paired real-client
test proves rejection before fetch and dispatch with the corrected shared invented
token; the migration and installer bytes did not change. A separately authorized
invocation of that correction stopped at the original D: resource floor, with no
retained child assertion report. Both failed runs remain unadopted and immutable;
all2639 consumed pins and their distinct normal/emergency cleanup were audited.
There is no accepted190-case result yet. Guarded699 Node tests and78 pure controller
tests pass; these do not replace actual SQL completion, storage recovery or the
remaining product integration and quality checks.

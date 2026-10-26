# Native canonical hierarchy and ancestor feeds - unregistered SOURCE only

ADR220 implements a NEW opt-in canonical lane, not migration010 or a live
repository. Existing canonical001-009, scoped-v1,190/196/207/219, consumed studies,
sealed services and crawler remain unchanged. Root's mechanical-copy receipt
authenticates the starting namespace/gate transformation; subsequent changes
need whole Root, Native and independent Trust review.

## Execution state and factory

Pure ingress tests execute with the external-capability guard and a64MiB heap.
Database test SOURCE exists, but NO PGlite/native PostgreSQL/SQL test has run for
this successor. Import starts no database. createInputVersionFixtureDatabase()
accepts NO options or arbitrary DB handle: it creates ONLY fresh memory, seeds
the actual canonical001-009 synthetic fixture and initializes the new SQL.
Fixture-private APIs reject handles not minted by that factory.

test.js skips its database suite by default. The opt-in test switch
MURMINGLE_ADR220_SQL_FIXTURE=root-approved-disposable-only is NOT permission:
execution additionally requires fresh reserves and a separately recorded Root
decision. No original floor, dependency memory default, Windows setting or live
runtime changes to make this pass.

## Actual canonical effects

Queued admission/update writes real Sources, body embeddings, Source-local
Topics/Discussions, canonical operation receipts and contributions, not shadow
mirrors. Immutable paired384-vector inputs retain exact binary64, PostgreSQL
array_send/BE OID701 wires and signed zero. Material versions and fresh native
observation/decision evidence are separate: identical material does not inflate
Source versions. The canonical Source policy remains
source-local-scoped-container/v1; native semantic/publication versions live in
new tables. No persisted-state/export compatibility follows.

Full topology remains144 conservative/143 actual nodes, depth8, injective and
parent-complete. One owner lineage keeps canonical parentage stable across
accepted publications. Root snapshots/ancestor edges bind their original
publication, observation/input/decision and real root/topic/discussion FKs.
Page, owner and publication updates never move posts/replies or reinterpret
posting-time semantics. Publication-ID FAMILY revocation hides semantic edges
from ALL its versions, without deleting underlying discussions. Installing a
newer accepted revision does not hide old roots. Cursor scope combines lineage,
node, visibility epoch and scoped feed version; IDs must be hydrated through
actual canonical visibility/withdrawal/erasure-aware readers.

## Separate publication, native and account authority

REAL accepted-publication/native-attestor registries remain EMPTY. Factory-
private installers fabricate protected records only in disposable tests. No
production issuer/attestor, quality acceptance, session authentication, rights
proof, serving grant, route, worker or registry registration is implemented.
The publication joins actual219 record/head, FILE/bundle hashes, fourteen named
native domains and separately DECLARED five-hash canonical tuple; domain names
cannot be substituted. All207/219 false flags and null registry hash stay intact.

The new native-scoped-ingress-v1 privately creates one actual219 facade, fixed
to one server-composed publication. Ordinary requests are exactly
{publicationId,operationId,observation}; no principal, Source/prior/allocation,
personal depth, proof, accepted flag or external job is admitted. Privileged
composition is exactly {publication,authenticate,lookupOperation,resolveSource,
resolveOwnerPolicy,attest,issue,enqueue}.219 snapshot ports remain synchronous;
ordinary service ports support genuine native Promises and closed ordinary DTOs,
not arbitrary thenable/proxy/getter assimilation.

authenticate must read protected PER-REQUEST server/session/native-proof
context. Never derive principal from untrusted caseId/nonce, use a global mutable
current-user variable across requests, or rebuild the numerical facade per user.
A future adapter may use server-owned async-local context. Sequential actor
switches in invented tests are fixture data, not production authentication.
One configured OWNER-wide policy applies to ALL authors; posting principal is
not the policy owner. Settings require owner CAS and exact publication binding.
Owner default/subtree depth changes display prefixes, not persisted deepest
semantic support or existing edges.

The original-request commitment hashes a domain separator plus NUL and sorted
descriptor-only data, preserving -0 and original observation bits. It excludes
server allocations/time/current owner settings. After authentication, operation
lookup precedes Source/owner resolution, allocation and numerical work. Exact
historical replay returns its original result without fresh authority/rewind.
An uncertain issued-but-not-enqueued command has an internal issued state with
null commandHash. A NEW explicit invocation of the SAME authenticated ordinary
request may continue that handoff: protected lookup supplies its original private
issuedId, and ingress calls enqueue at most ONCE. No allocation, Source/owner
resolution, attestor, numerical work, reissue or deadline extension occurs.
This is not a catch/retry loop. Pending and terminal replay is read-only; lost
postcommit replies reconcile the original stored result. Issued references never
enter ordinary requests or public output. Expiry/revocation/erasure cannot turn
this continuation into fresh authority or reusable attestation.

The earlier boundary is deliberately NOT resumable: if a protected attestation
commits but no issued command commits, there is no issued reference to continue.
A protected lookup finding that attestation checks principal/request identity
then raises P2402 (unfinished issuance requires reconciliation), BEFORE ordinary
absence resolution, Source allocation, owner projection or preparation. It does
not invent a cancelled result or revoke the original in-flight issuance. An
explicit repeated request must not reinstall the attestation, renew its deadline,
reallocate a Source target or silently recompute new authority. Original expiry
or revocation permits bounded cleanup to delete the private attestation and keep
only a minimal retired operation; that operation still cannot restart.
The fixture's separate attestation/issue calls do not implement a production
attestor journal or atomic issuance protocol. That adapter remains a future
gate; the held ingress tests prove no automatic retry, not recovery across this
pre-issuance gap.

Trusted resolvers build207 target metadata and196 owner settings. Real190/196/
207/219 perform same-context and bit joins. currentQueueShapeCompatible stays
false for hierarchical templates; NEW SQL proves its own tree and validates
individual material/prior constraints. A separate protected attestor must bind
the SAME description, principal, actual capture/rights, Source incarnation/prior
or authorized absence, publication/head and original bounded deadline.
Ordinary enqueue takes ONLY a protected issued reference plus bound operation
identity, never caller-selected params/node/proof JSON as authority.

## Bounds, privacy and transaction lifetime

Ingress retains at most32 outstanding calls and releases every private219 job
in finally. Async failure is not a mutation retry or proof of physical rollback;
close prevents future issuance, not undoing a committed SQL effect. Results use
exact bounded canonical receipt fields and exact nested version metadata; no
raw text, URL, vector, witness/token or provider error enters output.

Active issuer payloads share4096 global/32 actor/1024 crawler queue capacity.
A protected attestation is consumed by one operation, not every replay; rollback
restores uncommitted consumption, terminal cancellation cannot recycle it.
Original authority<=30s, lease<=15s,3attempts, terminal scrubbing, minimal retirement
and4096 fixed finalization slots remain. The legacy crawler stays on its lane;
no fabricated native capture or title vector is supplied for crawler-static input.

Lifecycle and the singleton owner-lineage control lock precede domain locks,
including destructive canonical wrappers. Ordinary work holds lineage shared;
rare publication install/revoke holds exclusive control and takes no subsequent
Source/job/root locks. Completion rejoins publication/head, principal, attestation
and Source incarnation/prior, retaining suitable protection through commit.
Preserve Source-before-job cleanup, literal COMMIT/depth1 finalizers, original
deadlines, explicit bounded proof cleanup and PUBLIC/serving-role revocations.

## Pure tests and unfinished gates

Pure ONLY (does not invoke a database factory):

    node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 apps/local-service/src/application/experimental/native-scoped-ingress-v1/ingress.test.js

Database test.js contains actual canonical mutation/read/reply/feed assertions,
not evidence that they have passed. SQL execution remains separately gated.
Native concurrency/roles/implicit transaction compatibility, fresh legacy
adoption preserving IDs/history, genuine quality/publication/native-attestor
issuance, owner/admin/API/UI integration, crawler integration, p95 measurement
and live cutover remain unfinished. New Sources alone do not complete existing-
catalog integration.

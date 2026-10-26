# Native canonical hierarchy and ancestor feeds

Status: PROPOSED SOURCE ONLY. Date: 2026-10-24. Required reviewers: Root,
Platform Inventory, Semantic Native and Trust. A separate recorded Root grant
is required before implementation. No migration, runtime or actual database test
is admitted by this proposal.

## Product result and current gap

Persist the deepest confidently supported semantic topic, preserve the original
destination of every discussion and reply, and discover those discussions from
their semantic ancestors. Owner-wide depth and subtree settings control display
grouping without changing semantic support or rewriting historical posts.

The existing scoped ingestion prototype already writes real canonical Sources,
embeddings, Source-local Topics, Discussions and contributions. Its publication
is a singleton containing five declared hashes and flat node IDs; its feed uses
exact-node equality. It cannot accept a complete hierarchical mapper job by
flattening the tree or truncating its143-node valid maximum to128 nodes.

ADR219 connects actual190 preparation, same-context196 grouping and207 mapping,
but deliberately retains false authority flags. It authenticates an issuance
snapshot, not native capture, rights, principal or current database authority.
Neither a descriptive hash nor an opaque219 job grants canonical admission.

## New source boundary and ownership

Platform Inventory owns only seven new files:

```text
apps/local-service/portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/
  schema.sql
  boundary.sql
  repository.js
  test.js
  README.md
apps/local-service/src/application/experimental/native-scoped-ingress-v1/
  ingress.js
  ingress.test.js
```

Root owns this ADR, integration evidence and front-of-project status. Native
reviews semantic identity, hierarchy and immutable-history behavior. Trust
independently reviews the complete implementation. Existing canonical001–009,
ADR165 scoped-v1, ADR190/196/207/219 and all consumed study sources/maps/outputs
remain unchanged. Copying the held scoped-v1 mechanics into the new namespace
requires a recorded, verified mechanical transformation; never activate dirty
worktree modules or modify the live runtime seal.

The database factory must mint only a fresh in-memory fixture, initializing the
actual canonical001–009 schema explicitly. Reject arbitrary database handles,
data directories, connection strings and pre-existing namespaces. Import starts
no database. Owner inspection/adversarial SQL is available only through that
explicit disposable fixture capability. This is not a serving repository or a
general owner-pool escape.

The default accepted-publication and native-attestor registries are empty. Tests
may install explicitly fabricated issuer records inside the disposable fixture;
those records never become real quality or native-rights evidence. No runtime
registration, crawler migration, historical-data rewrite, native capture/model
run or real PostgreSQL connection is included.

## Protected publication and separate native authority

Store immutable publication records separately from mutable activation and
revocation heads. A record binds its ID, incarnation, publication revision,
record FILE, bundle FILE, independent quality/selection/held-out TEST commitments,
all fourteen named native identity domains from ADR219, and the separately
declared canonical publication tuple. Preserve those distinct hash domains.

Store the complete injective native-to-canonical map, canonical parent IDs,
depths and ancestor closure for each immutable topology revision. Bounds remain
144 conservative nodes, actual143 maximum, depth8 and at most1144 self-inclusive
closure rows per publication. These are per-publication bounds, not a global
taxonomy cap. Publication-head epochs and incarnations cannot be reused across
an A to B to A transition. Ordinary queue callers cannot install, accept, refresh
or revoke publications by supplying booleans or matching hashes.

A separate protected native attestation must bind the SAME observation and exact
field/vector/material commitments to an authenticated principal, actual capture
and native rights, generation, Source incarnation or authorized new-Source
absence, addressed prior triple, publication incarnation/revision/head, and one
original bounded deadline. The current syntactic producerProofHash is insufficient.
An actual production issuer/attestor is not implemented by this SOURCE fixture.

The new queue entry accepts only a protected issued-command reference and its
bound operation identity. Private issuance joins an authentic219 result to a
separately protected native-attestation row and current Source/principal authority;
it does not turn any219 or207 flag true. A caller-supplied job description,
attestation JSON, proof hash, node selection or accepted flag cannot replace those
rows. Raw private attestation tokens, session credentials, full capture witnesses
and provider errors must not enter receipts or progress output.

Issued-command identity must commit publication/head/topology, all native-domain
bindings, authentic semantic decision/witness, exact source material and original
binary64 vector wires, principal, protected attestation, addressed prior and
original request identity. Server allocation IDs/time remain excluded from the
pre-allocation replay key. Existing operation lookup precedes new allocation and
numerical work: an exact replay returns its original receipt without renewing
authority, reclassifying, rewinding the current pointer or recreating erased data.
Changing the incoming observation/principal/publication request under the same
operation ID conflicts; changing a server's current owner setting must not cause
an otherwise exact historical replay to be reinterpreted.

An attestation is consumed by one operation, not by every replay. Rollback must
restore uncommitted consumption; terminal cancellation must not make it reusable
for a distinct operation. Active issued payloads share the existing queue's
4096 global/32 actor/1024 crawler capacity and finite byte budgets—no additional
unbounded pending issuer cache. Keep original authority<=30s, lease<=15s, three
attempt/epoch bounds, exact terminal scrubbing and minimal retirement evidence.
The existing legacy crawler continues its current lane; this native lane must
not fabricate a title vector or native capture for crawler-static input.

## Ingress composition

The new ingress privately constructs/owns its ADR219 facade; it must not accept
external prepared/grouped/mapped/facade jobs as request inputs. Server composition
provides protected principal/native-attestor, publication, Source and owner-policy
resolvers plus issuer/queue ports. Default composition refuses before IO. These
trusted provider ports are ordinary service boundaries, not an async sandbox or
a substitute for the final database transaction.

An ordinary request names a publication ID, operation ID and native observation.
It cannot choose a trust anchor, record path, queue principal, producer proof,
canonical allocation, target Source incarnation/prior or personal grouping depth.
Build ADR207's declared target DTO from the authoritative Source resolver and
build ADR196 settings from the authenticated owner-wide policy. Validate each
ordinary input descriptor without coercion/hooks before forwarding it to trusted
ports; use the actual190/196/207/219 owners for numerical and bit-level joins.

For a new operation, authenticate capture/principal, resolve current protected
publication and Source context and owner settings, invoke the actual219 chain,
and issue/enqueue the bound command. Recheck every authoritative row at enqueue
and completion. A changed publication, Source incarnation/prior, authority or
principal fails closed without automatic rebase, regenerated IDs or mutation
retry. Existing exact replay is reconciled independently of fresh numerical work
and must never confer current posting or capture authority.

The old207 `currentQueueShapeCompatible` remains false for hierarchical templates.
The successor validates its OWN complete hierarchical shape and individual
material/prior compatibility. It may not flip, rename or ignore the old flag as
though it certified new-schema eligibility. Fresh native observation nonces and
unchanged canonical material are distinct identities: append real observation
evidence without falsely incrementing a material version or inventing history.

## Canonical persistence and stable discussion destinations

Reuse the scoped-v1 queued admission/update implementation, leases, exact wires,
addressed prior, operation receipts, replay allocation, retirement and literal
COMMIT finalizers in the new namespace. Actually write canonical Sources,
embeddings, Source-local Topic/Discussion containers and canonical contributions;
do not replace these effects with shadow register/commit mirrors.

An immutable semantic decision binds generation, Source incarnation, immutable
input/material version, observation identity, accepted publication and topology,
actual semantic witness/status/reason, complete supported canonical path and
deepest supported canonical node or null. Root-only STOP is valid ancestor
support. Local-detail conflict preserves its actual supported ancestor/reason.
Unresolved means an empty path/null node, not a forced nearest topic.

Owner-selected display prefix is separately versioned and never substitutes for
deepest support. A posting snapshot may additionally record the applicable owner
policy revision/prefix, but feed membership derives from semantic support. Owner
changes do not require encoding/classification or rewriting existing decisions.

Creating a root must atomically join the exact current Source input/decision and
its publication/topology, then create the real canonical root and immutable
semantic root snapshot in the SAME transaction. Preserve original Topic,
Discussion, root and reply IDs and existing canonical reply routes. Subsequent
page updates, reclassification, publication changes and owner settings never
move existing roots/replies or reinterpret their posting-time semantics. A later
root on the same Source may bind a different current semantic decision.

Legacy Sources/roots remain intact and explicitly unbound where genuine paired
native history is absent. A separately reviewed fresh-observation adoption command
must later preserve their IDs while appending first genuine paired evidence; it
cannot delete/re-admit old URLs, duplicate body vectors into title vectors or
claim a current projection was the historical posting-time decision. A new-Sources-
only fixture is not completion of the existing-catalog integration requirement.

## Historical topology and ancestor feeds

Use a protected taxonomy lineage with stable canonical node IDs. Initially require
immutable canonical parentage within that lineage across accepted publications;
new nodes may be appended, but reparenting or changing a node's meaning requires
a separately reviewed transition/new semantic ID. Native ID strings do not become
global canonical IDs by naming coincidence. Every installed publication must
contain the complete relevant mapped ancestry, never just the owner-cut prefix.

Each immutable root snapshot binds its original publication/topology. Materialize
its self-and-ancestor feed edges with actual canonical root/topic/discussion FKs.
A shared canonical ancestor can discover roots from multiple accepted historical
publications in the SAME lineage, using their immutable bound ancestry. New
publication installation does not silently remove old roots or reinterpret them
through a new current page decision. Revoking a publication hides its semantic
feed edges without deleting or moving the underlying canonical discussions;
original discussion access still uses existing visibility/erasure rules.

Feed reads return bounded deduplicated `{rootId,topicId,discussionId}` with keyset
pagination, self inclusion and descendant inclusion, but no sibling pollution.
An ancestor-supported root is not a member of every descendant. Unresolved roots
have no semantic edges. Hydrate returned IDs through actual canonical visibility,
withdrawal and erasure-aware reads; a feed is not posting or assignment authority.

Cursor scope binds lineage, canonical node, lineage publication/visibility epoch,
node feed version and the last root ID. Limit1..100, one-row lookahead, binary/C
ordering; stale scope/version returns a finite stale-feed response, not mixed
pages. Insert, withdraw, delete and erasure dirty every affected ancestor once
per transaction. Duplicate paths/publications cannot duplicate a root. Lock
affected feed rows in deterministic sorted order at commit. An owner display
depth change cannot add/remove semantic edges.

## Transaction and revocation ordering

Preserve the existing lifecycle barrier first, then actor and operation/Source/job/
current-input/domain ordering, independent authority revocation and original
deadline checks. Do not reintroduce growth locks, global idle checks or early
runtime SHARE into new-policy completion. Legacy lane behavior remains unchanged.

A separate lineage control row is shared for ordinary hierarchy commands and
feed reads, before domain locks. Publication installation/revocation takes it
exclusively first, without a shared-to-exclusive upgrade; these rare control
operations do not acquire Source/job/root domain locks afterwards. This prevents
publication-control/feed-epoch deadlocks while allowing concurrent ordinary
writers. The control epoch changes for publication/visibility transitions, not
for every root insert.

Completion rejoins the protected publication/head and native attestation after
domain locks and holds suitable shared publication protection through final
commit checks; revocation cannot slip between validation and commit. The actual
SQL lock modes must block status/revision updates, not merely key changes.
Owner-setting CAS updates use a separate authenticated versioned policy, not a
caller revision or a reinterpretation of Ridge specificity percentages.

Keep exact deferred finalizer context/depth and literal-COMMIT requirements,
source-before-job cleanup, one-use proof bounds, authority expiry after mutation,
rollback and minimal erasure tombstones. Revocation must have a documented
serialization point: a completed receipt is not undone by later revocation.
Revoke/withdraw/erase must not revive retired operations or restore scrubbed raw
material. SQL PUBLIC and serving-role access to all new private issuers/tables/
functions is revoked; old explicitly granted canonical wrappers retain their
reviewed behavior. Separate non-owner native-login tests remain mandatory before
any production grants.

## Executable acceptance and resource gates

First implement SOURCE and guarded pure ingress/codec/identity tests with a64MiB
heap, fabricated trusted ports and newly authored invented geometry through real
190/196/207/219. These tests must exercise opaque/private issuance rejection,
server-resolved target/owner policy, exact replay-before-allocation, same pair and
material/identity joins, async failures/rollback without mutation retry, false
flags and no raw private output. They are not database execution or native proof.

After fresh adequate headroom and a separate recorded Root execution decision,
run the actual in-memory canonical fixture sequentially with the external-
capability guard. Do not change existing fixtures, dependency defaults, pagefile,
Windows services or original study floors to make it pass. A64MiB pure-test grant
does not authorize a larger database process or a connection to the live database.

Database evidence must prove actual canonical mutation/read/reply and feed
hydration, not only metadata or source-string assertions:

- Full143 topology/all15 outside-detail roots/depth8; reject missing parents,
  cycles, duplicate/injective-map errors and depth9 without a different cap failing.
- Swapped/unpublished/revoked publication and false issuer/proof/job refusals;
  final transaction head/Source/principal/attestation joins and one-use behavior.
- Exact original signed-zero wires, material/observation version separation,
  operation replay without allocation/rewind and Source delete/recreate refusal.
- Root under A, page/decision update to B, second root under B; original root,
  replies, Topic and Discussion unchanged and still readable.
- Owner default/subtree depth changes without rescoring, semantic movement or
  edge changes; inherited policy distinguished from explicit overrides.
- Ancestor/self inclusion, sibling exclusion, deduplication, bounded pagination,
  stale visibility/publication/feed cursors and historical publication coexistence.
- Withdrawal, erasure/account/Topic/clear, immutable snapshots, terminal scrubbing,
  minimal retirement, rollback and authority expiry after domain mutation.

SOURCE acceptance requires Root, Native and independent Trust review of current
files and executable pure results. Database integration acceptance additionally
requires actual SQL fixture evidence; native concurrency/roles/legacy implicit-
transaction compatibility, fresh legacy adoption, real quality/publication/native
attestor issuance, owner/admin/API/UI registration, end-to-end p95 measurements
and live cutover remain explicit unfinished gates of the original goal.

# ADR165 Scoped versioned ingestion and lifecycle boundary

Date: 2026-10-20. Status: accepted for isolated source-only implementation after
independent Trust review of the complete revised design below. No native
test or owner runtime change follows from source acceptance.

## Required outcome

New-policy page admission and addressed updates must commit while an unrelated
legacy crawler transaction owns its ingestion lane. Preserve exact versioned
inputs, historical discussion bindings, canonical replies and erasure retirement.
Neither a leased-job refusal nor replacing actual legacy apply with a fabricated
leased row proves that outcome. Existing legacy matching remains unchanged.

ADR163 proves isolated version mechanics but holds growth across an idle-lane
check and therefore cannot provide this behavior. Its early root witness also
locks Source before command receipt, opposite to Topic deletion. The old queue
holds growth through completion and would invert job/Source locks during erasure.
Do not remove the idle check in place or reuse those internal lock orders.

## Source implementation boundary

After design acceptance, Platform owns five new files under
`apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-ingestion-v1/`:
`schema.sql`, `boundary.sql`, `repository.js`, `test.js`, `README.md`.
Root owns this ADR and later native/activation decisions. Imports are inert;
initialization accepts only a factory-minted fresh in-memory canonical001-009
fixture. No native connection or dataDir. Do not install the old admission,
queue or versioned-input prototypes in that engine or edit their held files.

Explicitly adapt ADR163's reviewed material/version/binding/retirement mechanics
into an independent namespace and distinct source-policy/receipt contract. Keep
both384-dimensional binary64 histories, signed zero and exact canonical mirrors;
no Ridge transform, scan or fixed reference for new-policy Sources. No legacy
Source adoption, invented paired history or topic/post movement. Retain the22
corrected predecessor behaviors, including actual canonical read/reply after
update, with the explicit successor external-command replay difference below.

This source slice includes real queued canonical mutations, not only a state
machine. It is not an applied migration or authenticated producer/account proof.
Native multi-connection proof and real serving-role validation remain activation
requirements, not reasons to preserve global serialization in the implementation.

## Lifecycle barrier and serving boundary

Reserve the collision-checked transaction advisory namespace `(914092165,1)`.
Ordinary mutation acquires shared mode FIRST; Topic deletion and clear acquire
exclusive mode FIRST. Never upgrade shared to exclusive or acquire this gate in
a late row trigger. Reject destructive entry if the current transaction already
holds shared mode without an already-granted exclusive gate, including across
separate calls in one BEGIN/COMMIT. Inspect actual granted lock state, never a
caller-settable GUC. Mixed-entry tests must prove rejection before an attempted
upgrade. An explicit exclusive entry before any mutation may support maintenance.
Read canonical generation after the gate without early
runtime_state row locking; retain a conditional generation check at final revision
publication. Shared writers overlap; only intentional destructive operations
drain them. The gate drains transactions, not persisted leased jobs.

The boundary must cover all15 currently source-granted mutation entrypoints:
runtime_append_command, runtime_lifecycle_command,
runtime_withdraw_account_contributions, ingest_enqueue_interactive,
ingest_enqueue_crawler, ingest_renew_authority, ingest_revoke_authority,
ingest_claim, ingest_renew_lease, ingest_apply, ingest_fail_claim,
ingest_correct_source, ingest_forget_source, ingest_delete_learned_topic,
ingest_clear_learned_data. Validate exact signatures against001-009, not names
alone. Private prepare/complete must remain one gated transaction; no independent
serving execute grant. Existing readers need no mutation barrier.

In the fresh fixture, install explicit reviewed wrappers around the unchanged
legacy bodies, with original implementations kept private and old direct grants
revoked. Preserve old semantic/authority checks. New-policy forget dispatches to
its scoped path; legacy forget/correction retain old lane semantics. Clear may
retain its existing leased-job refusal rather than silently cancelling work.
No PostgreSQL reset route currently exists; do not invent one. Future generation
replacement/restore/wipe requires exclusive maintenance and pool draining.

Production activation additionally requires non-owner serving logins with no owner
membership or RESET ROLE escape, schema/table/column/sequence/inherited privilege
audit and startup rejection of owner/superuser composition. Include database
CREATE/TEMP privileges (including PUBLIC and inherited grants), schema creation,
owned functions/tables/triggers and accessible commit-time callbacks. Serving
roles must have none of these creation/ownership escape capabilities or a
replication-role escape. An owner pool with
SET ROLE is insufficient. Owner-only fixture checks cannot establish that policy.
Applied001-009 files and the active runtime remain unchanged in this phase.

## Scoped queue and lock order

Enqueue holds shared lifecycle then growth only for short reservation/admission
work. Lock/revalidate retirement and operation/live-URL conflicts across BOTH
policy queues in that SAME short growth critical section, including absent rows.
Receipt/Source witness locks taken under growth use NOWAIT, with no hidden wait
before missing-row reservation checks. Check retirement,
generation, exact artifact and prior Source/input/decision identity. Addressed
Source contention under growth must fail fast, never wait on the legacy lane.
Commit reservation before worker mutation; growth is not held through completion.

Completion uses lifecycle shared, originating actor fence where applicable,
canonical operation receipt, Source, addressed job, current pointer and companion
rows, Discussions, Topics, Contributions, final authority record, then runtime
watermark. Sort multirow sets in canonical order. Read the immutable job address
without locks first, then revalidate identity after Source and job locks. Do not
obtain legacy lane/job or growth. Legacy policy guards reject new-policy Sources.
Never retain runtime_state SHARE while waiting on domain locks or upgrade it.

Queue records bind origin kind, exact trusted actor or crawler principal, operation
and whole-command hash, allocated/addressed Source, prior input/decision, paired
producer proof and artifact identities. A crawler is not an invented human actor.
The external command hash includes original generation/revision, actor/origin,
paired material/wires/stamp, selected semantic decision, producer proof and prior
identity. It excludes only first server allocation Source/Topic/discussion IDs
and creation time. Exact replay looks up the existing command before invoking
allocation/time callbacks and returns its original allocation. Changed node,
proof, actor or material conflicts under this distinct successor policy; the
private mutator's old proposed-allocation replay behavior is retained. Do not
hash freshly regenerated server IDs/time into an otherwise identical retry.
Completion revalidates generation and addressed prior state, not that the global
revision has remained unchanged since enqueue.
The real API must supply authenticated account/producer authority later; arbitrary
owner SQL arguments are only fixtures. Bound row material and vector dimensions,
job count, active attempts, claims and retries explicitly. Fix initial bounds:
4096 pending/leased jobs globally,32 per public actor,1024 for the fixed crawler
principal;32KiB UTF-8 material per job plus exactly two384-dimensional vectors;
one job per claim, at most3 lease epochs/attempts, lease at most15s and always
capped by the original at-most30s authority deadline. Reclaim only after expiry,
within the same original authority deadline, without automatic retry/rebase.
Bound listing to100 rows; completed/failed/cancelled rows do not consume active
capacity, and retain no unneeded queued material after their terminal transition.

Keep ONE original authority deadline. Replay, heartbeat and reclaim cannot extend
it. Claim/heartbeat may lock only the job, but must never subsequently acquire a
Source in that transaction. Completion checks lease identity/epoch, cancellation
and clock_timestamp after waits and after canonical mutation/final publication;
expiry rolls back all canonical/version/binding/receipt changes atomically. A
protected constraint finalizer must reject a transaction deliberately held past
the deadline after the mutation function returns. Deferral alone does not prove
this: [SET CONSTRAINTS](https://www.postgresql.org/docs/17/sql-set-constraints.html)
can force constraint triggers early. The private finalizer must require
`pg_catalog.current_query() IN ('COMMIT','COMMIT;')` and
`pg_catalog.pg_trigger_depth() = 1`, rejecting every other context. Repository
SQL must use an explicitly null-safe rejection predicate, for example the whole
conjunction `IS DISTINCT FROM true`; `IF NOT nullable_predicate` is insufficient.
The actual fresh-memory extended-query probe observes NULL current_query with
depth1 on implicit finalization, which must reject atomically.
Repository
transactions send an explicit literal COMMIT as a separate protocol message.
Lowercase, END/WORK/CHAIN, comments, multiple statements, implicit commit,
PREPARE TRANSACTION and early SET CONSTRAINTS are intentionally unsupported.
The [current query function](https://www.postgresql.org/docs/17/functions-info.html)
returns the whole client query, not nested SPI SQL, so the intrinsic depth check
also blocks a deferred user trigger flushing the finalizer inside outer COMMIT.
New externally callable scoped mutation entries reject nonzero trigger depth
before touching canonical state. Finalizer intent/deadline comes only from the
protected server job/authority record; no serving EXECUTE or table DML grant.
Fully qualify builtins and fix search_path to pg_catalog/private schema.
The clock check establishes commit-phase authorization, not the physical
WAL-commit instant or the absence of later unrelated deferred-trigger delay.

If nested constraint flushing re-fires an already queued finalizer, protected
same-transaction idempotence is permitted. Every invocation must FIRST validate
the exact query, intrinsic depth and immutable protected intent/current txid.
First success checks generation/operation/epoch/original deadline and lease
snapshot, final authority and exact published receipt before setting a server
authorization timestamp. A duplicate must match that same transaction, identity,
timely timestamp and successful receipt/finalization association. It cannot
authorize another job, epoch, command or current-root proof, overwrite the time
or extend a deadline. Savepoint rollback restores the first success and timestamp.
Later duplicate callbacks rely only on that first commit-phase authorization.

Retained finalization metadata is private, minimal and explicitly bounded with a
cleanup and erasure path: txid/generation/operation/epoch/time and only necessary
server-derived token digests/expiry. No raw lease/authority bearer archive or
URL/body/actor/vector linkage. Deferred triggers are precommit, not a postcommit
cleanup hook; do not claim automatic postcommit deletion. Tests reject changed
txid/generation/operation/epoch/receipt and require query/depth checks even when
the protected timestamp is already set.

Cancellation's revocation-only function is committed by its repository/API in a
separate external transaction, without Source/job locks. It cannot commit inside
an ordinary SQL function or acknowledge success before that commit. Cleanup is a
later idempotent transaction. Completion locks/checks the independent authority
record at finalization AFTER domain locks, checks time again after the watermark
and holds the authority lock through commit.
Subsequent cleanup follows Source then job. The final authority lock decides the
winner: cancellation cannot claim to undo an accepted commit. Bounded reclaim
changes lease epoch, never deadline or prior proof. Stale prior input terminalizes
and scrubs through a committed no-canonical-write outcome, not a RAISE that rolls
back terminalization; never rebase. Uncertain revoke/complete outcomes reconcile
the exact authority/receipt without replaying a mutation. A/B/C
replay cannot rewind current inputs or confer current-root authority.

## Roots and erasure

Root wrapper takes lifecycle/actor, then canonical command receipt before Source.
Its protected intent must not acquire an early Source FK lock: defer that FK or
reserve the canonical command first. Keep canonical prepare/complete and perform
authoritative current input/decision validation in the insertion hook under the
held Source lock. Root/binding/receipt rollback remains atomic. Direct old human
or generated root insertion stays blocked for new-policy containers; generated
sharing still needs its reviewed wrapper, not a GUC bypass.

Forget locks receipt, Source, its jobs, then destinations/roots; completion uses
the same Source-before-job order. Retire pending/leased/completed admission,
update and renewal operation IDs before scrubbing/cascades. Tombstones retain
only stored generation/operation/finite kind, without Source FK, URL, digest or
input. Pending admission without a Source has no Source DELETE trigger: Topic
deletion, clear and actor withdrawal explicitly enumerate relevant jobs and mint
minimal retirements BEFORE scrubbing. Preserve post IDs, authors, bodies and destinations under canonical
lifecycle. Account withdrawal keeps the existing actor fence and revokes/scrubs
that actor's queued authority atomically, without authority-before-Source lock
inversion. Topic deletion/clear cannot leave queued proofs
able to revive erased pages. Feed invalidation must also respect stable multirow
ordering; no row-by-row opposite node-lock order between concurrent withdrawals.

## Required verification

Root and independent Trust must inspect complete source and execute isolated
tests for all22 predecessor behaviors, the15-wrapper privilege surface, exact
operation reservations, leases/epochs/deadlines, cancellation winner outcomes,
post-mutation rollback, historical replay, all retirement kinds, erasure and
account/source/topic/clear cleanup. Assert no idle-lane/growth/early-runtime-SHARE
dependency in new-policy mutation. Preserve seeded legacy tuples exactly.

Include exact COMMIT and COMMIT; successes; SET CONSTRAINTS before, during and
after completion; an early flush caught inside a savepoint followed by late
commit; unsupported query forms; and the nested deferred-trigger counterexample.
The latter must first demonstrate that the literal-query guard alone accepts a
nested early flush, then prove the intrinsic-depth guard rejects it atomically.
An owner-created adversarial test table is a fixture, not a serving capability.
Root's separate twelve-case fresh-memory protocol probe passes, but does not
establish scoped canonical mutation, native protocol or production role behavior.

Before activation, a separately reviewed fresh native scratch fixture must use
actual001-009 legacy enqueue/claim/apply and multiple connections. Hold actual
ingest_apply before its final watermark using fixture-only instrumentation and
prove its lane lock separately. New-policy update and unrelated canonical reply
must commit before that barrier releases. Also prove growth remains available
during new completion; measure final watermark contention separately.

Exercise both schedules of update/root/reply, root replay/Topic deletion,
completion/forget/account revocation and clear/enqueue/post/update. Test deadline
and lease expiry after mutation, stale workers after reclaim, uncertain responses
and retirement replay. Record server wait graphs, receipts, exact final tuples,
wire bytes, bounded timings and cleanup. Sequential PGlite is not that evidence.
Exercise the protected commit boundary through actual simple and extended native
protocols and audit real serving roles before activation.

Real hierarchy quality, additive migration/recovery, worker/API/crawler contracts,
owner-wide/per-topic specificity, policy-aware catalog/reply/Insight/generated
sharing, parent feeds, actual UI and end-to-end latency remain in the original
goal. No deployment or model permission follows from this source architecture.

## Source review checkpoint

Root and independent Trust accept the isolated READ COMMITTED source prototype.
Both executed all41 guarded fresh-memory tests with zero failures or skips
(root6225.1795ms). The final review additionally corrected direct-SQL and JS
parameter bounds, withdrawal validation before its new actor fence, and a
post-selection slot-occupancy race. Slot candidates are now rechecked in a
separate statement, never revisited and bounded by4096 and the original lease.
The tests assert actual three-distinct-candidate exhaustion and restore the
disposable pool to4096. Both lifecycle lock predicates bind the current database.

Accepted file SHA256 values, in the five-file directory above:

- schema.sql: a61a461de983da40a317a4217c6c7fe543c28fc1f70261083ca35b8c2e02bc61
- boundary.sql: 17bcc8ec649264d9b1090f34d400e50e9a1643e96d31c04ccdd1ad75af9aa5e7
- repository.js: 3d0b3bb8b8b293b567ae79f16a2b82ac3d378678578f92d5f8c2ab87458593cf
- test.js: 7ef4bac0be29b0ed16f8f4eace17aaaea5b37be3637f6d114834cc21b750bf46
- README.md: 7cedf358a23044608fc32022465c93f2e4a7c0283a1901f98abdec859693391f

Fresh-statement snapshot behavior requires READ COMMITTED; other isolation levels
are not accepted by this claim. Existing lifecycle consumers that affect scoped
bindings must also use the reviewed explicit literal-COMMIT envelope. The fixture
tests do not establish that their previous implicit query envelope works.
Native concurrency, actual login privileges and protocols remain unproved.

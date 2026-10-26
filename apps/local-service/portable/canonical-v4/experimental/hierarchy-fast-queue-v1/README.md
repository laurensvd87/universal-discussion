# Experimental prepared-evidence fast queue v1

Code-only, owner-only, isolated PGlite prototype. This is not migration010,
service/worker/router dispatch, an authorization implementation or activation.
No applied SQL, old prototype, runtime or frozen collector sources are changed.
Never install this SQL in the native owner database.

## Concrete contract

Initialize canonical fixture migrations001–009, the unchanged sibling
`hierarchy-fast-admission-v1` prototype and its root-only artifact, then explicitly
initialize this queue. Initialization rejects non-PGlite adapters. There are no
application/worker grants or direct table-DML grants. New trigger functions are
SECURITY DEFINER with fixed `search_path=pg_catalog`, qualified relations and
PUBLIC revocations. Repository operations run as the disposable database owner;
they are NOT reviewed execute-only SQL functions for untrusted app roles.

`prepareFastQueueCommand` accepts exactly:

    {schema:'source-local-fast-queue-command/v1',
     policyVersion:'source-local-canonical-container/v1',actorId,admission}

`admission` is the existing `prepareFastAdmission` contract. Its real validator
copies metadata and both finite unit384 vectors into SQL material. Persisted
parameters are ordinary JSON data, never an opaque JavaScript authority handle.
Vectors are exact PostgreSQL array strings, preserving binary64 signed zero.
The body/title/builder/extractor/document/generation/expected-version material
is revalidated by the original canonical admission SQL at completion.

Queue commandHash hashes ordered schema/policy/actor/prepared parameters, including
proposed Source/Topic/discussion allocations, timestamp, expected revision and
initial semantic node. Changed whole commands conflict. This is deliberately
STRONGER than the underlying admission's representation-only operation replay,
which can ignore changed proposed allocations/node on replay. Queue completion
never accepts new admission material from a worker.

Actor IDs bind explicit caller-declared identity, NOT account existence, native
capture, session authentication, producer authenticity or ML correctness.
`authoritySeconds` is a caller-supplied bounded lease budget, NOT evidence that
an authenticated authority issued it. Production authority must be supplied by
a separately reviewed boundary; SQL witness existence does not provide it.

Exports:

- `enqueueFastAdmission(db,{command,authoritySeconds})`: original deadline1–30s;
  exact replay does not renew it. At most8 live jobs. Existing Source URLs,
  legacy operation IDs (including terminal jobs), legacy active URLs, canonical
  receipts and direct-fast receipts conflict. Uses the exact008/009 growth
  advisory namespace `(914092008,1)`, not the Ridge catalog lane.
- `claimFastAdmission(db,{actorId,operationId,commandHash,workerId,leaseToken,
  leaseSeconds})`: addressed claim only,1–10s lease capped by original deadline,
  at most3 attempts. Live claim replay requires matching worker/token; expired
  lease reclaim requires a different token. No FIFO/fairness/general worker loop.
- `heartbeatFastAdmission` takes the same claim shape and requires a live exact
  worker/token. It never extends the original deadline or revives an old lease.
- `completeFastAdmission` takes the claim identity without leaseSeconds. One
  transaction holds the queue row, validates generation/deadline/lease, calls
  existing canonical `admit_new`, then records completion and scrubs prepared
  material. A second deadline/lease check AFTER admission makes late completion
  roll back canonical Source/container/receipt AND queue changes. Completed
  replay requires the original worker/token hash; it cannot allocate/move nodes.
- `cancelFastAdmission(db,{actorId,operationId,commandHash})`: atomic addressed
  cancellation; future old-worker completion cannot succeed. Cancelled/expired/
  erased jobs cannot be revived by replay.

Responses are detached/frozen `source-local-fast-queue-receipt/v1` metadata, with
explicit experimental true and productionValidated/assignmentAuthority false.
No prepared vectors or raw lease tokens are returned in responses. Owner-only
workers already supplied prepared evidence; no asynchronous classifier is added.

## Crossover and erasure

A new opt-in legacy queue trigger serializes INSERT reservations with the same
growth advisory lock and rejects ALL legacy operations using any fast reserved operation ID, and legacy
active jobs for an active fast URL. It does not replace or modify009. The sibling
admission's guard already rejects legacy jobs for admitted source-local URLs.
Legacy claims never see these jobs because this is a separate table. Direct calls
by the database owner to sibling admission remain possible; this prototype does
not pretend to constrain its trusted owner. Production grants/dispatch must close
that bypass and expose only reviewed commands.

Existing legacy UPDATE paths never acquire that growth lock: they can already
hold lane/runtime locks, so taking it there would introduce a lock-order cycle.
The trigger rejects changed operation IDs, terminal-to-active revival and changed
active URLs instead; unchanged reservations and active-to-terminal cleanup remain
compatible with the checked canonical claim/apply/forget paths. This is a source
lock-order repair, not an executed native PostgreSQL concurrency proof.

Canonical Source deletion invokes an actual BEFORE DELETE hook: complete queue
proof/receipt/source FK/lease hash are erased. Operation/actor/command-hash and
generation tombstones remain so the erased operation cannot recreate authority.
Terminal queue material, URL and raw lease credentials are scrubbed on completion,
cancellation or addressed expiry. No captured body text is stored. Existing
canonical posts/destinations remain governed by sibling forget mechanics.

## Verification and remaining activation blocks

Run only the isolated synthetic test:

    node --max-old-space-size=256 --test --experimental-test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-fast-queue-v1/test.js

Tests use one fresh in-memory PGlite with no dataDir/native DB/network/model. A
throwing Ridge function proves zero Ridge calls in THIS queue completion command,
not that the running service avoids its existing catalog scan. Tests cover exact
whole-command replay, signed-zero canonical wire, actor/lease/cancel/deadline,
attempt/capacity bounds, legacy crossover, stale material, post-admission injected
failure atomic rollback, forget scrubbing and unchanged seeded legacy records.

No native PostgreSQL concurrent lock/race or real authenticated client proof is
claimed. Tests use owner-only clock faults in the disposable engine. A bounded
production expiry sweeper is not implemented: expired unaddressed rows still occupy
the8-job bound until addressed claim/enqueue expiry; no automatic retry/renewal.
There is no durable grant revocation callback beyond explicit cancellation and
generation/deadline fences, no new policy-update route, worker fairness, queue
operator, generated-post path, provider authority or executable production migration.
Untrusted execute-only API/grants, native lock-order review (including concurrent
forget), trusted producer/account/native proof, actual policy dispatch/old-worker
compatibility and receipt consumers require root decisions before activation.
Legacy records/routes are not adopted or backfilled. No model-quality claim follows.

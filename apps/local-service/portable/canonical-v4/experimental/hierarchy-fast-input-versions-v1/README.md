# Versioned inputs and stable discussion bindings

ADR163 isolated, synchronous, owner-only source prototype. These four files are
not an applied migration, authenticated API, worker dispatcher or production
policy. Imports are inert. `createInputVersionFixtureDatabase()` creates a new
memory-only PGlite adapter with no dataDir option. The caller seeds the unchanged
canonical001-009 fixture, then explicitly calls `initializeFastAdmissionPrototype`.
Initialization accepts only an adapter minted by that factory, once, and refuses
old admission/queue namespaces. Never install this SQL into an owner database.

The code explicitly adapts the reviewed admission-v1 mechanics and queue-v1
whole-command identity/reservation mechanics. Neither old prototype is installed
or imported. Applied001-009, services, crawler, clients and all closed experiment
sources are unchanged. The SQL uses its own `hierarchy_fast_input_versions_v1`
namespace, `source-local-versioned-container/v1` source policy and
`source-local-versioned-receipt/v1` receipt. It never adopts existing Sources.

## Commands and evidence

`publishFastAdmissionArtifact` publishes one immutable root-only fixture artifact.
New admission creates an actual Source, normalized body embedding, singleton
membership and stable canonical Topic/discussion. It takes the existing brief
growth advisory namespace `(914092008,1)` and rejects stale generation/absence,
occupied IDs/URLs, pending or leased legacy URLs and operation reservations.
No Ridge transform, scan or fixed-reference row is created. The tests replace
the fixture Ridge scanner with a throwing stub.

`updateFastSource({admission,prior})` requires the full paired admission record
plus exact `prior: {sourceVersion,witnessHash,decisionHash}`. IDs and URL must
address the existing new-policy Source/container. It locks canonical receipts
before Source, locks its current pointer, and follows existing lifecycle
destination/root ordering. Operation reservation uses the brief growth lock
before the lifecycle lane so new admission/legacy enqueue cannot reserve the
same operation concurrently. No lane-owned trigger/apply/forget path acquires
that growth lock. It uses
the existing idle lifecycle lane fence, not matching or ingestion apply. A private
one-command intent authorizes only the exact next Source rewrite and is consumed
by the Source trigger. There is no GUC bypass or application grant.
The global idle-lane fence rejects updates while a crawler job is leased. This
is an explicit production activation blocker: these isolated version mechanics
are not a crawler-safe fast update or concurrency/throughput result.

Every changed accepted input appends immutable `input_versions`, keyed by actual
Source FK and resulting positive Source write version. Both384-dimensional
binary64 arrays remain in historical evidence with their exact `array_send`
hashes. No captured body prose is stored. Title, extractor, input/body/title,
builder, encoder, representation and document identities remain in bounded
immutable material. Signed zero is preserved without renormalization.

Immutable decisions reference input versions and the exact immutable artifact;
nullable node means abstention. `current_inputs` has composite Source/input and
Source/input/decision FKs. `reclassifyFastSource` appends a decision for the current
input, checks the prior decision, and switches only the decision pointer.
Reclassification locks receipt, Source and current pointer exclusively in that
order, before reading its prior decision. Root creation retains a shared Source
lock, so an accepted root witness stays stable through canonical commit. The
suite demonstrates sequential stale-prior rejection, not native lock-race safety.

Title-only and document-only changes append versions even when the old canonical
sourceStamp is unchanged. Exact renewal requires every immutable value and both
vector wire hashes to match; it cannot substitute a requested node or rewrite a
decision. This fixed artifact rejects incompatible builder/encoder/representation
changes without mutation. Reviewed artifact replacement is separate future work.

Update replay hashes the whole command, including prior identities, expected
generation/revision, allocations, timestamp, paired material, stamp and node.
Exact completed replay returns its original receipt. A-to-B-to-C then replay-B
cannot rewind the current pointer or authorize a new root using B. Reuse with
changed command material conflicts. New-admission replay retains the predecessor's
representation-only identity: proposed allocation/timestamp/node changes return
the original admission receipt, never a new current decision. These receipts are
historical outcomes, not assertions that their version is still current.

## Existing conversations and deletion

`createFastRoot` composes the actual canonical prepare/complete command with a
protected deferred root intent and immutable root binding in one transaction.
The root hook requires the exact current input witness AND decision. Bindings
have actual canonical root/Source/Topic/discussion FKs and composite historical
input/decision FKs. Existing bindings do not depend on the current input pointer.
Direct legacy human and generated roots in these containers fail; generated
sharing needs a reviewed wrapper. Existing replies retain canonical routes.

When an update changes the Source stamp, affected Source anchors are pinned in
place to the SAME canonical Topic, following005. Canonical root and discussion
write versions advance; IDs, bodies, authors and destinations remain unchanged.
Immutable version bindings remain unchanged. The suite proves actual unchanged
canonical read-facade `discussionPage` and canonical reply after body update.

`readFastRootFeed` returns bounded root IDs with scoped feed cursor invalidation,
canonical visibility/destination joins and no assignment/write authority. Root
withdrawal and account withdrawal erase bindings and advance affected feeds.
Source forget cascades all versions/vectors/decisions/current pointers/bindings,
experimental receipts/operations/intents. Canonical posts and destinations follow
the existing canonical lifecycle. Confirmed Topic deletion and clear-learned-data
remain separate canonical commands and are not blocked by experimental FKs.
An immutable `retired_operations` table retains only stored input generation,
operation ID and finite admission/update/renewal kind. Its composite primary key
has no Source FK. It retains no URL, input/digest/vector, root/destination,
receipt or credential. A BEFORE Source DELETE hook derives generation from
immutable versions and retires every admission/update/renewal operation before
the Source-FK cascades, without growth or lane locks. Retirements survive forget,
Topic deletion and clear; there is no automatic reset or delete route.

Admission/update reject retired IDs before replay or allocation. Legacy active
insertion/reactivation checks NEW generation/operation identity too; terminal
cancellation/scrubbing remains allowed. Reusing an erased operation with newer
revision/new allocation IDs or changed material cannot recreate Source authority.
A deliberate fresh observation uses a distinct operation ID. Existing generation
fences reject old-generation commands. This is not generation-reset/wipe or
native-race evidence. Root replay still requires current Source authority.

## Bounded verification and remaining work

Run from repository root:

    node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-fast-input-versions-v1/test.js

The suite uses one fresh memory engine, synthetic vectors and actual canonical
fixture migrations. It covers stale and cross-Source proofs, exact wire history,
renewal versus changed metadata, immutable bindings, A/B/C replay, canonical
read/reply, human/generated bypasses, transactional rollback, operation
reservations, forget/withdraw/Topic deletion/clear, scoped feed invalidation,
fixed definer search paths, no PUBLIC/untrusted table/function grants and exact
preservation of seeded legacy Source/post records. SQL owner-only checks do not
authenticate accounts, native capture, input producers or ML decisions.

Sequential PGlite is not evidence for native lock races, throughput, client/UI
behavior, actual producer quality, end-to-end latency or activation. Trusted
root/child/STOP/sibling/outside quality, reviewed artifact replacement, bounded
version-aware update queues with original deadlines/cancellation/post-mutation
expiry, production migration/recovery, worker/API/crawler dispatch, account/native
authority, generated-root sharing, policy-aware catalog/client/reply/Insight,
owner controls and parent feeds remain independent unfinished gates.

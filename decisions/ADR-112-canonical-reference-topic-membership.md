# ADR-112 Canonical fixed reference Topic membership

Date: 2026-10-13
Status: Implemented and activated after owner-approved encrypted backup and conversion

## Canonical membership and references

The owner requests connecting ADR-111 to the backend and extension. Canonical
state v4 stores every learned Source's sorted, unique `topicIds`, including its
existing primary Source link. Normalized storage v2 adds indexed many-to-many
memberships and private fixed Topic references, with exact JSON/relational mirrors.
Old formats remain supported and never convert on startup.

New or changed eligible provisional pages use the pinned Ridge1 transform and
floor 0.8639003810829322. An exhaustive query against fixed references assigns
all matching Topics; only an exhaustive empty result creates a new reference
Topic. References do not shift when their originating page changes. No global
regrouping, neighbor-membership inheritance, raw-E5 fallback or threshold retuning
occurs. Ineligible contexts receive an isolated container with no searchable
reference. Manual corrections remain explicit primary destinations and do not
automatically rematch.

Each reference retains one normalized Ridge vector, its originating Source ID
and the pinned coefficient hash inside canonical storage. Forgetting that Source
erases every reference it supplied and disables those Topics for automatic new
matches. There is no automatic replacement, recapture or reference resurrection.
Existing discussions and surviving memberships remain. Deleting a learned Topic
retains the old explicit deletion of its primary pages and discussion; a surviving
secondary member loses that membership only. Clear learned data preserves its
existing explicit confirmation boundary.

## Discussion view and authority

The membership feed reads the union of assigned Topics' original discussions.
IDs, bodies, destinations and immutable lineage stay stored once. A and B may
remain separate while middle page C joins both and sees both messages. Dashboard
v2 then counts two Topics with at least two distinct members and three unique
pages. Old v1 history is not relabelled.

Source membership IDs cross strict, version-bound catalog/receipt DTOs; references
and vectors do not. The extension requests and renders this canonical union even
when its legacy view preference is selected. If the union fails, the primary feed
remains usable but an explicit incomplete-read message identifies the missing
assigned Topics. Native navigation, version, account and disposal fences remain.

The primary Source link still supplies the default and only current-page write
destination. Secondary projections do not grant reply, edit or Insight authority.
Existing canonical navigation and historical same-Source reply proofs are
unchanged. Posting never recalculates memberships or references. Changed page
representations pin their historical roots at their original discussions.

## Recovery and owner conversion

The owner explicitly approves a fresh encrypted canonical backup using the
existing seven-day retention, a brief service stop, conversion and restart.
The fixed-port exclusive operator command verifies the backup against the exact
latest schema, generation/revision, record counts and logical state digest.
Its transaction compares the complete captured state again before creating new
tables. Failures and later accepted writes reject conversion without losing data.

Conversion adds only memberships and references, changes the schema/storage
format, and advances revision once in the same generation. Every existing primary
assignment, Topic/Discussion/Source/post ID, original vector, policy stamp and
contribution remains unchanged. Initial references come from the lexically first
qualified provisional member of each existing Topic. Historical memberships stay
at their original primary Topic; there is no automatic backfill asserting they
all satisfy the new radius. Identical revisits renew receipts without converting
grandfathered assignments or policy stamps. New/changed representations use the
new rule.

Pairing, accounts, private conversations and crawler state are not migration
targets. Provider sign-in restoration is the existing normal startup operation,
not a new inference grant. Old binaries cannot open normalized v2; rollback must
preserve later accepted writes and deletion and cannot restore a stale image
automatically. Unrelated unfinished credential/pairing changes must not be loaded
by this cutover; a checked source snapshot may use the same trusted data directory
and pinned installed Topic configuration without adding public CLI flags.

Activation exposed an already existing current-name pairing verifier. The checked
runtime now verifies the two known hash domains against the same exact-Origin
active record without rewriting or rotating it. It selects one existing
host-derived Windows DPAPI credential path without naming migration or read-side
deletion; corrupt current records never cause legacy fallback. Normal credential
renewal updates only that selected path. The unfinished naming implementations
remain outside the checked runtime and commit.

Conversion is complete at revision 3066 in the original generation. All 2436
Sources, 2451 Topic containers and 75 posts are preserved; the complete old-state
digest equals the verified backup after removing only added fields/schema/revision.
There are 2289 enabled fixed references. Private, crawler and pairing files are
byte-identical, and normal provider sign-in is connected. The encrypted backup
expires on 2026-10-20 at 08:18:21.563 UTC. No page capture, crawler run, synthetic
owner ingest, contribution write or provider inference occurred during cutover.

## Verification and scale limits

Real memory and normalized services, scoped commits, the strict HTTP/client/
controller chain, real isolated ingestion/read workers with the installed pinned
artifact, and packaged isolated Chrome pass the bridge and authority checks.
Independent adversarial tests cover capacity failures, stale prepared references,
concurrent comments/union reads, manual pins, reference erasure, qualification,
secondary deletion and reference privacy. Encrypted v4 backup tests include
reference vectors and preserve the live canonical file.

This removes quadratic global grouping from v4 ingestion but is not a claim of
million-page or thousands-heavy-writes-per-second readiness. The current exact
index has bounded 32 MiB retained/64 MiB temporary admission, weak pruning on the
measured owner geometry, synchronous tier merges and a ten-second CPU fence.
The ingestion worker still materializes canonical state before preparing scoped
changes. Exhausted resources fail closed, never report incomplete matches as
empty. Streaming persistent reference lookup, bounded large-union pagination and
large-scale ingestion measurements remain follow-up engineering work.

Final working-tree suites pass 1118 backend tests with five platform skips,
1542 restricted client tests and 31 dashboard tests. The checked source snapshot
also passes its full suites, with two additional skips for the absent installed
artifact; separate real-worker artifact tests pass. The isolated packaged Chrome
test verifies both original discussions, secondary read-only actions, incomplete
feed messaging and navigation fences. Live service core reads take 4-12 ms; all
32 parallel core reads succeed during the first 2428 ms enrichment. A strict
current Spiegel feed read returns the new policy in 47 ms without section errors.
These are local read observations, not million-page or hosted load benchmarks.

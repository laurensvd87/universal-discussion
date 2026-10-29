# Bounded background subject discovery

Unregistered hierarchy18 source, not installed on the live schema17 service.
Requires the general named-subject component, current semantic preparation and
the installed public pgvector0.8.2 extension. No Wikipedia, model download,
per-reader encoding, canonical ingestion claim or discussion rerouting occurs.

The index contains erasable Source-derived paired-E5 float32 mirrors plus up to
eight Unicode title keys. A HNSW search supplies at most95 candidates; eight
bounded lexical postings queries supply at most32; the seed is added explicitly.
After deduplication/current-Source filtering, at most128 body/title binary64
wires go to the worker. It verifies their hashes and norms, rebuilds the pinned
paired representation and exactly ranks candidates against the seed. At most64
observations are passed to the frozen v2 name policy, including up to16 reserved
lexical matches over the existing0.8 floor. This is approximate retrieval, not
an exhaustive catalogue result or a probability/identity claim.

HNSW is suitable for incremental insertion without a training step; its recall
still needs measurement. Query-local ef_search128 and iterative_scan=off restore
on function exit. The raw ANN budget precedes metadata filtering; missing matches
never cause an unbounded refill/full scan. See the primary
[pgvector0.8.2 documentation](https://github.com/pgvector/pgvector/blob/v0.8.2/README.md#hnsw).

Only current postable, protected semantic preparations enter the index. SQL
rechecks receipt/Source/version/embedding/stamp and installed identity before
indexing. A true material or eligibility change deletes its cache, title keys
and discovery request; a same-material renewal preserves the cache. Source
erasure cascades all derived retrieval state. Zero paired norm is retained as
an explicit excluded cache result, never searched or repeatedly encoded.

Durable work is Source-scoped and driven by prepared-observation/invalidation
triggers. A one-time installation backfill covers existing preparations. Index
polls select six urgent/recent and two oldest tasks; discovery selects three
urgent/recent and one oldest. Both queues have model/generation indexes, so a
model change does not turn an empty-work poll into a full catalogue scan.
App urgency is optional, per-Source, outside read transactions: locked work is
skipped with a function-local5ms lock limit. Completed work can be re-hinted after
30s, avoiding a busy loop from repeated context polls. No global hint-writer row.

The coordinator uses the existing prepared vectors and general publication
adapter. It preserves still-valid named selections when a bounded cohort lacks
additional evidence for that old subject. A newly discovered broader parent may
attach to a previously parentless subject with revision CAS and a current
member-superset witness; an existing nonnull parent cannot silently be replaced.
No canonical post or route changes. Publisher output explicitly identifies a
retained supported selection. Closing waits for physical work and never claims
an in-flight publication rolled back. Transient failures keep durable requests;
unsupported cohort capacity stays page-only and retires that derived attempt.

Pure tests cover binary64 validation/ranking, lexical quotas, queue protocol,
Source hashes, preservation of selection, capacity, conflicts and closing during
publication. Ten new required owned-SQL assertions exercise actual indexing,
access paths, current Source fences, best-effort urgency, the production
coordinator, first-parent attachment, role boundaries and committed erasure.
At initial source checkpoint these SQL assertions are UNEXECUTED. Old12-general
plus25+8+10 proofs remain historical component evidence. Refresh/authenticate the
maintained catalogue and record a separate owned-run decision before execution.

Still required: representative recall/latency tests, real multilingual aliases,
complete hierarchy18/profile/readiness, actual worker/API startup composition,
author-selected named context, occupied-topic indexed search/UI, recovery and
live concurrency/cutover. This module does not turn raw HNSW neighbours into
published topics by itself or recover an erased identity from a forgotten name.

# ADR 098 Normalized canonical storage and relevance-ranked Discover

Date: 2026-10-12

Status: Owner-requested implementation; independently reviewed and verified with
synthetic data. Real retained-data conversion and its recovery choice remain gated.
Extension integration version: 0.13.52. No running owner database was migrated.

## Request and scope

Implement larger canonical storage rather than a disposable search-only index.
Discover should favor the best match, then the Topic with more replies when
relevance ties. Preserve canonical Source/Topic/thread identity, accounts, private
isolation, exact generated-message authority and deletion semantics.

This implements the first local normalized-storage stage of the
[migration/recovery plan](../apps/local-service/experiments/topic-cloud/sqlite/MIGRATION_RECOVERY_PLAN.md).
It does not activate hosted storage, a crawler, new provider calls, mail or release.

## Storage decision

Add the explicitly selected `canonical-relational/v1` SQLite adapter. STRICT
tables store metadata, Topics, Discussions, Sources, embeddings, Source links,
contributions, revisions and operation receipts separately, with indexed lookup
and foreign keys. Small validated record payloads preserve exact optional fields
and existing domain semantics. Vector values remain lossless JSON numbers:
no quantization, new model, changed stamp or re-embedding is involved.

The normalized adapter removes the **aggregate** 8 MiB JSON-document and
1,000-contribution ceilings. It imposes no retained Source/Topic count ceiling.
Per-field validation, bounded requests/responses, current privacy limits and
generation/revision compare-and-swap remain. Legacy/memory adapters retain their
existing aggregate constraints; this is not an unbounded allocation policy.

An opaque ID/kind registry prevents cross-kind collisions and recycling removed
IDs within a generation. It retains no removed URLs, text, vectors or author
data. Reset rotates generation and resets this registry. Logical SQLite deletion
does not imply forensic erasure of free pages, journals or OS copies.

Ordinary public commands use validated affected-Topic scope and write only changed
rows/revisions in one transaction. Reads use indexed metadata, Topic, Source,
thread and ownership scopes rather than the entire canonical snapshot. Complete
affected-discussion closure is required for writes; an omitted child cannot
survive a root move/withdrawal. Existing immutable lineage, account ownership,
root/parent topology and Source stamps remain enforced.

## Read contract and client integration

All new routes retain the existing loopback/pairing, Host/Origin, input and byte
guards. Public reading still needs pairing, not an app account. No vector or
private-conversation text is added to the public DTOs.

- `GET /v1/version`: cheap canonical generation/revision.
- `POST /v1/catalog/context`: `{sourceId,topicId}`, each nullable; exact selected
  metadata, related candidates, historical destinations and required alternate
  group member metadata. Null/null bootstraps at most 100 Sources and 100 Topics.
  This is a read window, not a retained-data ceiling. Required exact metadata
  fails with capacity rather than silently dropping authority evidence.
- `POST /v1/catalog/page`: `{kind,limit,cursor}`, Topics or Sources, up to 100.
- `POST /v1/discussions/page`: `{topicId,limit,cursor}`, up to 100 flat current
  contributions/tombstones. Parent IDs can refer outside a page; a page is not
  proof of a complete thread or permission to reply. No revision history is sent.

Catalog and contribution cursors bind kind/Topic, page limit and canonical
generation/revision. Indexed keyset ranges replace offsets. UTF-8 byte-adaptive
pages resume after the last **included** item, without gaps. Existing timestamp
strings retain their established lexical ordering; migration does not invent dates.

The extension's controller, background matcher and toolbar now use version/scoped
catalog reads. A Source outside the initial catalog window is retrieved exactly.
Existing context, navigation, actor and late-response fences are unchanged.
Normal startup automatically opens an already normalized file, but never silently
converts a legacy file; fresh compatibility composition stays legacy unless the
trusted factory explicitly selects normalized storage.

Insight verification uses metadata-only headers when discussion context is off.
Explicit discussion inclusion preserves existing bounded human-root selection.
Follow-up proof loads the canonical target's complete stored body/thread, separate
from presentation pages, and still invalidates on edits beyond the 2,000-character
provider prefix. Private chats remain in their separate account-scoped store;
their durable one-shot claims and suppressed raw debugging are unchanged.

The standalone dashboard also supports legacy v2/v3 and normalized storage.
Its normalized handle is genuinely read-only: no file creation, initialization,
migration, journal-mode change or writable transaction. Catalog snapshots load
only metadata and vectors, not contribution payloads/revision bodies or account
records; existing safe exported DTOs still omit vectors and identity/post data.
Missing/unknown/legacy-with-normalized-reader files fail closed. The existing
1,000-learned-page visualization guard remains, not a canonical retention ceiling.

2026-10-12 dashboard polling correction: startup and refresh-key reads now select
the existing normalized `canonical_meta` or legacy v2/v3 `demo_state` metadata.
They validate storage format and generation/revision without reading catalog,
contribution or account payloads. This closes the remaining legacy-only polling
path that prevented normal dashboard startup after cutover; the existing graph
capacity and read-only snapshot/export behavior are unchanged.

## Discover order

The public FTS5 projection selects each Topic's **best matching document**, ordered
by BM25 relevance, then visible public reply count descending, recency descending,
and stable Topic ID. More roots or more repeated documents do not replace the
best-document score. Withdrawn and private messages never count as replies.
Blank-query browsing keeps its existing recent-first behavior.

This remains literal tokenized full-text search, not semantic search. Equal
relevance means an equal computed score; no popularity boost or arbitrary match
bucket demotes a better-scoring result. Ranking-version/query/limit/revision-bound
keyset cursors carry the reply tie-break too. An older derived index rebuilds
reply counts even if its old watermark matches.

Normalized change events update only affected Topic projections. Initial/recovery
rebuilds stream Topic scopes rather than load one full canonical document.
Watermarks are checked before/after projection work and reads; failed reconciliation
cannot turn an accepted canonical write into a reported failure or expose stale
deleted text. The index remains disposable, never canonical or private storage.

## Migration and rollback boundary

Conversion requires explicit trusted `allowLegacyMigration: true`; otherwise a
legacy file is inspected read-only and rejected before journal/WAL changes.
Synthetic v2/v3 import preserves exact generation/revision, IDs, ordering, vectors,
all surviving revisions, account/AI provenance and existing missing origins.
Historical v1 uses the already reviewed pinning migration and one revision increment.

Validate physical/schema/domain integrity, import inside one transaction, compare
the complete reverse projection to the input, verify foreign keys and only then
drop the old singleton blob. Injected pre-commit failures roll back the original
document/schema. Successful import leaves no active shadow capable of resurrecting
deleted bodies. An old binary fails closed on normalized storage; it is **not** a
post-commit rollback method. Already normalized startup performs integrity checks.

The owner must choose temporary protected backup versus no persistent duplicate,
location/retention/restore rules, and service outage before real conversion.
No owner backup/export, conversion, process restart, credential reset or provider
request was performed for this work. Account/private stores and protected login
are not migration targets. Keep the running service and extension together: load
0.13.52 only after the matching backend is restarted at the approved cutover.

## Evidence and honest remaining limits

Denied-external-capability suites exercise more than 8 MiB of canonical state,
1,200+ messages, 2,600 Sources/1,200 Topics, 1,300 full 384-dimensional vectors,
dense Topics, Unicode byte trimming, multi-connection CAS, read query plans,
transaction failure, restart, lossless migration and deleted revision purge.
Instrumented ordinary service/AI/private/account operations fail if they call
the whole-state loader. A 620-historical-destination regression checks metadata
batching; independent Trust also checks exact alternate-group closure.
Public FTS tests include 12,000 Topics, relevance/reply ties and incremental
updates. Isolated Chrome community/layout tests use synthetic data, not a provider.
Final suite counts and secret-scan evidence are in `plans/STATUS.md`.

This is **stage-one larger local canonical persistence**, not proof of thousands
of new pages per second or production readiness. Current global ingest/regroup,
alternate discussion planning and account erasure still load global state; exact
vector retrieval still scans the vector inventory. Ordinary writes/index updates
still work over the affected Topic closure. Full-thread UI projections remain
1 MiB-bounded; the new flat discussion pages are a backend foundation, not yet a
fully paginated panel/thread browser. Further indexed write scopes, incremental
matching, explicit root/reply UI pagination and current-client integration with
the portable PostgreSQL backend remain separate implementation work. The
dashboard's global graph/PCA needs a separate paged/local-neighborhood design
before its visual capacity can grow safely.

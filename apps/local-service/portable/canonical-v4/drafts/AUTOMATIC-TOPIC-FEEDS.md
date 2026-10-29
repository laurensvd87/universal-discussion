# Automatic topic feeds and global search

This is an unregistered hierarchy18 component. Schema17 startup, the live
database and the sealed crawler do not install it. It needs the named-subject
and explicit author-context components first. No Wikipedia access, provider,
capture, encoder, new canonical destination or legacy-post relabelling occurs.

A new explicitly scoped root gets its direct feed edge in the same canonical
transaction. The existing background coordinator can process up to eight feed
events before its unchanged eight index/four discovery tasks. A finite event
enqueues at most sixteen existing roots and sixteen children in one call.
Existing-root traversal freezes an upper ordinal, so new posts cannot extend a
repair indefinitely. Each new post has its own durable event. No shared topic
counter or background-owned queue row is updated by a foreground writer.

Ancestor edges use the actual named-parent chain (maximum eight), never a
Source's accepted path as a universal taxonomy. A worker uses ordered shared
locks with SKIP LOCKED and rechecks all links. Contention retains the event; it
does not block direct-feed reads or guess ancestry. The canonical root ID,
discussion, destination topic and author-selected title remain unchanged.
Preparation is eventual: a broader feed can temporarily omit an unprepared
root. Public UI integration must expose preparation and retry without delaying
the editor. This draft does not yet supply that UI or extend reply witnesses.

Search is global and independent of an active page. Its public adapter accepts
at most eight normalized Unicode prefix tokens, a page size up to fifty and a
query/generation/page-size-bound keyset cursor. Blank browsing walks a unique
scope directory index; nonblank search uses a GIN index over distinct authored
caption aliases. Results deduplicate scopes and prioritize human-occupied ones.
There is no topic-count/full-directory download, vector scan or inference in a
search/read call. Search activity ordering may change between page requests;
the cursor does not promise a frozen cross-request snapshot or exact totals.

Derived aliases/ancestor witnesses have head foreign keys, so Source erasure
removes derived labels and ancestry atomically. Explicitly posted author
captions survive with their discussions. Root withdrawal removes its caption
cache synchronously; bounded opaque-ID-only repair can use surviving authors
or a still-live head. It never retains a removed caption in the event queue.
The worker owns cache writes; application roles receive only read functions.

The owned native fixture additionally checks immediate root visibility,
ancestor aggregation with original destinations, global prefix search,
physical concurrent read/write behavior, head-lock deferral, fixed-cohort
pagination, index plans, execute-only grants and Source erasure. Its nine-case
ledger is required by both the Node and Python completion validators. Pure
adapter/coordinator tests use no database and cannot stand in for SQL evidence.

Current stage: source and pure tests only; actual SQL has not run for this
component. Owner policy for named subjects, aliases across languages/model
changes, public feed/search/reply integration, complete schema18 installation
and migration/recovery/browser/live validation remain separate required work.

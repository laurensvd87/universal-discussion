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

## Verification

The owned native run `run-7d7843c132eb21d014c996e6e6b8b8fcde293bc2e1bb0726`
passed on PostgreSQL17.11 with source `1f435e63` and catalog
`50b1bfafb267c5c43a748efcb007f9f09c2cec000927dc4e0767a91b79c35c70`.
All original82 reports and nine new feed/search reports passed. Root separately
authenticated all2585 source/runtime end pins and the two scratch-database
drops, exact owned smart stop, empty Job, closed handles and zero stderr.
There was no independent reviewer. This is narrow concurrency evidence with
invented general-web material, not representative semantic accuracy, many-user
load, real browser, external-provider or live-latency evidence.

The prior run `run-bd5e3326a7f84117643d68a08e1db417b93b13a210ecb796`
failed installation with SQLSTATE42601 and closed normally. The source had a
CASE expression without surrounding parentheses in an IF condition. PostgreSQL17
`read_sql_construct` stops at the inner THEN at parenthesis depth zero (see
[PostgreSQL's parser source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/pl/plpgsql/src/pl_gram.y)).
The accepted run derives two actual DO compile probes from the installed
condition: removing the outer parentheses must reproduce42601; the protected
form must compile. Saved failed outputs and catalog remain unchanged.

533 guarded Node and67 pure Python controller tests also pass. Root audit:
`apps/local-service/data/automatic-topic-feeds-native-root-audit-20261029.json`
(local ignored evidence). The installed application is still schema17. Owner
policy for named subjects, aliases across languages/model changes, public
feed/search/reply integration, complete schema18 installation and
migration/recovery/browser/live validation remain separate required work.

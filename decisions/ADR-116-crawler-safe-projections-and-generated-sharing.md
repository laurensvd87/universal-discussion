# ADR-116: Crawler-safe optional projections and generated sharing

Date: 2026-10-13
Status: Accepted and active locally; browser client 0.13.65 requires reload

## Context

The owner requires crawler PID31900 to remain running as a realistic stress test
while people read Topics and create AI replies. PostgreSQL remained healthy: no
lock waiter/blocker, deadlock or idle transaction explained the failures. The
intermittent assigned-Topics, earlier-threads and related-discussions errors,
delayed secondary Topics and failed generated sharing were application coupling
to storage representation, optional whole-catalog work and the global revision
watermark.

Normalized PostgreSQL Sources intentionally keep embeddings in
`canonical_v4.embeddings`; imported Source payloads need not duplicate the vector.
The reader incorrectly treated an absent inline mirror as corruption. Alternate
Topic loading also expanded a two-membership request through `fullCatalog()`, so
a small projection inherited whole-catalog capacity and latency. The browser
waited for combined enrichment before publishing alternate Topics and required
optional later reads to return the exact earlier global revision.

AI preflight assembled context through several reads and used the ordinary short
transport deadline. Unrelated crawler commits could advance the revision during
that work or between generation and exact sharing even when Source, Topic,
target, actor and body remained unchanged. Live profiling confirms that exact
related similarity still scans this catalog and currently takes roughly three
to six seconds.

## Decision

Treat the normalized embedding row as authoritative. Validate its model,
dimensions and exact double values; when an optional inline Source mirror exists,
continue requiring exact equality. This changes no stored owner data.

Build alternate membership projections from the requested Source, its exact
discussions and an indexed query for only the relevant Topic memberships. Do not
load the full catalog. Start this targeted projection in parallel with combined
enrichment so secondary Topics can appear before optional similarity finishes.
Optional alternate/earlier presentation reads may accept a same-generation
revision at or after the initiating revision, but remain read-only projections:
they confer no current-page, reply or generated-write authority. Older/different
generations and mismatched Source/Topic topology remain rejected.

Add repeatable-read `insightBundle` and `insightJobBundle` projections. A
same-generation newer revision may replace the browser's observed revision only
after the server rebuilds and exactly compares the bounded Source, Topic,
destination, account, target and body context. Before persistence, revalidate
that exact job context and write against the current authoritative revision. One
retry is allowed only after a definite internal persistence conflict and another
successful exact revalidation. Never repeat the provider request. Edit,
withdrawal and unrelated command authority remain unchanged.

Give authenticated `POST /v1/ai/insights` the existing one-shot start lease after
parsing, pairing and actor validation. Its deadline is an absolute30 seconds from
socket acceptance and cannot be renewed; the browser start transport uses the
same bound. Rejected or unauthenticated requests receive no lease. The sealed
operator marker requires both `leaseAuthenticatedModels` and the new `ai.create`
transport signature so an older incompatible runtime cannot pass preflight.

Keep crawler, worker, dashboard and PostgreSQL running during activation. Only
the HTTP service may restart. Do not reset crawler state, invoke a provider,
create an owner post or infer new capture/inference authority for verification.

## Verification and activation

Tests pass: backend1,148/1,153 with five skips; extension1,550/1,551 with one
skip; portable PostgreSQL101/101; focused AI/account71/71, browser135/135,
backend107/107, canonical9/9, private19/19, bridge30/30 and deadline27/27.

Before activation, restricted read-only checks against the live owner database
completed selection in515ms at revision7081, exact related lookup in2934ms with
14 results, scoped alternate projection in13ms with two Sources/two discussions,
combined enrichment in3644ms with no errors and the complete Insight bundle in
3266ms at revision7082.

The checked runtime contains1,354 files/15,214,709 bytes and is sealed at
`05e62d7a6bcaaa9b412ec9d99e772b39b9c9f5b5b7ca91d74639b105faa57359`.
A service-only restart changed PID14812 to PID12512 while crawler PID31900,
worker PID22884 and dashboard PID6644 stayed running. The crawler advanced from
3,530 complete jobs/runtime revision7085 before restart to3,536/revision7091
after it. Paired post-restart checks returned health200, selection in48ms at
revision7092 with one root, alternate in17ms at revision7092 with two Sources/two
roots, enrichment in3365ms with no optional errors and AI status connected,
planEnabled and not pending. Reading status did not invoke the provider.

A postactivation wave returned100/100 HTTP200 with zero rejected requests for80
version and20 catalog reads in1,206ms at revision7098. The wave filled the
32-slot API pool. The following audit saw36 sessions:32 API sessions idle on
`ClientRead`, one idle dashboard, one idle crawler, one active worker and the
active audit session. The 34 reported wait events were normal idle client
sockets, not PostgreSQL lock waits. No provider request, owner-content post, data
migration or crawler-state mutation was used for verification.

Dashboard PID6644 also remained current. Its intentionally static
`dashboard.html` shell kept its startup timestamp while the atomic `snapshot.js`
bridge advanced to6,451 total/6,443 learned Sources and4,874 Topics during the
check; isolated Chrome consumed the bridge successfully. The reported4515 view
was an old dashboard tab/DOM from the preceding runtime, not a stuck database or
watcher. Reopen or reload that tab once; the live page then polls every three
seconds.

## Consequences and limits

Assigned Topics can publish through the small indexed projection rather than
waiting for optional full enrichment. Unrelated crawler commits no longer make
coherent earlier/alternate presentation or an exactly revalidated generated
share appear stale. Current-discussion availability remains independent of
optional related work.

Exact related retrieval is still approximately catalog-wide and measured at
three to six seconds here. It remains bounded optional/background work rather
than a prerequisite for the primary discussion, but this change is not a hosted,
unlimited-growth or thousands-of-heavy-queries claim.

The local PostgreSQL setting remains `max_connections=100`, including three
superuser-reserved slots, so97 are ordinarily available to application roles.
This is a server-session ceiling, not a user ceiling: HTTP users multiplex over
connection pools. An earlier low-load audit saw10 sessions; the deliberate wave
filled the service pool and produced36 total against configured component pool
maxima of38. The setting can be raised with a PostgreSQL restart, but each session
has memory and scheduling cost. Measure saturation and tune pool sizing/
backpressure or introduce PgBouncer before raising it merely to represent more
users.

Reload unpacked extension0.13.65; the app session may renew. This ADR changes no
canonical data, Topic assignment, provider permission, deployment scope or
crawler frontier.

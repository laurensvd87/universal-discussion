# ADR-117: Insight readiness and exhaustive related integrity

Date: 2026-10-13
Status: Accepted and active locally; browser client 0.13.66 requires reload

## Context

The owner reported that the AI reply control appeared disconnected and that the
root AI Insight control had disappeared while the crawler continued as the live
stress test. The reply click reached the controller, but preparing its request
required an optional related-Source result even though the current page and its
canonical Topic already supplied sufficient authoritative context. The root
control was likewise hidden until that optional result completed. A missing
configured model also left reply clicks without a useful setup route.

The optional lookup finds semantically similar learned Sources outside the
canonical current-page/Topic path for additional discovery and optional provider
context. It does not assign Topics or grant discussion, reply or generated-write
authority. The current implementation exhaustively loads and validates the
catalog before applying its exact binary64 cosine floor of0.88, and therefore
costs roughly3-6 seconds on the current catalog.

A robust pgvector candidate prefilter was investigated. Its SQL candidate phase
measured656-697ms after earlier complete calls measured3.93-4.68s. Independent
review found that hydrating only selected candidates could let filtered-out rows
bypass the existing complete Source, link, receipt and optional embedding-mirror
verification. That changes a fail-closed integrity property even if the returned
similarity result happens to match.

## Decision

Current-page root and reply Insights must not wait for related similarity. Pin
the related context available when a deliberate request begins. If none is ready,
send `includeRelatedSources: false`; the server then skips the semantic lookup
while rebuilding and exactly validating the canonical Source, Topic, actor,
destination, target and body context. Omission retains the existing compatible
include-related behavior. The flag can only remove optional context and confers
no new authority.

Make the root Insight control depend on canonical discussion readiness, not the
optional related lane. If an otherwise valid reply click observes that AI is not
configured or has no model, open the existing setup flow instead of silently
ending. Preserve click de-duplication, deliberate one-shot generation, page and
account proofs, and all provider and sharing boundaries.

Reject and fully revert the pgvector candidate prefilter. Related lookup retains
the exhaustive catalog hydration and complete Source/link/receipt/embedding-
mirror verification, followed by the existing exact binary64 0.88 comparison,
ordering and de-duplication. The656-697ms experiment is not installed and is not
an endpoint-performance claim. A future optimization must preserve the complete
fail-closed validation contract or explicitly replace it with independently
reviewed equivalent integrity evidence.

Keep crawler PID31900, worker PID22884 and dashboard PID6644 running during any
activation. Only the HTTP service may restart. Verification must not invoke the
provider, publish an owner post, mutate crawler state or broaden inference scope.

## Verification and activation

After reverting the prefilter, offline suites pass: backend1,149/1,154 with five
skips; extension1,551/1,552 with one skip; portable PostgreSQL102/102. The active
related algorithm remains exhaustive and is still expected to cost about3-6s;
the user-facing availability fix is that root/reply Insight no longer waits for
it and may explicitly omit it.

Focused browser206, bridge31 and canonical10 tests also pass. An isolated
packaged-Chrome community visual check passed the core-ready/enrichment-pending
and inline-reply layouts at320px,390px and480px with no overflow or uncaught
errors. The checked runtime contains1,354 files/15,215,725 bytes and is sealed at
`946989dbfbf334f10dcc6f74a39117a512bbb493705aa9d655599fbec181c0d8`.
A service-only restart replaced PID12512 with PID35588 while crawler PID31900,
worker PID22884 and dashboard PID6644 stayed live.

At live revision7369, `includeRelatedSources:false` completed in45ms, returned
`related:null` and issued zero full-embedding queries. The compatible true path
completed the exhaustive lookup in2966ms, returned20 results and issued one
full-embedding query. A mixed HTTP read wave returned100/100 HTTP200 with zero
rejected requests in1150ms at revision7359. Worker and crawler activity continued
through revision7372.

No provider request, owner post, data migration or crawler-state mutation was
used. Reload unpacked client0.13.66; the app session may renew.

## Consequences and limits

AI root and reply requests can start from exact canonical current-page context
even while related discovery is still running or unavailable. Related discovery
remains useful for optional cross-Source suggestions and richer context, but no
longer controls whether the primary discussion can generate an Insight.

This decision does not accelerate a complete related lookup. It keeps its current
integrity checks and latency while removing it from the critical AI-action path.
Canonical Topic assignment, stored data, account authority and provider
permission are unchanged. This is not a hosted-scale or unlimited-concurrency
claim.

# ADR-105: Local aggregate catalog growth history

Date: 2026-10-12
Status: Owner requested; implemented and independently reviewed

## Context

The owner requests backend history of page/Topic counts and a Topics(y) versus
pages(x) curve to observe whether Topic growth slows as ingestion continues.
The latest crawler stop reports only the former generic `unavailable` class;
its exact HTTP status is not recoverable from that output. Queued/staged work
and accepted Sources survive both crawler and computer restarts.

## Decision

The normal local service samples at startup and every sixty seconds into a
separate ignored `data/topic-growth.sqlite`. Initial dashboard generation may
record one baseline; its watcher is read-only, so refresh cannot cause a write
loop. No canonical migration, page revisit, provider call or new listener occurs.
Recording failure is isolated from service availability, with a fixed notice.

Each point contains UTC time, SHA-256 of the canonical generation, revision,
total Sources, learned pages, active canonical Topics and total retained Topics.
Learned means the existing owner-local-page-embedding/v1 provenance; synthetic
fixtures are excluded. Active means a canonical Topic linked to a learned Source,
not an empty/orphan Topic or a Ridge1 presentation group. Topic identity/grouping
rules and historical assignments remain unchanged.

Normalized reads use a consistent read-only transaction on metadata and scoped
Source/Topic/link aggregates, without vector, body, contribution or account reads.
Legacy reads compute bounded document aggregates inside SQLite without returning
the document to the sampler. Neither retained points nor exported history contain
URLs, titles, Source/Topic IDs, embeddings, discussion text, accounts or tokens.
Exact schema/path/sidecar checks fail closed; export projects a strict data-only
DTO before serialization, rejecting extra fields, accessors and proxies.

Minute buckets retain recent 24 hours; older history keeps the latest point per
hour/generation, at most 90 days and 4,096 points overall. Store startup and
accepted samples prune; reads filter expired samples. This is not physical expiry
while offline or inaccessible. Same-bucket unchanged samples are no-ops; delayed
timestamps/revisions cannot overwrite newer observations. No historical baseline
is reconstructed and no offline sample is invented.

The dashboard offers time-series and pages-axis views with bounded time windows,
current counters/deltas/pages per Topic. Generation changes and gaps split lines.
Count decreases remain visible; the pages-axis view follows temporal order,
not sorted x values or a fitted monotonic curve. No eventual plateau is promised.
Above the existing 1,000-page graph guard, aggregate history remains available
without loading vectors or silently sampling the map. Unchanged graph refreshes
reuse a process-local version/artifact-bound bundle when only history advances.

Complete crawler HTTP 408/500/503 responses now have fixed distinct diagnostic
codes; retry/deadline/generation/idempotency policy is unchanged. A later run can
identify the response class, not prove the old generic failure's cause.

## Verification and limits

Backend aggregate/retention/privacy/failure-isolation checks and dashboard
restricted integration checks pass, including 1,001 Sources with unreadable
vectors, history-only refresh with unchanged history bytes, and hostile DTOs.
Synthetic actual-Chrome fixtures cover both axes, decreases, gaps, invalid
history and refresh-preserved view selection. Independent review accepts the
base implementation and final root integration; full backend regression passes.
The owner's canonical counts, ledger and history survive reboot. No agent crawl,
canonical ingest, inference or post is performed for verification.

This is an owner-local operational history, not unlimited graph rendering,
semantic quality calibration, hosted analytics, export clearance or automatic
crawler/service startup at Windows login.

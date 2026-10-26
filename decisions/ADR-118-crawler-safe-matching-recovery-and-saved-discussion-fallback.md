# ADR-118: Crawler-safe matching recovery and saved-discussion fallback

Date: 2026-10-14
Status: Active in the local PostgreSQL runtime as of 2026-10-15; client changes
ship in 0.13.68 and require extension reload.

## Context

The owner reported that the panel repeatedly showed "Page matching is
temporarily busy. Saved discussions remain available" while the crawler stayed
active, but the saved discussion was not actually visible. Earlier live audits
already established that PostgreSQL had no lock waiter or blocker, deadlock, or
idle transaction causing this symptom. The failure was application behavior at
the page-matching and presentation boundaries, not a PostgreSQL reader/writer
lock.

The background matcher retried only `unavailable` failures and stopped after
four delays. A complete `conflict` or `capacity` rejection therefore remained
terminal under a long-running crawler. The side panel's frequent status poll
only reads cached state and deliberately cannot begin page capture, so it could
not recover a stopped matcher. At the same time, a checking or error resolution
cleared a previously loaded canonical discussion. On initial panel open there
was also no read-only way to retrieve an already saved learned Source when its
matcher result was temporarily unavailable.

Any recovery must preserve the existing capture lease, exact page/document
witnesses, pairing and canonical expected-version checks. It must not replay a
possibly accepted ingestion, infer write authority from a URL, transmit a raw
session/tracking URL, invoke the provider or hide a real navigation behind an
old discussion.

## Decision

Keep exactly one automatic matcher retry flight. Retry transient
`unavailable`, `conflict` and `capacity` outcomes after 2, 4, 8 and then a
recurring capped 16 seconds while the same explicit capture lease remains
valid. Every attempt renews the pairing, permission, foreground tab/window,
original navigation URL, session, block-list and document-attestation checks.
The side panel status poll remains read-only and never starts capture or resets
the retry delay. Stop, block, navigation, window close, unpair and permission
revocation cancel the pending retry.

Automatic retry is permitted only when the failure happened before ingestion
dispatch or the local transport privately brands a complete canonical
rejection. The brand is held in a module-private `WeakSet` and cannot be forged
with an error property. For ingestion, only the exact complete JSON response
for HTTP409 conflict or HTTP413 capacity from `/v1/sources/ingest` is branded;
malformed, partial, timed-out, constructed and request-too-large responses are
not. An unavailable or invalid response after dispatch, a lost response, or a
successful ingestion followed by a later local witness failure is terminal for
automatic retry. The existing confirmed-conflict path still renews the exact
canonical version and document attestation without changing the operation ID or
representation. There is no blind server rebase.

When a previously ready same-page background selection moves through matching
`checking`, `processing` or `error`, retain its accepted catalog and discussion
for display but set the controller to `loading`. That state is strictly
read-only: root/reply composers, edits, withdrawals and root/reply Insights stay
closed. Preserve the prior verified `documentId` across the matcher's temporary
null witness. A different replacement `documentId`, URL, tab/window, session,
host-access or block-list witness, or a null/malformed resolution clears the old
discussion and detaches any draft before another selection can load.

Add paired `POST /v1/catalog/url-selection` for the initial no-discussion case.
Attempt the exact Ready/URL page selection immediately after paired health and
before the optional broad null/null chooser catalog, so failure of that broader
presentation read cannot hide a known page's saved discussion. The endpoint
accepts only a URL that is already the fixed-point sanitized persistence output
of `inspectPageNavigationUrl`; raw document, session, tracking and hash URLs are
rejected and never transmitted. PostgreSQL performs an indexed exact learned-
Source URL lookup, then returns the bounded catalog context and full primary
discussion from one `REPEATABLE READ READ ONLY` snapshot. Exactly one learned
Source, its primary Topic link and coherent versions are required.

The controller derives that sanitized URL from matching page-resolution and
active-tab witnesses and repeats those exact witnesses after the request. The
fallback publishes only `selection:"background", phase:"loading"`; normal
matcher Ready remains necessary for any post, reply, edit, withdrawal or
Insight authority. If matching becomes Ready during the read, the normal exact
Source/Topic path wins. This fallback reads existing canonical data only. It
does not create or update a Source, capture page content, embed text, invoke a
provider, or grant inference or write authority.

Keep the owner's crawler running as the stress test. Activation may restart
only the HTTP service and must not stop, reset, rebase or mutate crawler state.

## Verification and activation

Focused offline suites pass:

- background adapter 113/113;
- background matcher 106/106;
- confirmed ingestion rejection 17/17;
- matching conflict Trust 2/2;
- discussion panel 95/95;
- canonical-v4 read 10/10;
- asynchronous public-read routing 41/41;
- local service client 29/29; and
- local discussion controller 91/91.

These tests cover capped single-flight recovery, cancellation on every authority
change, branded versus ambiguous ingestion outcomes, an accepted ingestion
followed by a failed local witness, exact sanitized URL lookup, one-snapshot
catalog/discussion coherence, late-response fencing, retained read-only display,
replacement-document clearing, null/malformed resolution clearing and saved-page
recovery even when the broad chooser catalog fails.

Live tests exposed two additional deadlines: the URL route initially retained
the ordinary five-second transport/client budget, and saturated FIFO API-pool
admission had its own five-second timeout. The validated exact-Origin URL route
now receives the existing absolute thirty-second projection lease. A separate
four-connection pool of the same app role runs only its read-only snapshots.
Ordinary routes retain their deadlines. Pending identical public reads coalesce
by method, copied validated input and server-read canonical revision, with
bounded 32 tasks/4,096 waiters (separate eight-task URL lane). Completed results
are never cached. Cancellation and final authorization stay caller-specific;
newer revisions cannot join an older flight.

Crawler version/catalog reads retry transient failures with abortable 2/4/8/16s
capped recurring backoff. Ingestion replay, durable operation identity, authority
and generation checks are unchanged. Earlier service gaps/load caused the old
manual crawler and two replacement invocations to exit; this was observed and
reported rather than counted as preserved-process evidence. The corrected
crawler was started visibly as PID30008 and subsequently survived service-only
restarts while continuing accepted jobs (12,356 to12,370 at revision16,000 and
later). Worker22884 and dashboard6644 were preserved throughout.

Backend complete suite:1,176 pass/five skips; later focused input-snapshot
regressions11/11. Client final verification is recorded under ADR-119. A live
100-request burst plus delayed exact-URL projection now returned100/100 HTTP200
in691ms and the saved YouTube discussion in146ms. Another burst during crawler
writes returned100/100 in733ms and the discussion in187ms at revision16,024.
Both bundled versions agree and the root/reply remain present. Provider status
is connected/planEnabled/notpending; no provider inference was dispatched.
PostgreSQL audits report zero lock waiters/blockers/deadlocks/idle transactions.
Pairing SHA-256 remains7629C271C5C604A25B275A779C534A7EA9A9D5839DAC79F18D4062B879818092.

Final combined checked runtime seal (including ADR-119 username validation):
f7206d0bcf65cc3e77c8437d0cfc6ef958ff57245fc0ad25c2f17dacf7871a31,
1,355files/15,225,994bytes. Current service PID43084.
Final live read wave at revision16,049:100/100 HTTP200 in586ms, exact saved
thread280ms; same crawlerPID30008 reached12,419 complete jobs and the dashboard
snapshot continued updating. Service stderr remains empty.
Owner-profile extension
reload and interactive verification remain the owner's next step; isolated
Chrome/offline evidence does not claim that reload occurred.

## Consequences and limits

Known saved discussions remain readable while same-page matching waits or
recovers, and a persistent transient rejection no longer becomes permanently
stuck after four attempts. New or changed pages still require normal matching;
the URL fallback cannot invent a Source or make a page writable.

This decision changes neither PostgreSQL locking nor the canonical write lane.
It does not raise connection limits, accelerate exhaustive related similarity,
permit parallel matching writes, authorize provider inference, or establish
hosted/unlimited scalability. Persistent invalid input, lost/ambiguous write
responses and genuine authority changes continue to fail closed.

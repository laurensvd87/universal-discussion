# ADR-115: Live-crawler interactive selection and append acknowledgements

Date: 2026-10-13
Status: Accepted and active locally; server activation complete, browser client 0.13.64 requires reload

## Context

The owner requires the crawler to stay running as a realistic stress test while
people read discussions and post. Live PostgreSQL diagnostics found no database
lock waiter or blocker, deadlock, or idle transaction, and concurrent API and
discussion reads completed normally. The visible outage was above the database
boundary.

The panel fetched catalog context and discussion separately, then required the
two global revisions to be identical. Any unrelated crawler commit between those
requests produced a false page failure. PostgreSQL root and reply transactions
already treat the observed global revision as an ordered watermark and revalidate
the exact generation, Source/Topic destination, Source postability and reply
ancestry. A valid append can therefore return revision R+2 or later when the
crawler commits after the browser observed R, but the browser incorrectly
rejected anything except R+1.

## Decision

Add authenticated `POST /v1/catalog/selection`. Its strict input is
`{sourceId,topicId}`. One repeatable-read, read-only PostgreSQL transaction
returns the scoped catalog context and bounded full discussion. Server and client
require one generation/revision, the exact requested Topic, and the optional
Source's primary-Topic binding. Overlapping secondary memberships remain visible
through their existing read projection but confer no current-page write authority.
The production panel uses this atomic projection instead of attempting to
reconcile two independent snapshots.

For human `create-root` and `reply` command responses, require the expected
generation and a returned revision strictly greater than the observed revision.
The PostgreSQL command transaction remains authoritative for exact destination,
ancestry, actor/account, Source and replay validation. No blind client retry or
relaxed request authority is introduced. Edit, withdrawal, generated sharing,
lifecycle and every other command keep their existing exact expected+1 response
rule.

The global revision remains an ordered compatibility/change watermark, not a
cross-request snapshot token and not a universal compare-and-swap key for
independent appends. The crawler keeps its bounded lane and is neither stopped
nor reset for interactive availability.

## Verification and activation

Focused client/controller tests cover an intervening unrelated revision, one
coherent selection bundle, manual Topic selection, accepted same-generation R+2
appends, and rejected wrong-generation, non-advancing or non-append R+2 responses.
Portable service/HTTP tests cover primary overlap binding, rejected secondary
write binding and the same-snapshot projection. Full checks pass: backend 1,142
with five platform skips, extension 1,545/1,545 and portable PostgreSQL 99/99.

The checked runtime was sealed at
`ea5d05b6bf96533a518433cf6c85b7ad8fcb7638496eb9c0a7656b66cb3c8069`
and passed preflight. A service-only restart changed the service from PID 6596 to
PID 14812 while crawler PID 31900, worker PID 22884 and dashboard PID 6644 stayed
running. Against the real owner database during crawler writes, 100 parallel
selection requests returned 100 HTTP 200 coherent catalog/discussion snapshots
in 498 ms while responses spanned revisions 5703-5704. The crawler subsequently
advanced to revision 5708 with 2,194 completed crawler jobs. No owner post,
provider request or crawler-state mutation was used for verification.

## Consequences and limits

Ordinary crawler commits no longer blank the selected discussion/composer or
make a durably accepted human root/reply append look like an invalid response.
Conflicting writes to the same protected object still serialize and may fail
normally. Generated `share-insight` operations and edit/withdraw lifecycle work
still retain stricter global-revision authority and can require a fresh deliberate
attempt after concurrent change. The combined selection retains the one MiB
response ceiling, which can be reached sooner than two separate responses.

This does not make matching apply parallel, add API replicas, prove hosted or
unlimited throughput, or grant capture, inference or post-QA authority. The exact
reported YouTube URL remains absent until an eligible browser revisit.

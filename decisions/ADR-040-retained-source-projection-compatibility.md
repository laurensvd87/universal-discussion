# ADR-040: Read historical Sources without reopening capture

Status: accepted as a compatibility/safety correction within the existing
owner-local prototype scope, 2026-10-04.

## Context

ADR-039 correctly excludes obvious account/credential host labels from *new*
page capture. The URL validator was also used on every Source in the paired
service's catalog response. Seven already retained Sources in the owner-local
database now fail that policy. The service remains healthy, but one rejected
entry makes the extension reject the entire catalog and show `Local service
unavailable`. A read-only projection check confirmed the failure with 71
Sources and 65 Topics; it did not print page URLs or inspect page content.

## Decision

Separate syntactic validation of authenticated, already retained Source DTOs
from eligibility for new capture. The retained DTO path applies the same URL
scheme, public-host shape, private-path, credential-query, length and control-
character checks, allowing only the ADR-039 credential-host-label exception.
Initially use it for catalog and related-result projections; the startup
addendum below extends only persisted-state reading. New ingestion and
capture continue to use the stricter `inspectPageUrl`; post-origin links and
Insight context also keep that strict check. Selecting a retained-only Source
to write in its Topic stamps no origin Source ID, preventing a new post from
making the next strict discussion read fail. The UI displays a retained but
now-blocked Source as inert text, not as a navigable link, and does not send
it as ChatGPT source context. This neither deletes nor reprocesses historical
data and grants no new permission or provider egress.

The split prevents later capture-policy tightening from accidentally making
the entire local conversation catalog unreadable. It does not imply that the
historical capture was appropriate. Owner-directed cleanup remains a separate
choice. The shared URL policy now also rejects `code` plus case-varied
`state` query keys as credential-bearing while preserving ordinary product
`code` values. Focused synthetic tests and a read-only check of the actual local
catalog/related projections establish compatibility; independent trust review
and full suite results are recorded in STATUS.

## Startup compatibility addendum (2026-10-04)

The same historical URL can also prevent the service from opening its SQLite
snapshot: persisted learned Sources were rechecked with the *new-capture* URL
policy at startup. Permit the retained-only URL check there as well, only for
already persisted learned Sources. The exact canonical URL and stored
`operationDigest` must still match; this does not change new ingestion. The
shared service-side post-origin boundary now applies the strict new-page URL
policy to learned Sources, so a direct paired API command cannot attach a
retained-only learned Source to a new root or reply. Hand-authored reserved-
domain demo fixtures keep their existing synthetic posting behavior, and
originless posts remain possible. A read-only check of
the owner database found one retained-only Source and no posts or root anchors
using it; no row was deleted, rewritten or migrated. The independent trust
re-review found no remaining blocker in this narrow correction. This is still
not approval to capture that host anew or to release publicly.

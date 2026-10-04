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
Use it only for catalog and related-result projections. New ingestion and
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

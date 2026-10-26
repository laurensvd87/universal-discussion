# ADR-129: One page-independent Search Topics surface

Date: 2026-10-19

Status: implemented in extension 0.13.73; reload the unpacked extension.

The owner requests one "Search Topics" surface under Discover instead of the
combined Explore topics and Explore related pages sections. Discover is global,
independent of the current browser page.

The existing semantic Topic-space panel is the only visible search. It always
requests sourceId:null, so the server does not apply current-page contextual
ranking. Its observation key contains only account/session identity: navigation,
page readiness, Source/Topic changes and page catalog notifications do not clear
the query, results, offset, pending read or owner drafts. Account/session changes,
disconnect and disposal retain their cancellation and owner-authority fences.
The duplicate visible search label, permanent read-only note and separator are
removed; the input retains an accessible Search Topics name.

The canonical discussion reader is composed in preview-only mode. It contributes
no second search, related-page list or background library request. Deliberately
opening a topic still reads the canonical discussion with existing read-only,
safe-link, citation, deletion and version checks. Back restores the global search
and the exact trigger's keyboard focus. Browser navigation does not cancel this
global read-only preview. This does not authorize cross-page posting or Insight.

Discussion-tab related-page suggestions are unchanged. There are no backend,
matching, grouping, threshold, database, account appointment or crawler changes;
no new capture, provider request or post. The separately unfinished global-revision
pagination work is not declared fixed or activated by this presentation change.

Focused regression and actual disposable packaged Chrome verify one search/no
second library input, sourceId:null, page navigation during reads and pagination,
preserved query/drafts, account/session revocation, preview/Back/focus and
420/360/320px layouts without overflow or uncaught exceptions. Final full client
regression passes 1,618/1,618 tests. Secret scan checks258files with0findings;
scoped whitespace check passes. No service restart or runtime seal change.

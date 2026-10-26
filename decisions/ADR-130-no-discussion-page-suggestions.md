# ADR-130: Remove page suggestions from Discussion

Date: 2026-10-19

Status: implemented in client0.13.74; reload extension.

The owner reports that related pages are sometimes too distant and requests no
related-page suggestions in Discussion. Remove the empty-feed page-suggestion
section, its projection, pagination and link-card rendering, rather than merely
hiding populated cards with CSS. Empty and tombstone-only conversations do not
re-enable it; navigation, errors and alternate views cannot restore it.

Existing actual conversations, origin/citation links and developer-only matching
diagnostics remain. There is no change to backend similarity, canonical assignment,
Related metadata, AI context, grouping thresholds or authority. Global Search Topics
remains the sole Discover search (ADR129). This supersedes ADR096's empty Discussion
page suggestions, not its other privacy, history and source proof requirements.

No server/crawler restart, database or policy change, provider request or post.
Focused tests cover absent suggestions across ready/empty/deleted/loading/error
states while retaining conversations, composer and developer diagnostics. Packaged
Chrome checks verify clean empty Discussion at320/360/390/420/480px. Final full
restricted regression passes1616/1616; secret scan258files/0findings and scoped
whitespace check clean. The two fewer tests replace four obsolete suggestion-
visibility tests with two removal/retention regressions; other tests remain.

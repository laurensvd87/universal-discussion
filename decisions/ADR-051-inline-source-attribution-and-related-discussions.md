# ADR-051: Inline Insight sources and separately labeled related discussions

Date: 2026-10-07
Status: implemented for owner-local prototype; no public-release clearance

## Decision

The owner wants useful information from outside the current page, with
clickable superscript source numbers at the claims the model attributes to
those sources. A candidate URL, vector neighbor or provisional Topic link is
not evidence by itself. The model must compare an actually supplied public
excerpt or verified web result to the current page's specific subject before
using it; broad-theme overlap is insufficient. If the subject match is unclear,
the Insight should stay with the current page instead of forcing a contrast.

For bounded related-page excerpts, the model writes a fixed `[[ref:n]]` marker
next to the relevant claim. The number is a 1-based position in the validated
excerpt array supplied to that single request. The service resolves the marker
to the exact selected Source URL; a model-written URL never becomes a link.
Existing provider `url_citation` annotations remain a separate verified-by-
provider route. Only supported, validated markers are formatted as canonical
persistable links, displayed as numbered superscript links in private drafts
and shared posts. A citation identifies the source of a claim, not a guarantee
that the claim is true or that the complete external page was reviewed.

The owner also approved a separate **Related discussions** view. Real/current
Topic conversations stay above; related conversations appear at the bottom,
clearly labeled as related and initially read-only. This projection must not
change Source->Topic links, merge Topics, move roots/replies, imply that
related means identical, or enable a cross-Topic reply with a false origin.

## Boundaries

Use only existing authenticated local catalog/related/discussion reads and the
already-approved public-page excerpt and ChatGPT request. Do not add external
search, fetch attempts, provider calls, new retained page text, permissions,
cross-Topic posting, or remote publication. Existing four-page/2,048-character
excerpt limits, explicit Get insights click, private draft and explicit Share
remain. No owner SQLite migration or production threshold change follows.
OpenAI's documented web-search URL annotations remain visibly clickable; the
custom excerpt marker is our own constrained attribution protocol, not an
OpenAI-provided evidence verification feature.

## Verification

Adversarial marker tests cover valid, repeated, unknown and malformed indexes,
provider web-citation coexistence, completed-stream recovery, combined
50-annotation bounds and inert forged links. DOM tests cover numbered
superscripts, safe navigation and repeated numbers. Related-discussion tests
cover Source/Topic/version coherence, read-only rendering, stale navigation,
and asynchronous loading without delaying the current Topic. Full restricted
extension suite: 973/973. Local-service suite: 238/242, four optional skips.
Both secret scans found zero findings; independent read-only Trust review found
no remaining attribution or cross-Topic publication blocker. Loopback
integration passed 2/2 after the running owner service was briefly stopped;
the same service Origin and durable pairing were restored without resetting
SQLite. No live provider call was used to validate this marker protocol, and
real-page model behavior remains to be checked by the owner after extension
reload.

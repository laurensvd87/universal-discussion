# ADR-050: Keep private Insights through unrelated catalog changes

Date: 2026-10-07
Status: owner-approved local prototype correction; implemented and locally verified

## Context and decision

The owner observed that a generated Insight kept refreshing while browsing and
that sharing often required several clicks. ADR-036 conservatively invalidated
every private Insight when the global catalog revision changed. Automatic page
capture and repeated popup projections can advance or redisplay that revision
without changing the page, Topic, account or conversation the Insight addresses.

The owner explicitly approved retaining an already-started **private** Insight
across unrelated catalog additions, with a fresh context check before explicit
Share. A related-page selection used during generation may be somewhat stale;
the visible Insight is not silently regenerated. The same user action still
starts only one provider request, and Share remains a separate action.

The local service shall bind an Insight to its current Source representation,
Topic, account and, for follow-ups, the target conversation/message. It shall
invalidate the job when that binding changes, including reset/generation,
deletion or reassignment. An unrelated Source/Topic write alone shall not
invalidate it. Share shall use the current catalog revision under the existing
atomic compare-and-swap, check the binding and exact generated body again, and
never publish automatically. The popup shall preserve the private result and
its source links through harmless polls while withholding Share if the fresh
context cannot be verified.

## Boundaries

This supersedes only ADR-036's blanket **catalog-change** invalidation. Its
RAM-only lifetime, actor isolation, timeout, explicit Discard/Share, account
switch/disconnect invalidation and provider/page-data limits remain. No new
page text, provider call, persisted job, permission or publication is approved.
This is an owner-local usability correction, not a public release or store/
legal clearance.

## Verification

Synthetic socket-denied client/service regressions cover unrelated additions,
material context changes and explicit Share. Full extension restricted suite
964/964, service suite 235/239 (four optional skips), loopback integration
2/2 and both secret scans pass. Independent read-only Trust review found no
blocking publication/authorization issue. A same-title vector change may
briefly leave the popup's Share control visible until the service rejects it.
The local service was restarted without resetting pairing or SQLite. Live
Chrome confirmation of the owner's repeated-refresh report remains open; no
provider call was made for this correction.

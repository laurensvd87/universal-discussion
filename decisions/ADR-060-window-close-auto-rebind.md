# ADR-060: Rebind automatic matching after the bound window closes

Date: 2026-10-08. Status: owner-approved; implemented with offline verification.

## Context and owner decision

After a public article showed no Topic, the owner found background matching off
and resumed it; the article was then stored and Topic-linked. The owner does
not recall choosing Stop. The exact cause of that off state is unproven, but
the existing window-scoped lease deliberately calls sticky Stop when its
bound window closes. That can leave matching off in a newly focused window
even though the owner expects the paired public-profile workflow to start
automatically.

On 2026-10-08 the owner explicitly approved automatic matching in the next
focused eligible window of the same separate public browser profile after
the previously bound window closes. This changes the window-close behavior
of ADR-019 B and ADR-025; it does **not** change explicit Stop.

## Exact behavior

- Window closure ends the old lease and invalidates in-flight capture. It
  leaves auto-start eligible, so a later Chrome focus/navigation event may
  create a new lease only after the existing saved pairing, broad HTTPS grant,
  authenticated local-service health, normal non-incognito focused window,
  active eligible tab, site-block and document-attestation checks pass.
- At most one normal window's active tab is captured at a time. Do not scan
  inactive tabs, other still-open windows, history, or sites opened while
  matching was unavailable. Do not add permissions, a background AI call,
  provider egress, or raw page-text retention.
- A deliberate **Stop session** remains sticky for the current browser
  session; reopening the popup, closing a window, or navigation must not
  silently undo it. Removing HTTPS access, unpairing/401 and failed control
  persistence remain fail-closed. Site blocks remain in force.
- This still relies on a separate non-sensitive public browser profile;
  private/authenticated content cannot be detected reliably. It is not a
  store, legal, remote-service, or private-page approval.

## Verification

Test explicit close and missed-close observations, a new eligible focused
window, Stop/close races, grant removal, unpairing, blocked sites, and stale
inference/ingestion. Verify no capture in inactive/other/incognito windows.
Focused session (40/40), background-adapter (107/107) and restricted extension
(1033/1033) tests cover these transitions, including close during block/unblock
storage writes and a missed Chrome close event. The secret scan found zero
issues. Owner
Chrome confirmation of automatic rebind after actual window closure remains
open. An isolated Chrome test must not put a synthetic service on the owner's live
fixed port while their browser is active; it could return 401 to the real
extension. Record actual evidence and any remaining limitation in STATUS.

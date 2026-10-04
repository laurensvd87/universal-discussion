# ADR-036: Resumable private insights and a message-first result

Date: 2026-10-04
Status: owner-requested local prototype change; implemented and locally verified

## Decision

Closing or minimizing the extension popup must not cancel a ChatGPT insight
already accepted by the paired local service. The service may finish the
single user-triggered request while the popup is closed. On reopen, the popup
may rediscover the latest running or completed operation for its synthetic
actor and current Topic/source, then resume polling or show the result. It
must not start a second provider request or automatically publish the result.

The service holds completed private results in RAM for at most 30 minutes,
instead of two minutes. No raw article prefix or result is written to SQLite,
extension storage or a log by this feature. The lookup returns bounded job
metadata only; the existing authenticated result endpoint returns the body.
Share, Discard, service reset/restart, ChatGPT disconnect/account switch,
catalog change or timeout removes or invalidates the result. A popup closed
before the service accepts the request cannot guarantee background completion.
Human unsent discussion drafts remain popup-memory-only.

User Mode shows the insight message and validated inline source icons without
Topic, source URL, prompt or explanatory prose before or after it. Explicit
Share and Discard controls remain visible. Detailed diagnostics and disclosure
remain reachable in Developer/Settings, not on the ordinary result card.
Short activity states are accessible and respect reduced-motion preferences.

## Boundary

The lookup and result are protected by the existing loopback pairing and
synthetic actor checks. Restoration is refused if the current catalog revision,
Topic, source or follow-up target differs. The completed operation still
attests the exact generated body and target at Share. This is owner-local RAM
retention, not a cross-device draft service or approval to archive page text,
publish automatically, process private pages, spend, deploy or submit to stores.

## Verification

The extension and service unit suites, an isolated 13-state Chrome visual
check, and a synthetic Chrome/local-service popup-close/reopen/Share smoke
pass. See `plans/STATUS.md` for counts and scope. A live provider run for this
specific resumption flow remains unverified.

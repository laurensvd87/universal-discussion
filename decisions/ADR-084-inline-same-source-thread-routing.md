# ADR-084: Inline replies to earlier same-Source threads

Date: 2026-10-11.
Status: explicitly owner-approved; implemented and verified in 0.13.44.

## Owner decision

The owner requests earlier discussions opened on the same page to behave like
ordinary discussions in the combined feed, without a separate Open conversation
step. After the lead explained the single-selected-Topic implementation and its
validation boundary, the owner explicitly approved direct human **and sparkle
replies** to these earlier same-page threads, keeping existing context limits
and deliberate-click-only generation.

This narrowly supersedes ADR-080's read-only earlier-thread presentation. It
does not make merely related or foreign experimental projections write targets.
Topic naming remains on hold.

## Routing and trust contract

- Keep the current page's canonical Source/Topic selected. A reply targets its
  original canonical discussion/root/message; no Topic merge, post migration,
  guessed lineage or historical-body rewrite is needed.
- Earlier targets must come from version-consistent canonical discussion reads
  and the validated prior-topic list. The thread opener's origin must be the
  **exact current Source**, not just the reply origin, host or a similar URL.
  Visible root/target and canonical reply lineage remain mandatory.
- Human replies retain the current page's origin link. The backend may accept a
  Source outside the destination Topic only for a reply to a visible canonical
  root whose recorded origin is exactly that Source. New roots and arbitrary
  cross-Topic origins retain their existing restrictions.
- Sparkle requests keep their existing current-page context and anchor. An
  optional `followupTopicId`, only alongside `followupQuestionId`, identifies the
  canonical destination for independent backend validation. Current-page Topic
  binding is not replaced with a caller-selected destination.
- Recheck both page context and destination, including full opener/target body
  digests, account, Source, Topic, reset generation and reply lineage before
  accepting or sharing a result. Exact-body proof and single-use operation intent
  bind the actual destination discussion/root/target. Resumed jobs stay private.
- Preserve the existing 2,000-character selected-message and opener limits,
  4,096-character current-page limit, up to five eligible related links,
  exclusions, research preference, hosted reply discovery and citation checks.
  No full thread history or unsent draft text is sent.
- Reveal confirmed new replies at their original inline location. Maintain one
  real composer, caret/IME/focus stability, detached-draft handling and manual
  collapse through refresh. Presentation IDs never authorize writes.
- Historical edit/withdraw controls are not added by this reply-only change.

## Unchanged gates

No provider retry, extra agent inference budget, automatic generation, new data
retention, browser permission, model, schema migration, crawler, remote hosting,
publication, spending or store clearance follows. Offline synthetic provider
adapters and disposable browser fixtures suffice for this verification. The
exhausted live agent diagnostic budget remains exhausted.

## Required verification

Exercise human and generated root/nested historical replies, current-page
selection preservation, exact page links, single-use proof, refresh/reveal and
SQLite reopen. Reject unrelated Sources, reply-only origin matches, foreign
projections, stale/reset generations, removed Sources, withdrawn roots/targets,
edited full-message context, forged destinations/proofs and duplicate sharing.
Run existing canonical reply/Insight and UI focus/layout regressions, independent
Trust review, secret scans and disposable actual-Chrome checks before completion.

## Verification and handoff

Sol Medium backend/controller/UI implementation and independent Trust review
pass. Full service: **410 pass, four optional skips**. Extension: **1,136 pass,
one optional skip**; restricted: **1,137 pass**. Focused panel: **85 pass**.

Real in-process controller/service/runtime tests verify nested historical human
and deliberate generated replies, unchanged current-page selection, preserved
original destinations/current-page links, historical created-post cues and
private recovery. Independent SQLite reopen/adversarial tests check persistence,
forged destinations/bodies, duplicate sharing, reply-only origins, withdrawals,
Source removal, edited full context beyond the provider prefix, account changes
and real reset generations. Existing canonical reply/Insight behavior remains.

Disposable actual Chrome verifies direct nested same-page actions/editor,
per-character typing and same-context refresh, inline sparkle progress, and real
controller human/generated routing with ancestor unfolding/one-time focus and
no Topic switch. Independent review found a late-arrival rendering gap when an
alternate projection already contained the root. Canonical historical reads now
supersede duplicate projections and the render signature includes displayed
roots/routes; alternate-first then canonical arrival keeps one actionable card.
Keyboard/caret/IME, later collapse, citations, deleted trees, bottom dock, zoom,
320/390 px and reduced-motion regressions pass. Root reviews screenshots.

This companion Chrome surface is shared layout/interaction evidence, not a new
native-panel authentication proof or live-provider answer-quality test. Early
CDP typing before the browser painted a newly moved editor produced a native
caret artifact before the panel's input handler. Settling two animation frames
preserves the exact character assertion; no speculative production workaround
is retained. No actual provider inference was made.

Secret scans (service 626, extension 192 files) find zero issues and diff checks
pass. No owner post migration or schema change. After checking both actors had
no running/completed pending Insight, the normal service is restarted with the
same Origin/pairing/protected login/SQLite and raw debug off. Unauthenticated
catalog 401 confirms listener availability only. Reload extension 0.13.44;
diagnostic inference budget and later gates remain unchanged.

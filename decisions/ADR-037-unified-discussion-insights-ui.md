# ADR-037: Insights belong in the Discussion view

Status: accepted for the owner-local UI, 2026-10-04.

The owner wants the product to feel like one conversation, not separate
Discussion and Insights workspaces. User Mode therefore has Discussion and
Pages navigation. Its comment composer offers a small explicit Insight action;
the resulting private message and Share/Discard controls appear immediately
below the composer. The composer remains above long conversations. Account,
model, source and related-page controls move behind Settings. Developer Mode
retains the detailed workspace and diagnostics.

This is presentation only. An Insight click may initiate the already approved
single public-page ChatGPT request. Navigation, opening Settings, writing text,
and reopening the popup do not initiate a provider call. Share remains a
separate, exact-body, user-invoked operation; no generated post is published
automatically. Existing data, permissions, retention and trust gates are
unchanged. The User UI drops repetitive prototype wording, while Settings and
documentation retain material limitations and the local-profile disclosure.

Evidence: popup unit tests, isolated Chrome visual/keyboard checks and the
synthetic Chrome/local-service discussion-to-insight-to-share smoke are recorded
in [STATUS](../plans/STATUS.md). This does not establish live provider quality,
store approval or permission to handle private pages.

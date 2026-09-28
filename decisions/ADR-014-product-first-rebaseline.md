# ADR-014: Product-first rebaseline and bounded engineering autonomy

Status: Adopted for planning and reversible local implementation under the
owner's 2026-09-27 reassessment instruction, continued on 2026-09-28. External
and expanded data boundaries remain unapproved.

Date: 2026-09-28

Owners: Lead/Product, Platform/Client, Semantic, Trust/Privacy/Policy, Quality

## Context and authority

The owner asks for a usable browser extension, followed by Android/iOS, joining
equivalent semantic Topics across sources, with useful and affordable AI
participation. They explicitly request critical corrections and engineering
autonomy rather than deciding every step. The code audit shows a sound narrow
offline baseline but no writable discussion or semantic matcher. The accumulated
review machinery and a thirteen-point P1.7 questionnaire delay product learning.

The latest direction authorizes reassessment, corrections, and ordinary local
implementation. It does not approve new real browsing-data collection, providers,
deployment, spending, or public posting. Research evidence is in
`research/PRODUCT_RESET_2026-09-27.md` and
`research/PRODUCT_RESET_POLICY_2026-09-27.md`.

## Decision

1. Replace the active critical path with R0–R7 in `plans/ROADMAP.md`. Preserve
   the old roadmap/status as history. Completed scoped evidence stays completed;
   the owner's synthetic 6/6 review is never repeated.
2. Build a usable local discussion before extending review machinery. Opening
   the extension loads the approved current context automatically, then shows
   Topic choices and roots/replies. Distinguish plans from implemented features.
3. Choose reversible local defaults without another owner interview: browser-
   neutral JavaScript ES modules, validated contracts, Node's existing tests,
   English message keys, and a replaceable repository adapter. Use IndexedDB
   for demo persistence; no sync or new storage permission. Frozen resolver/
   evaluator remain baselines, not the production database. No cloud commitment.
4. The first local store contains synthetic identities/Topics and deliberately
   entered demo contributions/drafts only. Save no observed page URLs, metadata,
   bodies or browsing log. Require demo-only warnings and reset/delete controls.
   The synthetic actor selector is a test harness, not secure authentication or
   confidentiality from the device owner.
5. Separate Source identity, semantic suggestions, confirmed associations and
   global corrections. Embeddings retrieve candidates; they do not prove Topic
   equality. Preserve content-identity query parameters. Subject/event, content
   kind and model version matter; publication age is not a universal cutoff.
   No new automatic semantic joining is approved.
6. No crawler or per-site API is a prerequisite. Prefer permitted observed or
   explicitly contributed descriptors and reusable Source-to-Topic links.
   Capture failure still permits manually finding a Topic. General page capture
   is a later exact approval; the current two-route reader is not widened here.
7. Provide browser-buddy value through private drafts and user-curated public
   insights. First build local import/preview with fixtures; later use deliberate
   manual handoff or supported AI-host connectors. Consumer subscriptions are
   not general API credentials. Never extract cookies, impersonate native clients
   or automatically publish output.
8. Correct the no-user-block rule: planned mobile public UGC needs personal
   abusive-user blocking alongside reports and moderator bans. Add reporting of
   offensive generated output, including a user-selected private excerpt, without
   blanket moderator access. Mute/notification features are not implied.
9. Preserve provenance, contribution deletion, private/public separation and
   correction integrity. Implement lifecycle controls with the features that need
   them. Hosted restore orchestration and production auth are not prerequisites
   for a network-denied demo editor.
10. Mobile starts with Android sharing and iOS sharing/Safari integration,
    reusing common contracts. An optional in-app WebView cannot observe arbitrary
    other apps or inherit all browser sessions. Support incomplete shared context.

## Approvals retained, paperwork removed

| Boundary | Decision process |
| --- | --- |
| Local fixture UI/domain/tests, in-scope fixes, code organization, demo-only persistence | Implement and verify within this envelope; no repeated owner gate |
| General page capture/retention, private/body processing, model acquisition/experiment | Present one exact fields/permissions/model/retention package and ask before activation |
| Real service/accounts, browsing-data egress, telemetry or external testers | Explicit security/privacy/owner approval of the actual data flow and scope |
| Real AI/search/auth provider or credentials | Supported mechanism, disclosure, cost/limits and explicit provider/security/privacy approval |
| 200–250-pair provenance-approved review | Stop before acquisition/review; explain provenance, sources, retention and independent-review assignment |
| Spending, deployment, recruitment/publication, store submission, paid/affiliate business | Explicit owner approval before action; local approval is insufficient |

Review changed risks and applicable features. AI review is engineering evidence,
not an independent human label, legal opinion or store acceptance. Do not ask
again for an unchanged approved boundary; record material expansions separately.

## Supersession and preserved constraints

- Supersedes the old P0.2/P1.7 per-module approval sequence and requirement to
  finish every lifecycle detail before local discussion code. ADR-012's original
  owner decisions remain history, with the policy corrections above.
- Extends ADR-009's local-first direction; neither completes nor cancels the
  later semantic-evaluation gate. ADR-004's editorial benchmark is unchanged.
- ADR-010/011 retain the exact implemented browser-capture boundary. ADR-013
  retains the sensitive-body-matching gate. Metadata/local transforms are not
  legal exemptions; even revealing private match existence can be sensitive.
- ADR-003's backend remains a candidate, not selected infrastructure. ADR-005's
  correction integrity remains relevant; local Source choice is not a global merge.

## Acceptance and rollback

R1 demonstrates open -> choose Topic -> post -> reply -> reopen -> delete, with
local demo labeling, AI provenance, inert rendering, keyboard access, no egress
and no captured-context persistence. Later slices supply focused checks. Disable
a feature that cannot meet its boundary without blocking unrelated local work.

Research supports this direction; semantic usefulness, mobile UX, provider
feasibility and community adoption remain unvalidated. Success is a demonstrable
user loop and measured follow-up, not a count of ADRs or generated posts.

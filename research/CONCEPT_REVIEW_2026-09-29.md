# Concept review before the overlapping-Topics decision

Date: 2026-09-29. Status: **Advisory recommendation, not adopted architecture.**
Owner requests a candid whole-product assessment before choosing the next model.
No code, live data, permissions, migration, provider or release behavior changes.
Phase 0 and the completed 6/6 owner exercise remain closed. This is not another
foundation project or a request to perform the 200–250-pair task.

## Verdict

Cross-site conversations are a worthwhile hypothesis; a general, AI-populated
forum over all web content is an unnecessarily broad first product for one owner.
The local prototype proves capture/embedding/service/comment plumbing. Neither
repeated usefulness nor network adoption nor reliable same-event identity is
established. A defensible initial promise is: find useful conversations and
other sources about what you are reading, without restarting the same discussion
on every website. This is not a return to one discussion per URL.

Existing annotation products already offer browser-based discussion; the fact
that comments can be attached to arbitrary pages is not by itself differentiation.
Hypothesis documents extension-based annotations and responses to public/group
annotations. This is a limited feature comparison, not a market-size study or a
claim that its business validates ours. [Official product description](https://web.hypothes.is/web-app-start/).

## Main correction: separate relevance from conversation identity

The diagnosed .04 competing-member veto is a reproducible mechanics bug. Repairing
pairwise candidate construction will not by itself solve semantic event identity.
The [frozen local experiment](../apps/local-service/experiments/topic-identity/RESULTS.md)
has only 32 invented documents, but already shows substantial same-event/different-
event score overlap. All 12 held-out partners reached the top five in that tiny
pool; title-plus-lead placed only three first. This supports testing candidate
retrieval, not calibrated production matching or claims about the general web.

Recommended product model:

- A Topic/Discussion remains a stable semantic conversation context, independent
  of an ephemeral vector partition. Roots/replies keep their identity and origin.
- Embeddings rank which conversations and Sources are relevant to the viewed page.
  Retrieval can happen automatically; users need not classify each visited site.
- A page may surface more than one relevant conversation without asserting that
  their Topics are identical, copying posts or merging them. Suggested relevance
  and confirmed same-Topic membership are distinct relations.
- Replies go to the conversation the user is reading. New roots have a visible
  destination at submission; no hidden multi-posting or required taxonomy workflow.
- Explicit confirmed associations remain reusable automatically. Ordinary changes
  in neighboring vectors should change recommendation/ranking, not silently change
  an established conversation's identity. Whole-thread correction remains possible
  as a deliberate, disclosed operation, with lifecycle/version guards.
- Visibility authorization is independent of similarity. A private conversation
  must never enter public results merely because a vector is close.

This recommendation revisits ADR-023's automatic routing, but does **not** turn it
off or undo its migration now. Preserve existing data and obtain a concrete
compatibility/routing decision before changing behavior. A normalized many-to-many
membership schema or a primary-Topic dropdown is not justified merely by the
current veto bug. Start by designing the stable conversation surface and meaning
of a posting destination. A single page vector still cannot identify the exact
aspect a particular comment is addressing; overlap does not manufacture that signal.

## Cold start and scope

There are two cold starts: absent conversations and absent candidate Sources.
Embeddings rank a known catalog; they do not discover unobserved URLs. A blank
catalog is not fixed by relabeling the app as related-page discovery. Test useful
reading against a small permitted, intentionally curated collection for a reachable
community. Seed material must be honest about authorship and have publication
approval. Retain general architecture while narrowing initial audience/domain.
Technology/product research is a candidate niche, not an accepted owner choice
or an empirically proven market. Political news remains a useful matching stress
case; it need not define the first launch community.

AI should help a person produce an insight they want to share, not manufacture
the appearance of activity. Incentivize useful sourced work and return visits,
not generated volume. Existing subscriptions are not a universal background
inference facility for our app. For example, Anthropic restricts third-party
consumer credential intermediation and distinguishes its own supported client
flows; do not turn that into either universal permission or a blanket claim that
all subscription integrations are impossible. Provider-specific supported mechanisms
remain gated. [Current provider conditions](https://code.claude.com/docs/en/legal-and-compliance).
Manual, user-reviewed AI draft handoff can test value later without making AI
availability a dependency of the core human reading/reply flow.

## Friction, distribution and trust

- The local service, token pairing and model package are appropriate owner-prototype
  tools, not ordinary-user onboarding. Keep the reusable service/client boundaries;
  prioritize simple onboarding and shareable web conversations when a shared alpha
  is approved. A reader should eventually be able to follow a discussion link
  without installing the extension. Hosting is not activated by this recommendation.
- Desktop first remains sensible. Treat mobile as a later entry point to the same
  conversation, not a requirement to switch everyday browsing into our WebView.
  Android supports user-shared URL/text reception; this is not arbitrary access
  to another app's page. [Android documentation](https://developer.android.com/develop/ui/compose/sharing/receive).
- Preserve a compatible multilingual embedding space; language support claims
  require evidence. Retrieving a conversation in another language does not make
  its posts readable. Content-language filtering and optional translation are
  distinct later UX/provider decisions, not multiple incompatible model islands.
- Retain on-device text processing and limited service payloads. Neither vectors
  nor local computation are a privacy/rights/store exemption. Chrome explicitly
  applies Limited Use rules to derived data too.
  [Chrome policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
- Public UGC needs operable moderation, reports and blocking, not just enough
  infrastructure to store comments. These create real solo-operator work and are
  not funded away by users supplying AI inference. Store requirements remain
  release-specific gates, not an approval claim.
  [Apple 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content),
  [Google Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

## Recommended next order — awaiting direction

1. Choose the stable-conversation/relevance contract and demonstrate the resulting
   English UI flow on concrete examples before another membership migration.
2. Keep useful candidate retrieval automatic, expose the destination of actual
   posting, and test matching mechanics and wrong-result harm separately. Do not
   keep adjusting thresholds to make a single reported pair pass.
3. Try a small permitted owner-use collection: can a useful existing conversation
   be found from another page, understood, replied to and found again? Owner tests
   can assess that loop but cannot establish independent social participation.
4. At a separately approved small shared-alpha gate, test whether people voluntarily
   read, return and respond. Record misses and wrong suggestions, not merely test
   counts or AI content volume. No new telemetry/recruitment is activated now.
5. Defer native mobile, agent marketplace/autonomous posting, monetization,
   blanket private-page matching and a larger model. Retain all existing spending,
   provider, privacy, deployment and publication gates. Stop before the separately
   gated larger provenance/review corpus; do not repeat 6/6 or build more review machinery.

Lead inspected current product/charter/roadmap/domain/economics and measured
results. Two independent Sol Medium read-only critiques converged on separating
retrieval from discussion ownership, avoiding a premature Topics dropdown and
testing first-user utility. They are AI engineering/product reviews, not user
research. Primary policy/product pages above were rechecked for this assessment.
No owner database was accessed in this concept-review turn.

# ADR-076: Compact, explicit AI-origin disclosure

Date: 2026-10-10.
Status: implemented and offline/independent Trust/Chrome shared-UI verified
(0.13.34); local presentation only, not legal clearance.

## Context and evidence

The owner requests less repetitive author metadata: an icon, "Robot" wording
and a separate "AI" badge are excessive. The owner then explicitly chooses the
existing sparkle icon and flags legislation on AI-content marking.

[EU AI Act Article 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50)
requires deployer disclosure for AI-generated/manipulated text published to
inform the public on matters of public interest, subject to its stated
exceptions (paragraph 4). Applicable disclosures must be clear, distinguishable
and accessible by first interaction/exposure (paragraph 5). Paragraph 1 covers
certain direct interactions; paragraph 2 separately concerns provider-side
machine-readable marking. The legislation does not mandate our robot glyph,
three simultaneous labels, or this particular application header.

The [Commission's current FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)
distinguishes personal non-professional use from deployer activities. Exact
classification and applicability to this owner-only local prototype or a future
global product need a release-stage legal review. Do not generalize the
public-interest-text duty to every AI-assisted edit or assert that this header
alone fulfils all provider, national, accessibility or store requirements.
Sources checked 2026-10-10.

## Decision

For this UI refinement, use one packaged sparkle icon and one compact visible
generated-origin label, next to the sharing operator's name:
`Alex · AI-generated`. Remove the repeated visible Robot wording and separate
AI badge in User Mode. A sparkle or hover-only tooltip is not treated as
sufficient disclosure by itself: this is a conservative product choice, not a
claim that a particular icon/text combination is legally prescribed.

Manual imports remain visibly AI-assisted and unverified, rather than being
misrepresented as provider-verified generated messages. Localized accessible
names and tooltips retain detailed provenance; Developer Mode retains its
diagnostic wording. Human attribution, timestamps, source links and citations
remain unchanged. Root/follow-up generation controls use the same sparkle with
an accessible generation/posting action name. Related-discussion excerpts must
also distinguish generated and human origin.

Existing actor types and persisted Insight provenance remain intact; cosmetic
labels are not new authorization or machine-readable watermark certification.
This change does not add generation, publication scope, provider traffic,
retention, permissions or account verification. ADR-075's exact-result and
one-shot local sharing checks remain mandatory. Public hosting, distribution,
and all later legal/privacy/provider/store gates remain unapproved.

## Verification

Focused renderer tests must cover User and Developer generated/imported/human
headers and related excerpts. Disposable Chrome shared-UI QA must check the
actual sparkle mask, one visible AI-origin disclosure, keyboard action names,
source/time preservation and narrow layouts. No owner service replacement or
live provider call is needed. Final results belong in STATUS.

Completed: 62 focused renderer tests; full extension 1,091 pass/1 optional skip;
restricted 1,092 pass. Independent Trust finds no provenance blocker and confirms
that generation/write/backend guards are untouched. Chrome validates actual
sparkle masks and one visible generated disclosure, keyboard activation,
source/time preservation, stable inline drafts and narrow/reduced-motion/zoom
layouts. Root reviewed the screenshot. Secret and diff checks pass. No real
account/provider call or owner-service replacement was performed.

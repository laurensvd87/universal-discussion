# ADR-076: Compact, explicit AI-origin disclosure

Date: 2026-10-10.
Status: 0.13.34 verified; explicit owner-local icon-only override implemented
in 0.13.35; local presentation only, not legal clearance.

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

## Initial decision (0.13.34; visible-label choice superseded below)

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

## Explicit owner-local override (0.13.35)

After the compact visible-text implementation, the owner explicitly directs:
"ai sparkle is enough". User Mode therefore uses the sparkle as the sole visible
AI marker beside the operator's name, including related excerpts and reply cues.
The full localized AI-generated/AI-assisted origin remains in accessible labels
and tooltips. Manual imports retain a visible unverified-import qualifier;
Developer diagnostics remain unchanged.

This overrides the earlier visible text design only for the local prototype.
It does not establish that a sparkle is adequate legal disclosure, waive any
mandatory obligation, or authorize public hosting/distribution. Icon-only
recognition by unfamiliar users and disclosure adequacy remain unresolved for
the release-stage legal/accessibility review. That review may require visible
wording or an established marking convention before publication.

Existing actor types and persisted Insight provenance remain intact; cosmetic
labels are not new authorization or machine-readable watermark certification.
This change does not add generation, publication scope, provider traffic,
retention, permissions or account verification. ADR-075's exact-result and
one-shot local sharing checks remain mandatory. Public hosting, distribution,
and all later legal/privacy/provider/store gates remain unapproved.

## Verification of initial visible-label design (0.13.34)

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

## Verified owner-local override (0.13.35)

The expanded renderer suite (67 tests), full extension (1,100 pass/1 skipped)
and capability-denied suite (1,101 pass) pass. Chrome verifies sparkle-only
generated marking, retained operator/source/time, AI-generated accessible
labels/tooltips, labelled keyboard actions and narrow/reduced-motion layouts.
Nested generated parent cues use the operator name without visible AI wording;
imports retain their unverified qualifier and full accessible provenance.
Independent Trust finds no blocking provenance issue. Root reviews screenshots;
secret/diff checks pass. The broader reply scope is separately approved and
verified under ADR-077, not inferred from this cosmetic override.

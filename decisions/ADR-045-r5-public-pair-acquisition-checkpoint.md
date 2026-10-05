# ADR-045: R5 public-pair acquisition checkpoint

Date: 2026-10-05
Status: owner approved bounded local acquisition in principle; exact-source and reviewer prerequisites remain open

## Owner disposition

The owner answered **yes** to assembling a local 200–250-pair review set from
publicly accessible pages. The request specified URL, title, source provenance,
existing-model vectors and human labels, retained locally until manual deletion;
no raw page text, private/authenticated pages, provider calls or publication.
The owner did **not** supply independent human ratings or name a reviewer. The
completed six-pair synthetic owner exercise remains closed.

This is owner permission for the described local public-page acquisition, not
merely permission to write a proposal. The existing collection plan still
requires an exact origin/rights/Trust package before executing it; those
implementation prerequisites are open. The answer is not permission to open
the retained owner database, copy owner browsing history, fetch pages in bulk,
run a provider, publish a benchmark, invent gold labels, freeze a split or
activate a new automatic Topic rule. No real pair has been acquired yet.
This decision supersedes only the older documents' claim that owner
authorization for real acquisition is absent; it does not waive their exact
plan, provenance, pilot, staffing or later scale-up gates.

## Existing R5 constraints

[ADR-004](ADR-004-initial-topic-granularity.md) limits the initial labeled
corpus to English editorial news and an atomic factual development. It can
include opposing reports of that development, but its labels cannot silently
generalize to products, evergreen pages or multilingual subjects. The
[collection plan](../plans/P1_2_COLLECTION_AND_COMPLETION.md) targets 250
prepared candidate pairs across at least 60 acquisition strata, all six case
types and headroom for 200 eligible binary decisions. It requires exact
origins, fields, date range, method, retention, rights evidence, Trust review
and distinct real review roles before real/public metadata collection. Its
generated-only tooling and the 6/6 review are not a substitute.

The owner's broad answer did not settle those exact origins, whether source
titles can be retained under each source's terms, publication-time and
project-written fact-summary fields in ADR-007, or reviewer staffing. These
must be proposed and approved before real acquisition. The first R5 corpus
should therefore test the existing editorial policy; a broader product and
cross-language policy needs a separate versioned decision and evidence.

## Source feasibility, not authorization

[English Wikinews's copyright policy](https://en.wikinews.org/wiki/Wikinews:Copyright)
publishes licensed editorial text with date-dependent terms and page-level
exceptions. It is a plausible *candidate* for a small provenance pilot, but
one neutral outlet cannot validate publisher diversity or opposing viewpoints.
[Global Voices' republishing guidelines](https://globalvoices.org/about/global-voices-attribution-policy/)
identify its own content as CC BY with attribution and exclusions for
third-party media; individual pages still need review. [Voice of America's copyright statement](https://www.voanews.com/p/5338.html)
states that exclusively VOA-produced material is public domain while agency
and other third-party material is not; any candidate page needs authorship
screening. These are possible complementary editorial origins, not a claim
that their coverage overlaps enough to fill the R5 case quotas.
[The European Commission's legal notice](https://commission.europa.eu/legal-notice_en)
licenses EU-owned site content with exclusions; institutional releases are not
equivalent to independent news reports. These policies do not authorize an
automated collection method, settle other publishers' rights, or establish
app-store/legal clearance. No articles, titles or vectors from any of these sources
were retained for this task.

## Proposed first pilot package (awaiting exact disposition)

- Up to 24 public English editorial article pages, published 2020–2026,
  selected one by one from exactly `en.wikinews.org`, `globalvoices.org` and
  `www.voanews.com`; target up to 30 *candidate* pairs, not gold labels.
  Stop and revise rather than fill quotas with unrelated or one-outlet cases.
- Per-origin preliminary title-rights basis: Wikinews's dated CC BY policy;
  Global Voices' CC BY attribution/republication guidance; and original
  VOA-produced text under VOA's public-domain statement. Store source URL,
  publisher attribution URL and license/evidence link with each title; do not
  retain personal author profiles.
  Reject a page with an overriding notice, unclear ownership, agency byline
  or third-party title instead of assuming the site-wide policy covers it.
  This is a proposed rights screen, not legal clearance or Trust approval.
- No account, private URL, comments, image, video or third-party wire copy.
  Each selected page needs its own rights/attribution and publication-time
  check. Discovery is manual source/archive navigation, not a crawler or
  search-product integration. These origins make ordinary web requests.
- Use the current local production capture and embedding versions rather than
  a new parser/model: `main-text-prefix/v1` or
  `article-container-prefix/v1` rendered-region reader, at most 4,096
  characters, `query:`-prefixed E5 input truncated to 512 tokens, packaged
  `e5-small-q8-browser-main-prefix-v1` (384 dimensions). Record which
  extractor and model revision produced each vector; abstain on a page the
  production reader cannot qualify. No model download or service ingestion.
- Retain only canonical public URL, exact title if page rights permit it,
  publication time, English language, publisher, access time, rights-evidence
  URL and disposition, opaque Source/pair IDs, capture/preprocessing version,
  bounded input digest and one existing-model 384-dimensional vector. The
  rendered article prefix is processed transiently on-device and not stored.
  A one- or two-sentence project-written factual summary would help blind
  reviewers distinguish updates, but it is an **additional field awaiting
  owner approval**; no summary is retained by this decision.
- Place records only in the existing Git-ignored local review workspace,
  `spikes/topic-resolution/review/work/`, not in the production database or
  Git. Retain until manual deletion under the owner's approved rule. Record
  a local inventory digest and reject pages with unclear provenance. No AI,
  external embedding provider, account session or publication.

Even this pilot waits for the exact Owner/Trust disposition and the review-role
staffing required by the existing plan. Its results cannot by themselves
authorize scale-up to 250 candidates, a held-out split or AUTO matching.
Because the owner is currently working alone, a practical amendment could
permit the provenance pilot after Owner/Trust source approval while deferring
named independent reviewers until before human labeling. This would change
the existing plan's order and is **not approved** here; the owner must decide
it explicitly. It would not relax independent review for a completed corpus.

## Next owner assignment and stops

Before collecting real pairs, present a concrete small origin/domain allowlist,
English-news date range, exact fields and on-device embedding method, local
untracked storage/deletion rule and per-origin rights/terms evidence to Owner
and Trust for explicit disposition. Do not retain article bodies or reviewer
access to private pages. Reuse the existing review ledger; do not invent labels
from source proximity or AI output.
After a small provenance-reviewed pilot, scale-up to the full set still needs
the collection plan's separate owner/Trust disposition.

The solo owner needs independent people for the review roles required by the
existing plan. A bounded first assignment is to recruit **one independent
reader** willing to blindly rate at least the precommitted secondary-review
sample (initially 30% of prepared pairs, about 75 judgments) as same Topic,
different Topic or uncertain, using approved public URL/title/publication-time
and project-written factual summaries plus the rubric, without model scores
or construction labels. Retaining summaries is **not yet approved** under the
owner's no-raw-text scope and needs explicit field disposition. This person
cannot be a renamed synthetic actor. Adjudication and provenance-review staffing must also be
resolved before a completed real R5 corpus can be claimed; if unavailable,
the outcome stays an owner-local exploratory set, not validated AUTO.

No held-out split or threshold selection may use these ratings before the
completion receipt and its separate owner/Trust/Quality checkpoint. No
real-page quality or provider/store conclusion follows from this ADR.

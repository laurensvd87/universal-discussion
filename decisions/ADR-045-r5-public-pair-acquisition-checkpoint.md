# ADR-045: R5 public-pair acquisition checkpoint

Date: 2026-10-05
Status: owner approved exact local pilot; Trust accepted isolated capture; six local Source records acquired, no labels; owner-only review superseded by ADR-046

## Owner disposition

The owner answered **yes** to assembling a local 200–250-pair review set from
publicly accessible pages. The request specified URL, title, source provenance,
existing-model vectors and human labels, retained locally until manual deletion;
no raw page text, private/authenticated pages, provider calls or publication.
The owner did **not** supply independent human ratings or name a reviewer. The
completed six-pair synthetic owner exercise remains closed.

This is owner permission for the described local public-page acquisition, not
merely permission to write a proposal. The existing collection plan still
required an exact origin/rights/Trust package before executing it; those
implementation prerequisites were resolved for the bounded pilot below.
The answer is not permission to open
the retained owner database, copy owner browsing history, fetch pages in bulk,
run a provider, publish a benchmark, invent gold labels, freeze a split or
activate a new automatic Topic rule. At that initial checkpoint no real
pair had been acquired; the later three-page pilot is recorded below.
This decision supersedes only the older documents' claim that owner
authorization for real acquisition is absent; it does not waive their exact
plan, provenance, pilot, staffing or later scale-up gates.

On 2026-10-05 the owner explicitly answered **yes** to all three follow-up
questions: the exact three-origin pilot below, retention of a short
project-written factual summary, and deferral of independent reviewer names
until *before labeling* rather than before pilot acquisition. Trust gave
conditional acceptance for this pilot after requiring isolated capture and
page-level provenance evidence. The full 200–250-pair scale-up, split,
review-completion and AUTO gates remain separate.

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

The initial broad answer did not settle exact origins and fields. The owner's
second answer approves the pilot specifics below and the summary field, but
each page's title rights and provenance still need acceptance or rejection
before retention. The first R5 corpus
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

## Approved first pilot package (conditional Trust disposition)

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
  This is a bounded rights screen, not legal or store clearance.
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
  A one- or two-sentence original factual summary is approved as a retained
  field. Leave it blank at acquisition; an authorized human may later write
  it locally from the public page with author/time/provenance recorded. This
  decision does not authorize sending article text to an AI provider for
  drafting. No quotes or copied body passages belong in the summary.
- Place records only in the existing Git-ignored local review workspace,
  `spikes/topic-resolution/review/work/`, not in the production database or
  Git. Retain until manual deletion under the owner's approved rule. Record
  a local inventory digest and reject pages with unclear provenance. No AI,
  external embedding provider, account session or publication.

Operational Trust conditions before the first candidate is saved: run the
production reader and packaged E5 in an isolated capture process which cannot
write the live Source/Topic database. Do not use the extension's auto-ingest
session for this pilot. Keep raw rendered text out of `web.run`, model context,
prompts, logs, files and external services. Retain per-page rights-evidence
URL, evidence capture time and digest, metadata origin, title-rights decision,
publication time, publisher/originality check and an accepted/rejected reason.
Reject ambiguous VOA agency/third-party content and overriding notices.
The collector must not expand a supplied URL into a crawl or follow an
unreviewed redirect.

The owner approved deferring named independent reviewers until before human
labeling; this narrowly supersedes the existing plan's pre-acquisition staffing
order for this pilot only. It does not relax independent review for a completed
corpus. The pilot's results cannot by themselves authorize scale-up to 250
candidates, a held-out split or AUTO matching.

## First capture checkpoint (2026-10-05)

The isolated [R5 pilot harness](../apps/local-service/experiments/r5-pilot/README.md)
passed 10 synthetic socket-denied checks and two actual-Chrome local-fixture
checks, including packaged reader/E5 inference, a blocked subresource and a
blocked redirect. Trust then accepted a one-page real capture subject to
truthful page-level evidence. After checking the applicable publisher notices
and each page's title, date and authorship indicators, the operator saved one
public article each from Wikinews, Global Voices and original VOA reporting
in the Git-ignored review workspace. Wikinews exposes a date, not an exact
time; its record explicitly uses `day` precision. No raw article body,
summary, reviewer label or live Source/Topic database entry was retained.

The three possible cross-publisher pairs remain **unlabeled candidates**.
Existing 384-vector cosine scores are 0.9099 (Global Voices/Wikinews),
0.9042 (Global Voices/VOA), and 0.8907 (VOA/Wikinews). These scores are not
gold Topic identity or threshold calibration. The records and inventory digest
are local only; no real article metadata or vector is committed to Git.

The same page-level screen then added a second three-page theme: Wikinews and
original VOA reports about the WHO pandemic declaration, plus a Global Voices
report about African responses to the pandemic. The ignored inventory now
contains six accepted Sources and no rejections. Their 15 possible pairs are
not a prepared review task or human labels. The two WHO-declaration vectors
score 0.9156 despite a three-day publication-date difference; the VOA WHO
report versus the broader African-response report scores 0.9010. These are
descriptive unlabelled observations only and do not authorize a new threshold.

## Next owner assignment and stops

[ADR-046](ADR-046-owner-only-exploratory-r5-review.md) subsequently removes
the independent-person prerequisite for **owner-only exploratory PoC ratings**.
The historical independent-review assignment below applies only to a later
independently validated corpus claim, not to that owner-only path. Do not ask
the owner to recruit someone merely to try the local pilot.

The above exact pilot package has owner approval and Trust acceptance for
the isolated capture path; keep applying per-page provenance controls to any
further candidate. Do not retain article bodies or reviewer access to private
pages. Reuse the existing review ledger; do not invent labels from source
proximity or AI output.
After a small provenance-reviewed pilot, scale-up to the full set still needs
the collection plan's separate owner/Trust disposition.

The solo owner needs independent people for the review roles required by the
existing plan. A bounded first assignment is to recruit **one independent
reader** willing to blindly rate at least the precommitted secondary-review
sample (initially 30% of prepared pairs, about 75 judgments) as same Topic,
different Topic or uncertain, using approved public URL/title/publication-time
and project-written factual summaries plus the rubric, without model scores
or construction labels. The short original summary field is approved for
later human authorship, not AI/provider generation. This person
cannot be a renamed synthetic actor. Adjudication and provenance-review staffing must also be
resolved before a completed real R5 corpus can be claimed; if unavailable,
the outcome stays an owner-local exploratory set, not validated AUTO.

No held-out split or threshold selection may use these ratings before the
completion receipt and its separate owner/Trust/Quality checkpoint. No
real-page quality or provider/store conclusion follows from this ADR.

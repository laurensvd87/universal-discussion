# Candidate path to a rights-reviewed event benchmark

Date: 2026-10-09. **Research proposal only. No acquisition, provider upload,
model training for product use, or publication is approved by this note.**

The latest local checks show a repeated pattern: true-event neighbors are
retrieved near the top, but synthetic-only admission rules transfer poorly
to real articles. A tiny diagonal adapter trained only in RAM on GlobeSumm
raised correct pair admissions on its reused validation from 35/803 to
126/803 with no observed false join, yet completed 0/13 events; its
calibration had no eligible negative candidate. That is a useful research
signal, not a shippable Topic model. The test is too small, reused, and lacks
publisher/viewpoint gold. More synthetically generated paraphrases alone
would not resolve that evidence gap.

## Low-cost candidate sources, not blanket permissions

- EU institutional texts could provide the same event described in multiple
  languages. The [Commission's language policy](https://commission.europa.eu/about/service-standards-and-principles/commissions-use-languages_en)
  describes English/French/German press availability. A [Commission-site
  copyright notice](https://ai-act-service-desk.ec.europa.eu/en/copyright-notice)
  uses CC BY 4.0 for eligible content, but does not clear every Commission
  page or third-party item. The [Council notice](https://www.consilium.europa.eu/en/about-site/copyright/)
  and [Parliament legal notice](https://www.europarl.europa.eu/legal-notice/en)
  set their own reuse conditions and exceptions. Item-level source ownership,
  dates, attribution and permitted collection still need review.
- [Global Voices' attribution policy](https://globalvoices.org/about/global-voices-attribution-policy/)
  permits reuse/adaptation of its own CC BY text with attribution and an
  original link, while excluding third-party media and other separately
  licensed material. Its multilingual coverage is promising but same-event
  overlap and independent-perspective yield are unmeasured.
- The already approved private [Wikinews research corpus](../decisions/ADR-066-wikinews-multilingual-research-gate.md)
  gives cross-language same-event examples, but language editions of a
  common article do not establish independent publisher or opposing-view
  matching. Wikinews' [copyright guidance](https://en.wikinews.org/wiki/Wikinews:Copyright)
  requires date/edition-aware attribution and license checks.

The [Creative Commons AI-training guidance](https://creativecommons.org/using-cc-licensed-works-for-ai-training-2/)
does not eliminate questions about underlying rights, attribution,
third-party passages, personal data, output weights or distribution.
These source notices are leads for review, **not legal clearance**. A
training pipeline may need source-specific acquisition rules, but the app's
runtime would not need per-website APIs. Avoid bundling article text in an
extension; whether trained weights can be shipped requires separate review.

## Proposed bounded next gate

Before collecting any new real text, ask the owner to approve a concrete
research scope: exact source classes/domains, maximum records, local storage
location and retention, a per-item license/provenance ledger, and whether
any article text may be sent to an AI labeling provider. A useful pilot would
curate roughly 50 event families and 200–250 contrasting same-event versus
neighboring-event pairs, split by entire event and publisher, with explicit
viewpoint/language labels where evidence permits. This intentionally touches
the roadmap's provenance-approved 200–250-pair review gate; it must **stop
for owner approval** before collection/labeling. If independent human review
is not available, record that limitation rather than silently calling LLM
labels ground truth. Do not repeat the completed 6/6 synthetic owner review.

Before any product model or extension/mobile distribution, Trust must review
rights/attribution, collection terms, privacy/retention, model-weight
distribution, input/model size, and the separate ADR-064 live matching and
Source-root migration gate. No new live vector or capture scope is implied.

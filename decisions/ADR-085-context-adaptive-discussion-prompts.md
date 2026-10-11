# ADR-085: Context-adaptive discussion prompts and explicit research

Date: 2026-10-11.
Status: implemented, independently reviewed and offline verified; normal backend restarted.

## Owner request

After a read-only diagnosis of weak product-price replies, the owner requests a
carefully designed shared prompt and its implementation. Replies should feel
natural in a discussion, use current-page and same-topic/related material well,
consider source dates, synthesize or compare when appropriate, and research
missing information when the request needs it. Coding uses GPT-6.1 Sol.

This authorizes the prompt/policy implementation within the existing deliberate
request scope, not a new live diagnostic inference budget. The previously
proposed three diagnostic requests have not been approved.

## Design

- Put ordered, static instructions in the trusted provider `instructions` field,
  not after untrusted page or comment text. Keep factual inputs in validated
  JSON. Select only the established opener/reply and research-on/off branches.
- Start with the actual question or one useful observation. Prefer concise,
  natural prose over a recap, report, generic introduction or forced rhetorical
  question. Internally choose explanation, synthesis, comparison, recommendation,
  research or clarification from the request; do not expose a mode or reasoning log.
- Opening posts prioritize one supported addition/difference from selected
  same-subject candidates. Different viewpoints can concern the same subject;
  different framing is not automatically a factual contradiction. Candidate
  titles/vector grouping are leads, not evidence or independent corroboration.
- The current extract remains partial. Do not assert that the full article omits
  something. Use publication, update and event dates only when present in supplied
  text or obtained from sources; capture time or a URL year is not a publication
  date. No new metadata extraction, retained dates, full history or provider field.
- Replies answer the selected message using the bounded thread opener, including
  short follow-ups. When research is enabled, explicit online-research or concrete
  shopping/price requests must not merely return search advice. A conservative
  local policy over the validated published target/opener requires the existing
  hosted search tool for recognized explicit requests; other replies remain auto.
  The heuristic is not a semantic or comprehensive multilingual classifier.
- Research-off overrides every request phrase: no tool or extra lookup. Opening
  Insights still research only selected exact URLs, not general discovery.
  Broad discovery remains limited to deliberate, canonical validated replies.
- Required-search requests must carry consistent completed search evidence before
  an answer can be accepted, including the existing strict completed-stream
  fallback. No minimum outside citation is imposed: a completed search can find
  no usable comparable source. This is tool-use evidence, not truth verification.
- Compare actual matching variants, conditions, availability and fees. If delivery
  country is missing, research useful matching offers when possible, label the
  unresolved shipping conditions, and ask for the country if needed before naming
  a delivered-price winner. Do not infer location from a domain or browser.
- Preserve selected `[refN]` mappings, provider-annotated native citations for
  discovered destinations, safe URL/span/identity/exclusion checks and the five
  distinct-source ceiling. Never invent a merchant link or silently backfill an
  uncited historical post. Citations continue to render as superscript arrows.

## Unchanged authority and gates

No new context beyond 2,000-character opener/target, 4,096-character current
extract and five selected related links; no immediate-parent/history expansion.
Current Source/Topic/account and canonical destination attestations, full-body
edit invalidation, exact-body one-use sharing and private recovery remain.
No automatic generation, request retry, background search, crawler, provider
change, purchases, logging expansion, raw-text retention, hosting or release.

## Evidence and required verification

The previous diagnosis cannot reconstruct the actual failed request: its raw and
structural traces are absent. Do not claim an exact replay or that search never
ran. Existing synthetic adapter/prompt checks passed (87 tests).

Verify explicit/implicit shopping follow-ups, ordinary explanation, negated
requests and acknowledgements, research-off hostile input, publisher text that
tries to select policy, selected-only openers, valid search with no outside
evidence, missing/contradictory completed search, strict fallback, safe citations
and existing one-shot sharing/identity regressions. Independent Trust review,
full capability-denied tests, secret scans and diff checks are required.
Prompt-contract tests cannot establish live model quality or reliable prices.

Official OpenAI Docs informs instruction/data separation and actual tool choice,
not additional application authority:
[prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering),
[web search](https://developers.openai.com/api/docs/guides/tools-web-search).

## Completed verification

GPT-6.1 Sol Medium coding and independent Trust review pass. The review catches
quoted and negated research false positives; the bounded policy now handles
those tested cases without treating acknowledgements or page/title text as
required research. It is intentionally a conservative lexical aid, not complete
multilingual intent understanding. Unsupported wording still uses auto, while
the static reply prompt instructs research when the actual question needs it.

Prompt review distinguishes alternative-product tradeoffs from equivalent-offer
price ranking, material date uncertainty from automatic disclaimers, and an
affirmative research request from quoted/negative wording. All four mode branches
remain coherent; research-off contains no permission or citation syntax.

Focused independent combined tests: **106 pass**. Final full service: **429 pass,
four optional skips**. Full extension: **1,136 pass, one optional skip**;
capability-denied extension: **1,137 pass**. Existing canonical/historical reply
proof, full-body edit, SQLite, routing and private-recovery regressions pass.
Secret scans (service 629 files, extension 192 files) find zero issues; diff
checks pass. No UI code or packaged extension version change, new provider
request, owner data migration, retained date field or live-quality claim.

Before restart, the verified normal project service has no running/completed
pending Insight for either actor. The same Origin/pairing/protected login/SQLite
service is restarted with raw debug off. Existing Chrome 0.13.44 need not reload.
No extra live diagnostic budget is inferred; deliberate owner app clicks remain
authorized under their existing scope.

## Subsequent metadata approval

The owner subsequently suggests IP location and Chrome language as possible
context. No new metadata has been collected or sent. A separate explicit question
proposes local optional UI-language/preferred-response-language and user-chosen
delivery-country/currency settings, sending only these fields on deliberate
requests, with no IP lookup, precise location or browser history. The owner
explicitly approves this narrow package in ADR-086. Language must never silently
become shipping destination, source publication date or verified personal location.

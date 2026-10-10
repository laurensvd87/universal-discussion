# ADR-078: Deliberate reply web discovery

Date: 2026-10-10.
Status: explicitly owner-approved; implemented, offline and synthetic-Chrome
verified in 0.13.36; normal service restarted. Owner live search quality pending.

## Owner decision

The owner asks whether a product-price reply can look beyond catalog listings.
After the lead explains the existing exact-related-URL restriction, the owner
answers "ok" to this explicit package: deliberate sparkle replies may use
ChatGPT-hosted search beyond our catalog, using the existing bounded page/comment
context and derived search terms, consuming plan usage and returning at most
five cited public sources. No browser cookies/login sharing, purchases,
background searches or automatic retries. Completed replies retain the already
approved immediate local posting behavior.

This supersedes only ADR-054/ADR-059's selected-URL restriction for a validated
ADR-077 reply with the research preference enabled. Ordinary opening Insights
remain restricted to their selected related pages. No new provider, permission,
model, crawler, remote publication or store-release approval is implied.

## Implementation contract

- The service resolves the selected message and thread opener from canonical
  state before selecting reply research. A client cannot authorize discovery by
  supplying a research-mode string, arbitrary comment text or a foreign target.
- Input limits stay at 2,000 characters each for the published target/opener,
  4,096 for the current page, and up to five selected related titles/URLs. No full
  history, unsent drafts, geolocation or extra account/profile data is sent.
- A deliberate reply may enable hosted `web_search` even with no catalog
  candidates. The provider can derive queries and consult public sources beyond
  candidate domains when needed to answer the selected message. It need not
  search for a reply answerable from supplied context. The existing research
  preference disables both discovery and candidate research when switched off.
- Only provider `url_citation` annotations in a fully completed assistant result,
  together with a consistent completed search call, can authorize newly discovered
  destinations. Model-written URLs/ref numbers cannot invent destinations.
  Existing selected `[refN]` hints remain confined to server-selected URLs.
  Enforce safe public HTTPS URLs, valid text spans, at most five distinct cited
  destinations, and reject known excluded URLs. A provider citation is not proof
  that the entire publisher page was read or a claim is true.
- Per-source exclusions remove catalog candidates and forbid those exact
  destinations in accepted output; they cannot promise the hosted search engine
  never encounters that page. No excluded URL is added to provider context.
  Disable research entirely to avoid external lookup.
- Search results are not fetched by the extension/service, embedded or added to
  the catalog. Accepted citation links persist only as part of the deliberately
  posted contribution under existing deletion rules. No new raw logs or retained
  page text. Existing explicit debug mode is unchanged.
- Price answers must distinguish exact product/variant, condition, currency,
  region, availability and delivery/total cost. Ask for missing delivery country
  rather than infer it from the browser; say "lowest found" rather than claim a
  universal cheapest offer. No checkout, account use or purchasing.
- Preserve completed-stream identity/refusal/failure checks, canonical page/
  Source/Topic/account/target binding, full-message edit invalidation, exact-result
  proof, current revision CAS and one-use sharing. Resumed jobs remain private.

The five-source limit bounds accepted citations, not the provider's number of
searches or retrieved pages. Official OpenAI documentation describes hosted
search output annotations and clickable citations; Sign in with ChatGPT requires
`store: false`, `stream: true`, bounded stateless input, and does not support
`max_tool_calls`. Search availability still depends on model/account policy.
Checked using OpenAI Docs:
[web search](https://developers.openai.com/api/docs/guides/tools-web-search),
[preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Verification required

Injected-provider tests cover discovery without catalog candidates, public
off-catalog annotations, more than five unique destinations, unsafe/unannotated
URLs, invalid spans, exclusions, no completed search, incomplete/failure/refusal
and strict completed-stream fallback. Existing opener restrictions stay tested.
Controller tests cover on/off preference and target-only deliberate dispatch;
service tests cover authoritative targets, bounded input, stale context and
exact one-use sharing. Independent Trust review and ordinary full regressions
must pass. Synthetic Chrome QA may validate citation rendering without owner
credentials or provider calls. No new live inference is authorized by this
implementation checkpoint; do not claim live price-search quality from fixtures.

## Completed verification

Sol Medium coding slices pass independent Trust review. The review catches and
verifies fixes for selected references without search and observed response/
search item contradictions in ordinary final output. Strict completed-stream
fallback stays supported, without accepting deltas, refusal or incomplete data.
Final focused Trust service checks: 117 pass/1 platform skip; focused client:
102 pass. Full service: 384 pass/4 optional skips; extension: 1,102 pass/1 optional
skip, capability-denied extension: 1,103 pass.

Disposable actual Chrome shared-UI QA validates safe clickable superscript arrows
in a private result and posted nested reply, no false no-outside-source cue,
typing/nesting/keyboard and 320–480 px/reduced-motion/zoom/no-overflow regressions.
Root visually reviews the 390/320 px screenshots. No owner provider request or
credentials are used by QA; provider starts remain zero. Secret scans and diff
checks pass. Explicit debug's exact-key whitelist now allows only optional
auto|required tool choice under its unchanged bounds and credential rejection.

The verified normal project backend is restarted with existing Origin/pairing/
protected login/SQLite and raw debug off; unauthenticated catalog returns 401.
The owner must reload the extension and deliberately try a reply for live quality.
No claim is made that provider annotations prove the cheapest price, factual
accuracy or full-page reading; no broader release gate is cleared.

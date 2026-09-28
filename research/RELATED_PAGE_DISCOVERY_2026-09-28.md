# Affordable related-page discovery

Researched: 2026-09-28. Primary public documentation only; no account, API key,
paid request, live-page acquisition, search integration or model download.
Decision: [ADR-015](../decisions/ADR-015-related-pages-first-utility.md).
Prices and terms must be rechecked before choosing an actual plan.

## Recommendation

Offer useful related pages even with zero discussion posts. Start with a small,
independently permitted catalog and local ranking, then add an explicit discovery
fallback when coverage is poor. Keep the candidate source replaceable. Finding
new URLs and deciding semantic similarity are different jobs; embeddings only
solve the second over candidates we already have. No free whole-web semantic
index is assumed. The catalog itself needs a credible cold-start acquisition path.

| Route | App-side marginal search cost | Tradeoff |
| --- | --- | --- |
| Known permitted Sources + local embedding/ranking | No paid search request or hosted inference required per lookup | Limited coverage; model distribution, device work and any shared hosting still cost |
| User-reviewed query opens normal search | No search API billed to this app | Leaves the app; no automatic in-app result ingestion |
| Search API supplies candidates on demand | Metered, see examples below | Better coverage and integrated UX; egress, storage rights and budget approval needed |
| Build from Common Crawl | Dataset access is free, processing is not | Substantial indexing, freshness, operations and rights work; not a lean MVP dependency |

## Search providers and rights

### Brave

The current [Search API page](https://brave.com/search/api/) lists Search at
USD 5 per 1,000 requests and USD 5 monthly credits. It describes an independent
web index and says storing results requires a plan that explicitly grants
storage rights. This is an alternative to depending on Google's index, not a
guarantee of universal coverage or permanent terms.

The [API terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service)
restrict durable reuse beyond operational transient storage under standard
conditions. Do not budget on building a permanent result database or derivative
embedding corpus without the relevant plan or written permission. Access also
does not grant rights to all third-party page contents.

The [API privacy policy](https://api-dashboard.search.brave.com/privacy-policy)
describes billing information and query-record retention up to 90 days for
billing/troubleshooting, subject to its other retention obligations. Any exact
integration requires review of transmitted fields and international processing;
"we do not store the query" would not describe the whole data flow.

### Exa

The current [pricing documentation](https://exa.ai/docs/admin/pricing) lists
USD 7 per 1,000 searches for up to ten results and USD 10 monthly credits.
Older marketing prices are not the current cost basis. The old
[find-similar reference](https://docs.exa.ai/reference/find-similar-links)
redirects to search documentation: do not promise a separately available or
separately priced URL-to-similar-pages endpoint without checking its live contract.

The [terms](https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf/)
do not establish unconditional rights to turn results into our permanent shared
index. Clarify the actual plan's reuse and derivative-data terms before choosing
that architecture. No provider has been selected.

### Tavily: recurring free credits without a payment card

The [credit documentation](https://docs.tavily.com/documentation/api-credits)
provides 1,000 free credits/month without a card: basic Search costs one credit,
advanced Search two. The [pricing FAQ](https://www.tavily.com/pricing) says free
requests stop at exhaustion until reset or upgrade. This makes a bounded solo
test feasible without a search bill, not an unlimited shared service.

The [platform terms](https://www.tavily.com/terms) combine internal-business/key
restrictions with a section contemplating third-party application end users.
Clarify the exact public-app integration contract rather than asserting it is
categorically allowed or forbidden. Input-sharing/improvement rights and sensitive-
input exclusions also need privacy review. No private-page query export approved.

### Parallel: a larger free search allowance, limited reuse

Current [pricing](https://parallel.ai/pricing) offers USD 5 recurring monthly
credits, covering up to 5,000 Turbo/Fast Search calls at USD 1/1,000 for ten
results. Basic/Advanced Search cost USD 5/1,000; extra results cost more. Do not
mix recurring credits with conditional one-time signup bonuses.

The [customer terms](https://parallel.ai/customer-terms), sections 2(b)/(c),
restrict cross-end-customer reuse/caching and building result databases or reusing
prior output to divert subsequent API calls. This can be a low-cost discovery
candidate, not permission for our communal cached index. Provider privacy and
exact plan/rights approval are still required; no integration or account created.

### Illustrative Brave/Exa request budget, not a quote

100 active users x 3 external lookups/day x 30 days = 9,000 monthly requests:

- Brave: USD 45 gross, approximately USD 40 with the listed monthly credit.
- Exa: USD 63 gross, approximately USD 53 with the listed monthly credit.

These calculations exclude taxes, our hosting, optional content/answer products
and any additional storage-rights agreement. Costs scale with request frequency,
not merely registered users. Inference is not required for every search. Quotas,
explicit search and reuse only where contractually permitted can control spend.

## Free allowances and ordinary-search fallback

### A zero-spend solo API experiment is possible

The owner's follow-up asks whether free search and on-visit background lookup
are possible. This is a feasibility question, not approval to enable either.

Brave's current [billing FAQ](https://api-dashboard.search.brave.com/documentation/resources/help-feedback)
explicitly allows a new prepaid plan with USD 0 prepaid balance while using the
recurring USD 5 credit, equivalent to 1,000 Search requests per month. A payment
card is still required and a temporary USD 0/1 verification hold can occur. Keep
auto-reload disabled and add an application request cap. Once credit/balance is
exhausted, requests pause rather than requiring a purchase. Existing postpaid
plans behave differently; verify the actual account mode. No account was created.
The FAQ also expressly restricts retaining API data without separate permission.

For illustration, one tester making 20 searches/day for 30 days needs 600
requests, within that allowance; 50/day needs 1,500 and is not wholly covered.
Per-visit searches scale much faster than intentional opens. Issuing requests
from the user's device does not remove provider quotas, disclosure or usage terms.

### Search-link handoff

[DuckDuckGo's parameter documentation](https://duckduckgo.com/duckduckgo-help-pages/settings/params)
supports constructing a normal search link. A future UI can show the proposed
query and destination for the user to approve, then open the provider's page.
Do not scrape the returned results, bypass its ads/branding or silently turn
page context into a query. This is a navigation handoff, not a free search API
or an in-app related-page list. It still discloses the query to the destination.

SearXNG is an open-source alternative, not an independent free web index. Its
[limiter documentation](https://docs.searxng.org/admin/searx.limiter) explains
that upstream engines can CAPTCHA/block its forwarded requests and public
instances therefore limit bots. Self-hosting does not remove operating costs
or upstream terms. Do not rely on community instances as an unlimited app API or
rotate around their restrictions. It is not the recommended default here.

## Background/on-visit lookup: technically possible, not enabled

Two distinct capabilities need separate consideration:

1. Rank already available permitted Sources locally. No external search fee,
   but automatic page observation/model execution still changes permissions,
   device workload and the currently approved capture boundary.
2. Automatically ask an external service for new pages. The query can reveal
   what the user reads even if raw content/URLs are not transmitted. Local
   extraction of keywords is not reliable anonymization or private-page detection.

Current Chrome [`activeTab`](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
access is temporary and user-invoked; it does not permit passive observation of
every newly visited site. Background capture needs its own minimum permission
and lifecycle design. Chrome's
[Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
allows browsing-activity use only where necessary for a prominently disclosed
user-facing feature, and applies restrictions to derived data too. This is not
a categorical background-feature ban or a guarantee of acceptance.

Recommendation, not an adopted expansion: first search automatically after the
user opens the extension, with no second button. Later evaluate an opt-in mode
for approved sites/contexts with a short foreground dwell, cancellation on
navigation, per-source deduplication, hard quotas and no retained browsing log.
Any reuse of external results remains subject to their retention terms. Exclude
sensitive contexts unless separately approved; do not promise an infallible
login/private-page detector. Propose exact query contents, recipients, retention,
permissions and failure behavior before enabling the mode. Phone integrations
cannot assume access to arbitrary other apps' browsing activity.

## Why not index the web ourselves now?

[Common Crawl](https://commoncrawl.org/get-started) provides accessible crawl
data, but its [CDX index](https://index.commoncrawl.org/) locates captures by URL;
it is not a semantic related-page endpoint. Its
[overview](https://commoncrawl.org/overview) describes petabyte-scale data.
Selecting, processing, updating and serving a useful index adds engineering and
infrastructure work; dataset availability is not blanket downstream-content
permission. A small domain-specific experiment might be useful later, but does
not solve general discovery cheaply for this solo-built MVP.

## Implementation and remaining evidence

Extension 0.4.0 demonstrates the ranker and empty-forum UX using only six bundled
synthetic Sources and hand-authored vectors. No genuine semantic model, live
results, citation verification, price comparison or recommendation quality is
demonstrated. Existing associations and related-reading suggestions remain
separate; similarity never creates a global Topic merge.

Next: an approved pinned local model experiment, then an approved real-input
boundary. For an external source adapter, obtain exact provider/privacy/security,
query/retention/rights and spending approval before activation. Public results
and associations must not leak private-page existence. Do not repeat the owner's
completed synthetic review; larger independent-label work remains roadmap R5.

# ADR-011: Cross-platform standards-based content-signal boundary

Status: Accepted for the exact P1.5c controlled-page plus one pinned MDN-page
experiment; implementation and AI engineering review pass, while owner browser
evidence remains pending

Date: 2026-09-22

Owners: Lead / Product Orchestrator, Platform and Client, Semantic Resolution,
Security, Trust, Privacy, Policy / legal, Quality

## Context

The product should identify related coverage across Chromium, Android, and iOS
without implementing a bespoke API integration for every website or depending
on one paid search provider. Chromium scripting and Android/iOS WebViews can
technically inspect a displayed document, but technical access is not a licence
to extract, analyze, retain, transmit, or republish third-party material.

Chrome Web Store policy treats page content, URLs, scraping, and derived values
as user data. Apple App Review requires third-party-service access to be
specifically permitted by the service terms and may reject a repackaged site or
content aggregator. Google Play rejects unauthorized site WebViews and
copyright infringement. `robots.txt` is not authorization, and robots metadata
governs participating indexing/snippet uses rather than granting a general
content licence. The dated evidence and alternatives are in
`research/CONTENT_ACQUISITION_AND_STORE_POLICY.md`.

The current accepted ADR-010/P1.5b slice observes only a queryless allowlisted
URL. It neither authorizes nor technically enables content extraction.

Owner disposition: on 2026-09-22 the owner explicitly approved Owner/Product,
Security/Trust, Privacy, Policy/Rights, and Quality for the bounded scope below,
plus one real public-page test. This does not substitute for qualified legal or
store review and authorizes no general third-party extraction.

The owner additionally directed the PoC to treat public document-head metadata
as available for local processing and not to build paywall detection or
per-site APIs. This is a recorded product/risk assumption, not a legal finding
or a generalized release/store authorization.

## Decision

Use one portable, versioned page-signal contract and small platform adapters,
not per-site API code, as the preferred future extraction architecture.

Any first live experiment would:

- run only after an explicit user action against the current top-level page;
- keep exact URL as the universal fallback;
- use a strict standards-based metadata envelope rather than article body:
  browser-observed URL, same-origin canonical hint, one bounded
  title/headline, one bounded publisher description, one optional
  `publishedAtHint`, and field-level provenance;
- exclude images, body text, author identities, comments, forms, selections,
  accessibility/hidden text, frames, cookies, storage, authentication data,
  and page-provided executable behavior;
- restrict this experiment to two exact queryless routes and a signed-out MDN
  manual test; do not claim that authentication or paywall state is detected;
- treat the exact supported negative in-head robots/TDM signals as a hard stop,
  while never treating absent or positive signals alone as authorization;
- validate origin/navigation binding before and after extraction;
- immediately discard raw fields after the bounded operation;
- produce no fingerprint, embedding, Topic suggestion, join, split, ranking,
  or other semantic decision in P1.5c; and
- perform no storage, telemetry, remote fetch, raw/derived egress, publication,
  or store submission under this decision.

RSS/Atom/JSON Feed auto-discovery or licensed publisher APIs may provide
higher-trust optional inputs through the same contract. They are not required
for general operation, and their presence is not assumed to grant a licence.
No general web-search provider is a foundation dependency.

The adapter can be generic, but eligibility cannot honestly be universal.
Where platform rules or service terms require a rights basis, the product must
default deny until the policy/rights evidence is adequate. This may require a
domain/source policy record without requiring domain-specific parser code.

For P1.5c, the Chromium manifest may contain exactly `activeTab` and
`scripting`, with no host permissions. A packaged function may inspect only the
active top-level document in an isolated world after an explicit popup click.
The two eligible routes, field limits and precedence, exact in-head control
selectors, MDN rights evidence, expiry instant, tests, and retention boundary
are frozen in
`research/P1_5C_SCOPE_AND_REAL_PAGE_POLICY.md`.

Publication time is context, not Topic identity. Product descriptions and
evergreen material can remain same-topic across long intervals, while event
news may later benefit from a temporal signal. P1.5c therefore exposes only an
optional provenance-bound `publishedAtHint` and must ignore it for every Topic
or matching decision. Any content-class-specific temporal logic requires the
deferred labeled-corpus evaluation and a new decision.

## Alternatives considered

- **URL only forever:** lowest policy risk and fully general, but too weak to
  match different publishers covering the same event. Retain as fallback, not
  the final matching signal.
- **Per-site APIs:** strong when licensed, but an endless integration surface
  and unsuitable as the core. Retain only as optional adapters.
- **Full rendered article extraction:** technically general and semantically
  useful, but too exposed to paywall, terms, copyright, privacy, hostile DOM,
  and store-review risk for the next increment. Do not implement without a new
  qualified review and decision.
- **Server-side crawling:** adds robots/rate limits, SSRF, retention,
  infrastructure, and legal exposure. Rejected for the local PoC.
- **Google or another general search API:** introduces cost, keys, provider
  terms, availability, result-rights, and lock-in. Rejected as a foundation;
  Google Custom Search is already closed to new customers and scheduled for
  discontinuation for existing customers on 2027-01-01.
- **User-selected text/share only:** strong intent and useful as an optional
  path, but inconsistent input and not a copyright/terms waiver.

## Consequences

- The product can keep one cross-platform semantic input contract and avoid a
  per-publisher parser architecture.
- A later small local embedding over metadata remains a possible experiment,
  but P1.5c contains no model; model selection/licensing and every semantic or
  off-device data flow remain unapproved.
- Store publication is not guaranteed. Apple in particular may require
  service-specific permission evidence; a universal technical adapter cannot
  erase that requirement.
- The URL-only P1.5b extension slice was completed and owner-smoke-tested on
  2026-09-22. Its evidence remains independent of the separate P1.5c metadata
  action now added to the same package.

## Required approval and validation

Before code reads live metadata, record approval of:

1. the exact metadata fields, length limits, precedence, and provenance;
2. Chrome/Android/iOS permissions and user disclosures;
3. exact route controls and the documented limitation that the adapter does
   not detect sensitive/paywall/authenticated/private presentation state;
4. the terms/rights review method and expiry/re-review process;
5. model identity, licence, redistribution, reproducibility, and local resource
   bounds (not applicable to P1.5c because this slice contains no model);
6. raw/derived retention (initial proposal: none) and navigation binding; and
7. synthetic/owned-page, hostile-DOM, privacy, and store-policy test evidence.

Any off-device value—including an embedding, fingerprint, or inferred Topic
ID—requires a separate owner/privacy/security/provider/deployment/spending
decision as applicable. Any store submission or public distribution requires
fresh policy/rights evidence and explicit owner publication approval.

## Owner / review disposition

Accepted on 2026-09-22 only for the exact P1.5c boundary recorded above and in
`research/P1_5C_SCOPE_AND_REAL_PAGE_POLICY.md`. A broader URL, field, selector,
permission, platform adapter, data lifetime, semantic use, provider, egress,
deployment, store, spending, or publication action returns to an explicit
owner and applicable Security/Privacy/Policy gate.

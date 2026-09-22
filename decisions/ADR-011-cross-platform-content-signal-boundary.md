# ADR-011: Cross-platform standards-based content-signal boundary

Status: Proposed — owner, Security/Trust, Privacy, platform-policy/rights, and
Quality approval required before live-page implementation

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

## Proposed decision

Use one portable, versioned page-signal contract and small platform adapters,
not per-site API code, as the preferred future extraction architecture.

Any first live experiment would:

- run only after an explicit user action against the current top-level page;
- keep exact URL as the universal fallback;
- use a strict standards-based metadata envelope rather than article body:
  browser-observed URL, same-origin canonical hint, one bounded
  title/headline, one bounded publisher description, one publication time, and
  field-level provenance;
- exclude images, body text, author identities, comments, forms, selections,
  accessibility/hidden text, frames, cookies, storage, authentication data,
  and page-provided executable behavior;
- deny authenticated, private, paywalled, tokenized/query-bearing, restricted,
  and otherwise sensitive contexts by default;
- treat negative terms, robots/meta/TDM, or publisher signals as a hard stop,
  while never treating absent or positive signals alone as authorization;
- validate origin/navigation binding before and after extraction;
- compute any candidate fingerprint or embedding on-device using an
  independently reviewed, redistributable model; immediately discard raw
  fields after the bounded operation;
- produce only a local, user-confirmed Topic suggestion under `NO AUTO`; and
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
- A small local embedding over metadata is the preferred experiment, but model
  selection/licensing and every raw/derived data flow remain unapproved.
- Store publication is not guaranteed. Apple in particular may require
  service-specific permission evidence; a universal technical adapter cannot
  erase that requirement.
- The current URL-only extension remains valuable and should be completed and
  smoke-tested independently of this proposal.

## Required approval and validation

Before code reads live metadata, record approval of:

1. the exact metadata fields, length limits, precedence, and provenance;
2. Chrome/Android/iOS permissions and user disclosures;
3. sensitive/paywall/authenticated/private eligibility detection and its
   fail-closed limitations;
4. the terms/rights review method and expiry/re-review process;
5. model identity, licence, redistribution, reproducibility, and local resource
   bounds;
6. raw/derived retention (initial proposal: none) and navigation binding; and
7. synthetic/owned-page, hostile-DOM, privacy, and store-policy test evidence.

Any off-device value—including an embedding, fingerprint, or inferred Topic
ID—requires a separate owner/privacy/security/provider/deployment/spending
decision as applicable. Any store submission or public distribution requires
fresh policy/rights evidence and explicit owner publication approval.

## Owner / review disposition

Pending. The request to investigate a general, vendor-neutral alternative to
per-site APIs authorizes this research and proposal, not live-page extraction.

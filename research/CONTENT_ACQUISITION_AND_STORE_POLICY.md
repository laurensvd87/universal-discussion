# Cross-platform content signals and store-policy evidence

Status: research only; no extraction, provider, spending, deployment,
publication, or legal conclusion is authorized

Evidence checked: 2026-09-22

Owners: Lead / Product Orchestrator, Platform and Client, Trust, Privacy,
Security, Policy / legal, Quality

## Executive conclusion

One per-site API integration per publisher is not a viable core architecture.
The technically general candidate is one standards-based page-signal adapter
for Chromium, Android, and iOS: after an explicit user action, read a small
allowlisted metadata envelope, process it on-device, immediately discard raw
values, and keep semantic decisions on the `NO AUTO` path. RSS/Atom or a
licensed publisher API can be an optional higher-trust source without changing
the core contract.

That design is technically feasible but is **not yet approved or guaranteed to
be publishable**. App and extension stores distinguish technical access from
authorization. In particular, Apple's rule for third-party services makes a
claim of universal extraction across arbitrary sites incompatible with a
guarantee of App Store acceptance unless the applicable service terms or
another rights basis permit it. The honest architecture is therefore:

1. one generic adapter and schema, not per-site code;
2. a separate eligibility/rights policy, with authenticated, private,
   paywalled, tokenized, and negative publisher-signal contexts denied;
3. exact URL as the universal fallback;
4. local metadata-derived suggestions only where the policy gate passes; and
5. no raw or derived content egress, storage, or publication until separately
   approved.

No robots, metadata, hashing, or embedding technique by itself creates a
content licence or guarantees store acceptance. This is product/platform
research, not legal advice; a qualified review is required before public
distribution with third-party content extraction.

## Current official evidence

### Chrome Web Store

- Chrome treats URLs, website content/resources, clipped or scraped page data,
  and browsing activity as user data. Local-only processing still needs a
  privacy policy and disclosure. Its rules also follow data derived from raw
  data, so an embedding is not a way around the policy:
  <https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>
  and
  <https://developer.chrome.com/docs/webstore/program-policies/limited-use>.
- Browsing activity may be used only as needed for a prominently described
  user-facing single purpose. Minimum permissions, affirmative informed
  disclosure, and consistent store/UI/privacy descriptions are required:
  <https://developer.chrome.com/docs/webstore/program-policies/policies> and
  <https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements>.
- The developer agreement prohibits knowingly violating third-party terms,
  unauthorized access, and intellectual-property infringement:
  <https://developer.chrome.com/docs/webstore/program-policies/terms>.
- `activeTab` is the narrow user-gesture permission. Page injection additionally
  needs `scripting`; that would be a new reviewed permission boundary:
  <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab> and
  <https://developer.chrome.com/docs/extensions/reference/api/scripting>.

The likely result is that an explicitly invoked metadata feature is not
categorically prohibited, but it must be necessary to the visible feature,
minimally privileged, accurately disclosed, rights-compliant, and protected as
user data. Approval is still case-specific.

### Apple App Store and iOS

- App Review Guideline 5.2.2 says that an app which uses, accesses, monetizes
  access to, or displays third-party service content must be specifically
  permitted under that service's terms, with authorization available on
  request. Guideline 5.2.1 separately covers protected material:
  <https://developer.apple.com/app-store/review/guidelines/>.
- Guidelines 4.2 and 4.2.2 require an app to be more than a repackaged website,
  web clipping, content aggregator, or link collection. A native discussion
  layer can provide distinct utility, but a generic WebView wrapper is a poor
  submission posture: <https://developer.apple.com/app-store/review/guidelines/>.
- `WKWebView` can evaluate JavaScript in the displayed page, including an
  isolated content world. This proves feasibility, not permission:
  <https://developer.apple.com/documentation/webkit/wkwebview>.
- Safari extensions should claim no more website access than necessary. A
  Safari/share-extension entry point may be narrower than building a general
  browser inside the app, but still needs the same rights analysis:
  <https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions>.

Apple is the strongest reason not to equate “publicly viewable” with “safe for
universal extraction.”

### Google Play and Android

- Google Play does not allow an app whose primary purpose is an unauthorized
  WebView of another site. It also rejects repetitive/low-value wrappers:
  <https://support.google.com/googleplay/android-developer/answer/9899034>.
- The Play intellectual-property policy requires original material or the
  necessary licences/permissions and may require evidence:
  <https://support.google.com/googleplay/android-developer/answer/9888072>.
- `WebView.evaluateJavascript()` can inspect the currently displayed page.
  Android warns that JavaScript bridges on untrusted content are dangerous and
  recommends a standard browser/Custom Tab for ordinary external browsing:
  <https://developer.android.com/reference/android/webkit/WebView> and
  <https://developer.android.com/develop/ui/views/layout/webapps/webview>.
- Strictly on-device processing is different from off-device collection for
  the Play Data safety form, but that reporting distinction grants no website
  or copyright permission:
  <https://support.google.com/googleplay/android-developer/answer/10787469>.

The native discussion UI must be the app's purpose. A WebView, if retained,
should be an entry context rather than the product value itself.

### Publisher and legal signals

- RFC 9309 expressly says Robots Exclusion Protocol rules are not access
  authorization: <https://www.rfc-editor.org/rfc/rfc9309.html>.
- `noindex`, `nosnippet`, `data-nosnippet`, and `X-Robots-Tag` control
  participating search indexing/snippet behavior. They are useful conservative
  signals, not general reuse licences:
  <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag>.
- For Germany/EU, text-and-data-mining rules and machine-readable reservations
  can matter. German UrhG section 44b requires lawful access, recognizes a
  rights reservation, and requires copies no longer needed to be deleted:
  <https://www.gesetze-im-internet.de/urhg/__44b.html>. EU Directive 2019/790
  Article 4 is the corresponding EU source:
  <https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32019L0790>.
  Whether a particular site signal, transformation, or product use qualifies
  is a legal determination, not something the client should infer as granted.

Conservative rule: a negative robots/meta/TDM or contractual signal is a hard
stop. A positive or absent signal is never sufficient authorization by itself.
A user's subscription permits the user to view a paywall page; it does not
automatically authorize this product to extract, retain, upload, aggregate, or
republish it. Never bypass access controls.

## Candidate approaches

| Approach | General across sites | Store/rights posture | Matching value | Decision |
| --- | --- | --- | --- | --- |
| Exact normalized URL only | Yes | Lowest risk; still disclose URL handling | Same-page identity only | Keep as universal fallback and current PoC |
| URL host/path lexical features | Yes | Lower content risk; can still expose browsing activity | Weak cross-publisher signal | Safe local experiment after field review |
| Standard metadata envelope (`title`, same-origin canonical hint, Open Graph/Schema.org headline/description/date) | One generic parser | Plausible only with explicit gesture, disclosure, terms/rights basis, sensitive-context denial, and no raw reuse | Best small general signal | Preferred next research/fixture experiment; not yet approved for live pages |
| On-device embedding of that envelope | Yes after model packaging | Avoids raw content egress, but model licence/reproducibility and derived-user-data rules remain; a transmitted vector is still derived browsing data | Stronger semantic candidate | Preferred candidate, local-only and `NO AUTO`; separate model/provider approval |
| User-selected text or OS share sheet | Yes | Strong user intent but not a copyright/ToS waiver | Potentially strong, variable | Useful optional entry point; exact disclosure and bounds required |
| Auto-discovered RSS/Atom/JSON Feed | Standards-based | Publisher intent is stronger but feed terms/licence still control | Good structured signal where available | Optional source, not required and not assumed licensed |
| Licensed publisher feed/API | No generic integration | Strongest authorization when contract is clear | Usually good | Optional adapter for important publishers, not the core |
| Full visible article body | Technically general | Highest copyright, terms, privacy, paywall, and store risk | Strong | Disabled pending qualified legal/store review |
| Server crawler or remote fetch | Technically general | Adds ToS/robots/rate-limit/SSRF/retention/deployment risk | Strong | Disabled |
| General web-search API | Vendor-dependent and incomplete | Provider terms, content rights, keys, cost, retention, and shutdown risk | Variable | Not a foundation |

Google Custom Search is specifically unsuitable: its official page says it is
closed to new customers and existing customers must migrate by 2027-01-01; it
also requires an API key and charges beyond the free quota:
<https://developers.google.com/custom-search/v1/overview>.

## Approved bounded generic metadata experiment

On 2026-09-22 the owner approved the exact P1.5c controlled-page plus pinned
MDN-page increment in `P1_5C_SCOPE_AND_REAL_PAGE_POLICY.md`. It retains one
portable contract rather than per-site extraction code:

```text
explicit user action
  -> platform adapter confirms the current top-level document
  -> exact queryless route and dated policy gate
  -> read exact allowlisted standards-based metadata fields only
  -> validate bounds, provenance, supported in-head signals, and document binding
  -> discard raw metadata
  -> display the bounded local evidence without a semantic decision (NO AUTO)
```

The implemented candidate fields omit body text, images, author identities,
comments, form values, selections, cookies, storage, frames, and hidden or
accessibility text. A proposed envelope may include only:

- browser-observed normalized top-level URL;
- same-origin canonical URL as a non-authoritative hint;
- one bounded page title/headline;
- one bounded publisher-supplied description;
- one optional bounded `publishedAtHint`; and
- field-level origin and extraction-version evidence.

This envelope is approved only for the exact two P1.5c routes. The time hint is
context-only and cannot affect Topic identity or matching in this increment.
Open Graph metadata presence says what a publisher exposed to clients; it does
not by itself say how this product may reuse it.

The owner directs the local PoC to assume that public document-head metadata
is available for local processing. Accordingly, P1.5c implements neither a
generic paywall/authentication detector nor per-site APIs. The adapter could
not reliably infer those states without reading excluded data. This product
assumption is not a legal conclusion or release authorization; general site
support still returns to the Policy/Rights and store-publication gates.

P1.5c inspects only direct-head `meta[name="robots"]` and
`meta[name="tdm-reservation"]` controls. It cannot observe HTTP policy headers,
`robots.txt`, or site-wide TDM files without forbidden fetching or broader
permissions, so the implementation makes no complete robots/TDM-detection
claim.

For cross-device/server matching, the privacy-safe order to investigate is:

1. download a bounded public Topic candidate index and match locally;
2. send only a user-confirmed Topic identifier;
3. if insufficient, assess a content-derived vector or private-query design;
4. send raw metadata only if a later explicit privacy/rights decision proves it
   necessary.

Even a Topic ID or vector can reveal reading interest and remains subject to
the egress/retention gate.

## Required decision and evidence gates

Before adding `scripting`, a content script, `evaluateJavascript`,
`WKWebView` inspection, or equivalent page access beyond P1.5c:

- owner approval of the exact fields and supported/excluded contexts;
- Security/Trust review of frame/origin/navigation binding and hostile DOM;
- Privacy approval for raw and derived in-memory data, retention, and UI
  disclosure;
- a platform-policy/rights review of the intended generalized use, terms
  handling, observable robots/meta/TDM signals, the limits of
  authenticated/paywalled/private-context detection, and model/data licences;
  and
- synthetic/owned-page tests before any third-party-page test.

Those approvals are recorded for the exact Chromium P1.5c slice only. The
first external target is the rights-reviewed MDN metadata-reference page; all
other sites and all Android/iOS adapters still require a new disposition.

Before any raw or derived signal leaves the device, separately approve the
exact payload, purpose, server/provider, correlation risk, logs, cache,
retention/deletion, security, cost, and rollback. Before Chrome Web Store, App
Store, or Play submission, stop for explicit publication approval and repeat a
current-policy audit with accurate privacy/store declarations and rights
evidence.

The current solo owner can continue the local URL-only PoC and synthetic
metadata research. Before public shipment of generalized third-party metadata
or body extraction, obtain an independent qualified IP/platform-terms review.
Its bounded assignment is to examine the exact field envelope, transformations,
retention/egress, excluded contexts, terms-handling method, store disclosures,
and representative publisher terms, then identify which claims and domains
have a defensible rights basis. That reviewer was not needed for the now
completed exact P1.5b local URL-only slice.

# Cross-platform content signals and store-policy evidence

Status: research evidence plus an owner-approved local-test direction; exact
implementation, model, egress, server storage, provider, spending, deployment,
store submission, publication, and legal conclusions remain unauthorized

Evidence checked: 2026-09-23; owner decision updated 2026-09-24

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

The conservative release posture above is distinct from the owner-only local
PoC direction accepted on 2026-09-24. That direction permits a later exact,
network-denied implementation to operate on a lawfully accessible public,
authenticated, or private active page without claiming generalized store or
publisher approval. Its constraints are recorded below.

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
  <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790>.
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
| Bounded body region to an on-device derived signal | Technically general | Raw content can stay local, but extraction rights, store policy, model licence, derived-data leakage, and false-link risk remain | Potentially strong cross-page signal | P1.11 research only; disabled until its exact synthetic-fixture gates approve it |
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
MDN-page increment in `research/P1_5C_SCOPE_AND_REAL_PAGE_POLICY.md`. It retains one
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

## Owner-approved successor local interaction boundary

The completed P1.5c implementation and evidence remain unchanged: today it uses
a separate metadata button and only the two frozen routes. For a successor
local PoC, the owner accepted these product requirements:

```text
open extension popup
  -> capture the active top-level document
  -> automatically read URL plus the exact approved metadata envelope
  -> run only the local mapping/discussion lookup
  -> attest the same tab and document again
  -> render or clear every prior value and fail closed
```

Opening the popup is the explicit gesture; no additional `Check current tab`
button is required. The automatic action does not read a page body, invoke an
AI, publish, persist a browsing record, or make a network request. Navigation,
tab closure, document replacement, unsupported context, or permission failure
invalidates the result.

After the exact browser-bridge architecture and its Security/Privacy review are
accepted, the solo owner may test lawfully accessible public, authenticated, or
private pages locally. The bridge does not bypass login, paywall, or other
access controls and does not collect cookies, tokens, form fields, attachments,
frames, or background/inbox content. Any later separately approved body-derived
operation keeps raw content in memory only and excludes it from persistence,
sync, logs, telemetry, backups, and egress. Private-page material is never an
automatic AI input or publication.

This is not generalized extraction authorization, a legal conclusion, or store
eligibility evidence. External testers, connected matching, and distribution
return to the qualified rights/store and publication gates.

## Future on-device content-derived matching branch

On 2026-09-23 the owner requested a future edition that can consider bounded
page content, transform it locally into a fingerprint or embedding, keep that
derived signal hidden from other users, and use it only inside a protected
server-side matching service. A second motivating case is grouping similar
phishing-campaign emails so recipients can discuss the campaign without
exposing their individual messages.

The intended product match is **semantic similarity**, not byte identity. An
exact content hash is only a diagnostic duplicate/control baseline; it is not
the proposed cross-page resolver. The owner directs planning to treat explicit,
user-invoked on-device semantic derivation as permissible under the owner's ToS
interpretation. That is a recorded product assumption for future PoC design,
not independent legal advice, a representation about any particular site's
terms, or approval for external testing or a store build. The owner has approved
the bounded local real-page direction above in principle; its exact extractor,
redaction, and model still require the later Security/Privacy checkpoint.

This is a useful product direction, but local transformation is not a Terms of
Service, copyright, privacy, or store safe harbor. Chrome's Limited Use rules
apply to scraped data and to data aggregated, anonymized, de-identified, or
derived from it:
<https://developer.chrome.com/docs/webstore/program-policies/limited-use>.
Chrome also classifies website content, browsing activity, and personal
communications as user data even when processing stays local:
<https://developer.chrome.com/docs/webstore/program-policies/user-data-faq>.
Apple still requires the applicable third-party-service permission under
Guideline 5.2.2:
<https://developer.apple.com/app-store/review/guidelines/>. In the EU, the
general text-and-data-mining rule depends on lawful access and the absence of an
appropriate rights reservation; it is not a universal product authorization:
<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790>.

A fingerprint or vector is also not a secret or necessarily anonymous:

- an exact unkeyed hash supports known-content/dictionary comparison and only
  matches essentially identical canonical input, so it serves only as a control
  baseline rather than the semantic product path;
- a stable fuzzy fingerprint increases cross-user linkability and can leak
  recognizable features;
- a per-device salt frustrates cross-user matching, while a common key shipped
  to clients is extractable and is not a durable server secret; and
- dense embeddings can disclose source information. One primary study
  reconstructed 92% of the tested 32-token inputs for the studied models and
  recovered personal information in another dataset:
  <https://aclanthology.org/2023.emnlp-main.765/>.

Accordingly, every transmitted fingerprint/vector is **restricted derived
content and browsing-interest data**, not anonymized data. Other users, page
authors, ordinary moderators, logs, analytics, exports of other accounts, and
public APIs must never receive vectors, nearest-neighbour lists, raw scores, or
stable cross-user signal identifiers.

The proposed future flow is:

```text
explicit user action in an approved context
  -> locally select the exact bounded content region
  -> locally remove disallowed/private/unique fields
  -> locally derive a versioned fingerprint or embedding
  -> immediately discard raw extracted content
  -> send one authenticated, encrypted, purpose-bound derived signal
  -> private server match with strict access/retention/deletion controls
  -> return only an authorized Topic/Discussion result or no-match
```

The preferred minimization candidate is **ephemeral query, protected Topic
representative**. The per-observation fingerprint/vector exists only in bounded
server memory for one authenticated match transaction, is excluded from logs,
analytics, queues, caches, exports, and backups, and is deleted immediately
after the match/no-match outcome. The durable application result is the
`TopicId` plus minimal algorithm/policy-version and decision provenance, not the
query vector or neighbour scores.

Future matching is impossible if every comparable representation is deleted.
The service therefore needs either a protected per-Topic representative (for
example a reviewed centroid/prototype), a privacy-preserving comparison
protocol, or no ability to match later users. The first option is the practical
research candidate, but the Topic representative is still restricted derived
content: it is never returned to users, ordinary moderators, or public APIs;
has separate access, rotation, retention, poisoning, and deletion controls; and
cannot be used as a general query oracle. A no-match may create a provisional
Topic representative only under a separately approved consent/provenance rule;
otherwise it deletes the query and returns unmapped. Individual queries must
not update a centroid automatically.

The first model/transformation experiment remains network-denied and uses only
project-created or owner-authored synthetic fixtures. After that evidence and
the exact later Security/Privacy checkpoint, the approved owner-only local
scope may add one bounded real active-page case without egress. Before a
connected experiment, the design must fix
and separately approve the content selectors, exclusions, transformation/model
and licence, dimensionality/precision, payload, account linkage, similarity
thresholds, minimum cohort protection, server/index access, encryption, logs,
retention/deletion/backups, inversion/membership/linkability tests, false-match
appeal/correction path, and kill switch. A private index must not expose a
general similarity-search oracle.

### Private-message/phishing campaign stress case

The phishing-mail scenario is an illustrative upper-bound/privacy test, not a
separate core product or current commitment. Webmail and messages are a
distinct high-risk class, not an ordinary public page. The future branch must
not scan an inbox, run passively, inspect
attachments, or assume that being signed in authorizes product reuse. Synthetic
validation comes first. A manually opened real owner-accessible message may be
tested locally only after the exact Security, Privacy, and Policy checkpoint;
external support and distribution still require qualified rights/store review.

Before derivation, the client must use a tested local minimizer to remove or
generalize recipient/sender addresses and names, message and order IDs,
timestamps finer than the approved bucket, signatures, quoted history,
tracking pixels, unique URLs/query tokens, authentication/session material,
and attachments. Useful campaign indicators such as registrable sender/link
domains or template text require their own exact allowlist; redaction quality
must be measured rather than assumed.

The matcher may resolve the ephemeral query to a pseudonymous campaign
candidate, but it deletes that query when the transaction finishes. Only a
separately approved protected campaign representative may remain. No cross-user
Discussion becomes visible until a reviewed minimum-cohort and anti-correlation
rule passes; the exact threshold remains a future owner/Privacy decision.
Replies reveal neither another recipient's message, identity, vector, score,
provider, nor mailbox. Attackers may seed lookalike messages or discussions, so
rate limits, provenance, moderation, cluster correction, and adversarial-
poisoning tests are mandatory. The UI must state that community discussion such
as “this looks like phishing” is unverified guidance, not a security verdict.

`decisions/ADR-013-future-on-device-content-derived-matching.md` records this
requested direction and its stop boundary. It does not authorize extraction,
egress, model use, or server storage. The owner-only real-page scope is approved
in principle but has no implementation until its exact gate closes.

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
- synthetic/owned-page tests before the approved owner-only real-page case.

Those approvals are recorded for the exact Chromium P1.5c slice only. Its first
external target was the rights-reviewed MDN metadata-reference page; all other
sites and all Android/iOS adapters still require the exact later disposition
described here.

Before any raw or derived signal leaves the device, separately approve the
exact payload, purpose, server/provider, correlation risk, logs, cache,
retention/deletion, security, cost, and rollback. Before Chrome Web Store, App
Store, or Play submission, stop for explicit publication approval and repeat a
current-policy audit with accurate privacy/store declarations and rights
evidence.

The current solo owner may continue the local URL/metadata PoC and, after the
exact architecture/Security/Privacy checkpoint, the bounded real active-page
test above. Before external testing or public shipment of generalized third-
party metadata or body extraction, obtain an independent qualified IP/platform-
terms review.
Its bounded assignment is to examine the exact field envelope, transformations,
retention/egress, excluded contexts, terms-handling method, store disclosures,
and representative publisher terms, then identify which claims and domains
have a defensible rights basis. That reviewer was not needed for the now
completed exact P1.5b local URL-only slice.

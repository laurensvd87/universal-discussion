# P1.5c approved metadata scope and real-page policy

Status: approved and implemented for one bounded local experiment and exactly
one public real-page test; automated evidence and the separate AI engineering
review pass, while owner browser evidence remains pending

Decision date: 2026-09-22

Evidence checked: 2026-09-22

Public-page policy expiry: 2026-10-23T00:00:00.000Z (October 22 is the last
approved UTC calendar day)

## Approved contexts

The first Chromium implementation may execute only after an explicit extension
popup action and only on these exact queryless routes, with fragments ignored:

1. project-created fixture:
   `http://127.0.0.1:4173/p1-5c.html`;
2. public evidence page:
   `https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta`.

The local fixture is served by a repository test harness bound only to
`127.0.0.1`. The MDN route is public, does not require an account or
subscription, documents the metadata element being tested, and is the only
approved non-project route. A redirect, query, different locale/path, different
host, negative in-head policy signal, or expired review must fail closed rather
than broaden the allowlist. The adapter does not inspect or claim to detect
authentication or paywall state. The exact-route restriction and a clean
signed-out MDN manual test are the controls for this experiment.

## Owner metadata assumption

On 2026-09-22 the owner directed the proof of concept to assume that metadata
delivered in the public document head is available for local processing. Under
that product assumption, the PoC does not implement generic paywall detection
or per-site API adapters. This is an owner risk assumption for local product
development, not a legal conclusion, a licence grant, or evidence that an app
store will accept generalized extraction. General third-party support and any
store/public release therefore remain explicit Policy/Rights and Publication
gates.

## Rights and policy basis for the MDN test

- MDN's current attribution and copyright page states that its documentation
  is generally available under CC BY-SA 2.5 or any later version and describes
  the attribution requirement:
  <https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license>.
- Mozilla's Websites & Communications Terms identify MDN as a covered website
  and state that Mozilla-authored content is generally available for sharing
  and reuse under open licences, subject to the displayed notices:
  <https://www.mozilla.org/en-GB/about/legal/terms/mozilla/>.
- MDN's `robots.txt` currently disallows `/api/`, locale `files` paths, and
  `/media`; it does not disallow the exact approved documentation route:
  <https://developer.mozilla.org/robots.txt>. This is a conservative signal,
  not the rights basis.
- The test reads only the allowlisted head metadata after the user has opened
  the page. It performs no crawler fetch, remote request, body extraction,
  storage, transmission, public redistribution, or brand/visual-design reuse.
  Transient local display is still reuse, so the popup shows a fixed MDN,
  Mozilla-contributor, and CC BY-SA review attribution.

This is bounded product-policy evidence, not legal advice or a finding that all
MDN or third-party pages may be processed. Recheck the exact page, licence,
terms, and robots signal after the deadline or before changing the target.

## Approved metadata envelope

| Field | Maximum output | Generic precedence | Matching use in P1.5c |
| --- | ---: | --- | --- |
| observed URL | 8,192 code units | browser top-level URL cross-checked with the document URL | eligibility/binding only |
| canonical hint | 8,192 code units | exactly one queryless same-origin `link[rel~=canonical]` | non-authoritative evidence only |
| title | 256 code units | `og:title`, then `twitter:title`, then `<title>` | display/evidence only |
| description | 512 code units | `og:description`, then standard `description`, then `twitter:description` | display/evidence only |
| `publishedAtHint` | 64 code units | `article:published_time` only | context only; ignored by Topic matching |
| field provenance | bounded enums | exact selector category and contract version | audit only |

Missing optional candidates are represented as `null` in the exact envelope.
Conflicting values at one precedence,
over-limit raw values, unsupported structure, negative robots/TDM signals, or
an invalid date reject the operation generically. JSON-LD is deliberately
excluded from this increment.

The implementation freezes the following selector and work boundary:

- inspect at most 256 direct children of `document.head` and return at most 32
  relevant candidates;
- title selectors are exactly `meta[property="og:title"]`,
  `meta[name="twitter:title"]`, and `title`;
- description selectors are exactly `meta[property="og:description"]`,
  `meta[name="description"]`, and `meta[name="twitter:description"]`;
- publication metadata is exactly
  `meta[property="article:published_time"]`;
- canonical metadata is exactly a `link` whose `rel` token list contains
  `canonical`; resolution uses the browser-observed URL, never a page `base`;
- the only inspected control selectors are `meta[name="robots"]` and
  `meta[name="tdm-reservation"]`; robots accepts only the non-restrictive
  `all`, `index`, and `follow` tokens, TDM accepts only the exact value `0`,
  and restrictive, unknown, malformed, empty, or conflicting values stop;
- response headers such as `X-Robots-Tag`/`TDM-Reservation`, `robots.txt`, and
  `/.well-known/tdmrep.json` are not observable without a forbidden fetch or
  broader permission. The in-head check is deliberately not described as
  complete robots/TDM or rights detection.

## Temporal-semantics decision

Publication time is not Topic identity and is not a universal similarity
penalty. Product descriptions, reference material, reviews, and other
evergreen coverage can remain about the same Topic across months or years.
Time may later be evaluated as a content-class-specific signal for event/news
material, but only against the deferred labeled corpus. P1.5c must prove that
changing or omitting `publishedAtHint` cannot create, join, split, rank, or
reject a Topic.

## Security, privacy, and quality boundary

- Manifest permissions are exactly `activeTab` and `scripting`, minimum Chrome
  is 106, and there are no standing host permissions or content/background
  scripts.
- A packaged function executes in Chromium's isolated world against the active
  top-level frame only. It does not execute page-provided code.
- Only allowlisted head elements/attributes are inspected. Body text, JSON-LD,
  images, author identities, comments, forms, selections, accessibility or
  hidden text, frames, cookies, storage, and authentication state are excluded.
- Raw candidates and the validated envelope remain in popup memory only and
  are cleared on every failure/reset and when the popup closes. There is no
  extension storage, logging, telemetry, service, remote fetch, or egress.
- URL/document identity is checked before extraction, before the injected
  collector touches metadata, in the returned result, by a second
  `documentId`-targeted attestation, and by a final active-tab read. Navigation,
  a same-URL reload that invalidates the collected document before attestation,
  tab replacement/closure, permission loss, timeout, ambiguity, malformed
  data, or hostile input fails closed without echo. A reload or tab change in
  the small interval after its corresponding final check and before synchronous
  rendering remains a documented check/use race; the next invocation always
  starts from fresh browser state.
- Authentication and paywall state are neither read nor inferred. The exact
  allowlist and signed-out manual test replace any claim of generic detection.
- No embedding, model, provider, fingerprint, Topic candidate, or automatic
  semantic decision is part of this slice. `NO AUTO` remains mandatory.
- Synthetic tests cover precedence, duplicates, bounds, negative signals,
  body/frame decoys, hostile text, temporal non-use, and navigation races.

Android and iOS may reuse the versioned plain-data contract later, but this
approval authorizes no WebView adapter. Playwright, another dependency, or a
downloaded test browser is also outside this approval.

## Owner dispositions

The owner explicitly approved Owner/Product, Security/Trust, Privacy,
Policy/Rights, and Quality for this exact scope on 2026-09-22. The owner also
approved one real-page test; this record narrows that permission to the exact
MDN route above based on the documented evidence.

Provider/model use, off-device data, general third-party pages, mobile WebView
access, deployment, spending, store submission, and publication remain
separate explicit stops. A qualified independent rights/store review remains
required before any generalized third-party-page or release claim.

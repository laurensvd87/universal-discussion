# Product reset: store, privacy, and content-policy findings

Review started: 2026-09-27. Reconciled and critical sources rechecked: 2026-09-28.

Scope: browser extension first; future Android/iOS discussion clients, user AI
drafts, and semantic matching. This is primary-source issue research and an
engineering disposition, not legal advice, a store approval, or certification.
The exact released data flow, territories, operator, audience, and providers
still need release-specific review. Source rules can change.

## Corrections to the accepted design

### Blocking and reporting

Google Play explicitly requires public UGC apps to offer in-app reporting of
users/content and user blocking. Apple 1.2 requires UGC filtering, reporting,
abusive-user blocking, and contact information. Therefore the earlier owner
choice to omit blocking cannot be the cross-platform release contract. Opening
the panel voluntarily does not create an exception. Add personal blocking,
separate from moderator bans; mute can remain optional. The exact filtering and
interaction semantics in the domain model are our design, not store-prescribed
database mechanics. Sources: [Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)
and [Apple review guidelines, 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

Play's generative-AI policy requires in-app reporting/flagging of offensive
generated output. It does not say only published output qualifies. Design
inference: before real in-app generation ships, allow the user to preview and
submit a selected output/excerpt as restricted case evidence. This does not
authorize moderators to read the original private history, prompt, page, or
other drafts. Submission scope and retention must be explained and tested.
Source: [Play AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en).

### Rights handling, deletion, and retention

Apple requires account deletion within apps that support account creation.
Play requires an in-app deletion path plus an external web request resource;
the in-app path may link to that resource. A shared web Account & Privacy Center
is viable, but cannot be an excuse to ship real accounts without usable rights
handling. Sources: [Apple 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)
and [Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Manual content retention is a useful product preference, not permission to
retain every personal-data class forever. Real processing needs a purpose,
lawful basis, minimization, retention review, and access/erasure handling. The
local all-body-deletion rule is our chosen product behavior; erasure law has
exceptions, including certain legal obligations and legal claims. Do not add
silent legal holds or claim the prototype already covers them. Sources:
[Commission GDPR principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en)
and [handling individuals' requests](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en).

The seven-day/one-appeal fixture is not the public legal policy. DSA Article 20
provides at least six months of internal-complaint availability where applicable;
Article 19 exempts qualifying micro/small platforms from that section, with
qualifications. Assess actual hosting/platform classification and applicable
contacts, terms, illegal-content notices, reasons, and redress duties. A solo
builder is not automatically exempt from the whole DSA. Sources:
[DSA official text, Articles 16-20](https://eur-lex.europa.eu/legal-content/en-fr/TXT/?uri=CELEX%3A32022R2065)
and [Commission DSA FAQ](https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers).

## Content acquisition and commercialization

Chrome treats browsing activity and webpage content as user data; local-only
handling still needs disclosure. Use only permissions needed by the current
feature and do not monetize browsing records as ad-targeting data. Engineering
consequence: keep invoked active-context capture separate from optional AI,
publication, and shared matching; a vector is not an anonymity guarantee.
Source: [Chrome user-data and minimum-permission FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

Chrome's Limited Use requirements explicitly include derived, aggregated and
anonymized data. Therefore embedding conversion does not remove the purpose/
transfer limitations. Source:
[Chrome Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

Apple 5.2.2 requires third-party service use to be permitted under the service's
terms; 4.2 expects meaningful app utility beyond a repackaged website. Neither
local extraction nor metadata/embedding conversion guarantees permission or
approval. A native share-to-discussion entry point is a plausible mobile
direction; it is not universal access to content inside other apps. Source:
[Apple 4.2 and 5.2.2](https://developer.apple.com/app-store/review/guidelines/).

German UrhG section 44b provides a conditional text/data-mining route involving
lawful access and rights reservations; it is not blanket permission for this
specific product. Public online reservations must be machine-readable under
that provision. Engineering inference: robots/meta signals can inform policy
but cannot certify all copyright, contract, privacy, or store conditions.
Prefer source links, user-authored context, approved metadata, and separately
reviewed local processing over reproducing third-party bodies. Source:
[official section 44b](https://www.gesetze-im-internet.de/urhg/__44b.html).

Robots directives are not access authorization under the protocol itself. Neither
an absent directive nor an allowed crawl certifies a copyright license or app-
store permission. Source: [RFC 9309, introduction](https://www.rfc-editor.org/rfc/rfc9309.html#section-1).

Affiliate price suggestions are not a free default monetization route. Chrome
requires disclosure and related user action for affiliate behavior; silent
link/cookie replacement is incompatible with this direction. A later commercial
feature should visibly separate sponsorship and analytical quality, and receive
its own billing/store/consumer-law review. Source:
[Chrome affiliate ads policy](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads).

## Practical disposition

Mobile implementation recommendation: Android receive-share can accept a URL/text
that another app sends, with confirmation/editing; this does not expose the other
app's whole DOM. Apple documents Share/Action webpage preprocessing in Safari.
Prototype these narrow entry points and evaluate Safari extension reuse before
requiring users to browse and sign in again inside our own WebView. Preserve a
common optional-field context contract. Sources:
[Android receiving shared data](https://developer.android.com/develop/ui/compose/sharing/receive),
[Apple extension scenarios](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html).

The Apple extension-scenario document is archived technical guidance; validate
current APIs and actual-device behavior before a mobile implementation claim.

- Proceed with reversible network-denied discussion/domain fixtures and focused
  checks. Do not force all eventual moderation/restore machinery ahead of R1.
- Carry user-block/report entities in the design now; require the actual
  controls and moderation process before public UGC release.
- Keep original private stores inaccessible to moderators. A selected report
  copy is its own restricted, deletable object with explicit submission.
- Preserve historical owner answers and completed 6/6 synthetic review. They
  are not legal evidence and are not repeated.
- Before live release, resolve operator/territories/audience, actual privacy
  flow and processors, rights/contact/notice routes, content permissions,
  applicable AI transparency duties, store disclosures and real moderation
  capacity. Do not claim all future legal obligations are exhaustively covered
  by this focused reset audit.
- Provider integration, new sensitive egress, real-user recruitment, deployment,
  spending, store submission and publication still require explicit approval.

Evidence method: official policy pages were opened and checked; EUR-Lex and
German statutory pages intermittently failed full-page retrieval, so the
identified article wording was cross-checked against official indexed extracts
and Commission explanations. Release review must use the then-current complete
texts. No third-party summary is treated as binding policy.

## Documentation trust review

The reconciled contract now distinguishes personal blocking from operator
sanctions, explicitly limits private-output reports, qualifies prototype legal
deadlines, and preserves external-action gates. This is a documentation-only
AI review; it grants no external authority and changes no executable behavior,
account, provider call, or publication. Implementation evidence is required when each relevant
surface ships.

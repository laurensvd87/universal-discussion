# ADR-095: Public navigation URL minimization

Date: 2026-10-11.
Status: owner requested; implemented, independently reviewed and verified in 0.13.48.

## Owner request and scope

A public hotel URL containing a session parameter was rejected by the existing
credential-query guard before matching or posting. The owner requests stripping
such parameters generally, not an exception for one website, so eligible pages
can support discussions and Insights without manually cleaning their links.

This approval minimizes navigation URLs within the existing owner-local,
public-only browser profile. It does not permit private-page processing or make
authentication reliably detectable. Reading/extraction, permissions, provider
calls, accounts and deliberate sharing keep their existing authority.

## Decision

Add a browser-navigation inspector separate from the unchanged strict canonical
Source inspector. It removes case-insensitive `session`, `sessionid` and `sid`
keys, including existing hyphen/underscore/dot normalization, plus `utm_*`,
`fbclid`, `gclid`, `dclid`, `msclkid`, `gbraid`, `wbraid`, `mc_cid` and `mc_eid`.
Unknown and content-identifying parameters remain, including duplicates and
their original encoding/order. No blanket query removal or domain allowlist.

Validate original URL syntax, normalized length, credentials, scheme, host,
path and original 64-parameter budget before removal. After removing only the
approved session keys, apply the strict secret/JWT guard before removing
tracking. Passwords, access tokens, signatures, long keys and OAuth code/state
combinations therefore remain blocked. Ambiguous literal-semicolon credential
fields fail closed instead of being reinterpreted; encoded semicolons remain
functional data. No rejected input is reflected in diagnostics.

The original normalized, hashless document URL remains an extension-memory
witness. Internal matcher/resolution `url` and `currentUrl` keep that original
meaning; canonical catalog Source URLs are separately minimized. Browser tab,
window, document and exact original URL checks remain mandatory across reads,
embedding, ingestion, comment writes and Insight preparation/sharing. A change
only to a stripped query value still invalidates stale work. Matching the same
clean Source never proves that the same document is still active.

The reader accepts both canonical Source URL and original document witness,
attests the latter in the isolated world and returns only the canonical URL.
Insight reading retains at most one successful capture witness in RAM, cleared
on a new read or failed attestation. No session-bearing witness enters service
requests, post origins, provider context, logs, Chrome storage or Source links.
Strict server ingestion, post and citation validation remain unchanged.

## Compatibility and limits

No historical Source rewrite, merge, post migration or model/threshold change.
Previously stored tracking variants stay intact; new observations use minimized
URLs and ordinary existing matching. Unknown parameters can still distinguish
Sources. Excluded paths/hosts, hidden/form/paywall regions and capture budgets
remain; accepting a URL does not guarantee that its page has readable content.

Reload the extension to 0.13.48. No backend restart or pairing/account reset is
required. No provider QA, inference, real booking or release clearance follows.

## Verification

The complete capability-denied browser suite passes 1,261 tests. The local
backend suite has 511 passes and four existing skips, with no failures.
Independent Trust adds six adversarial checks and finds no remaining blockers:
unchanged canonical guards, structural/secret/semicolon failures, preserved
functional encoding, foreign witnesses and manual Insight tab substitution.
Root integration covers canonical-only ingestion/post origins, toolbar lookup,
session-only changes during each asynchronous matching stage and rejected
human writes after a navigation change.

Actual Chrome 154 uses one intercepted synthetic HTTPS document in a fresh
temporary profile. Eighteen captures include canonical-only reader results,
successful original-witness attestation and rejection after query-only
`history.replaceState`. There are zero extension runtime exceptions, external
requests, model asset loads or inference workers. Four fixture-page favicon
requests are intercepted locally. No owner browser/data modification or live
provider request.

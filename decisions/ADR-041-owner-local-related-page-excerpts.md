# ADR-041: Related-page excerpts for owner-local insights

Date: 2026-10-04
Status: owner-approved for the local proof of concept; store/release review open

On 2026-10-04 the owner separately approved one controlled live quality test
using one public current page and up to four bounded public related-page
excerpts through the existing local ChatGPT connection, with no automatic
publication or retry loop. This does not extend the release scope below.

## Decision

The owner wants a useful one-click Insight without a sequence of warnings or
checkboxes. In the owner-only local build, **Include related-page text** is a
normal Settings preference, on by default and switchable off. It does not
start a request by itself. Only an explicit **Get insights** action may try to
read up to four of the already selected five-source context's other pages.
The current page remains the subject. Per-page exclusions still apply.
Every non-current selected candidate, including an already same-Topic page,
must be individually excludable before its text is fetched or sent. A global
text toggle alone does not substitute for that source-level control.

The extension may fetch only policy-eligible public HTTPS source URLs using
existing Chrome HTTPS access. This requires widening the extension-page CSP
`connect-src` from self/loopback to HTTPS; the fetch adapter, not CSP alone,
must constrain each destination to the selected safe catalog candidates.
Fetches use no credentials or referrer, redirects,
scripts or subresource execution. Each fetch and response is bounded; failed,
blocked, explicitly paywalled or unparseable pages are skipped, not bypassed.
Explicit HTML `hidden`/`inert`/`aria-hidden`, inline `display:none` or
`visibility:hidden`, and recognized locked/paywall markers are excluded. This
bounded text reader does not compute external CSS visibility or prove that
every publisher access restriction is detectable; it must skip ambiguous or
malformed markup rather than treat attributes as prose. A rejected or aborted
response must not keep downloading. At most
2,048 text characters per related page and 8,192 total may pass through the
local service to the already selected ChatGPT model. No newly discovered URL,
Google search fallback, new extension permission, background AI request or
automatic sharing is authorized. The local service must verify that every
excerpt belongs to one of the non-excluded, validated context sources and
reject unknown, duplicate or mismatched URLs. Page text is untrusted data,
not instructions. It is not added to SQLite or the page catalog.

The provider request still uses `store:false`; that does **not** mean zero
provider retention. The existing explicitly opted-in raw debug mode can log
the complete request envelope, including these excerpts, to a local temp file;
it must remain off by default. The ordinary app should give a concise count
of related pages actually included, so a skipped page is not mistaken for
evidence. A supplied excerpt is only a bounded, anonymous fetch, not proof
that the full article was available or independently verified. URL citation
icons remain limited to validated provider annotations; the app must not
invent them for supplied excerpts.

## Boundaries and release gate

This amends ADR-035 only for the owner-local PoC. It accepts the owner's
working assumption for public material; it does not establish publisher
permission, copyright rights, privacy-law compliance or Chrome/Apple/Google
store acceptance. Before distribution, review the actual UX and disclosures,
publisher terms, platform policies, data minimization, provider retention and
whether a default-on preference is permissible. Do not claim store clearance
or run a live provider test with related-page text under ADR-038's narrower
QA authorization (which covers only other pages' title/URL).

The current Chrome Web Store disclosure rules require prominent disclosure
and informed affirmative consent before user-data handling, and disclosure
of changed data practices. Chrome's user-data FAQ explicitly includes scraped
webpage content and says a privacy-policy link alone is insufficient when
prominent disclosure is required. Thus the default-on local setting is **not**
a release UX decision; a concise one-time onboarding action may be necessary,
even though repeated per-Insight warnings are not. This is a policy review
flag, not a legal conclusion.

OpenAI's [data-controls documentation](https://developers.openai.com/api/docs/guides/your-data)
describes separate application-state and abuse-monitoring retention for
Responses. Chrome's [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)
and [disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements/)
remain release-review inputs, not a finding of compliance.

## Bounded owner-local QA outcome (2026-10-04)

The owner gave a separate one-request approval for the fixed public PEP 8
current page and three PEP 257/20/7 related excerpts, then approved one
additional request after seeing that the first post did not visibly use the
related text. Each completed with exactly one Responses dispatch, no retry,
no Share and no local-catalog/private-page input. The first post was 78 words
and current-page-focused; the refined opener prompt yielded an 80-word post
with a concrete PEP 8/PEP 257 comparison. Neither received a provider citation,
so the excerpt was described as supplied context, not verified external
research. This demonstrates one useful fixed-fixture behavior, not reliable
cross-page reasoning, Chrome-rendered capture, publisher rights, or release
compliance. Additional live tests need a separate scope approval.

## 2026-10-06 availability diagnosis and pending scope gate

The current anonymous reader has a 96 KiB HTML response ceiling and a
4,096-token parser ceiling. One previously supplied public related page is
583,306 bytes and places its main region after roughly 239 KiB. A bounded
diagnostic classified its current rejection as size/type; a purely in-memory
768 KiB/8,192-token variant produced a 2,048-character excerpt. This proves
neither browser access nor provider usefulness, and does not establish rights.
Raising the fetch ceiling eightfold is a data/network-scope expansion under
ADR-044, so the exact owner-local change awaits explicit owner approval and
Trust checks before activation. One further live ChatGPT quality test has a
separate pending permission request. No Google Related fallback is added.
The unchanged-cap build may expose only bounded, content-free aggregate
failure counts in Developer Mode to distinguish no access, network/HTTP,
size/type and parse/short outcomes. It must not log or retain source URLs,
titles, page text or exception details for that purpose.

## 2026-10-06 bounded owner-local expansion

The owner explicitly approved increasing only the anonymous related-page
reader to 768 KiB of HTML and 8,192 parser tokens. The separate request for
one live ChatGPT quality test using one public current page and at most four
related excerpts was also explicitly approved. Neither permission changes the
four-attempt, 2,048-character-per-page, 8,192-character-total, five-second,
source-exclusion, transient-text or private-draft limits above. This is not
store/public-release clearance or permission to cache related-page bodies.

An independent Trust review of the exact reader diff found no blocking scope
or egress issue. Synthetic checks confirm that a 583,306-byte HTML page with
its main region after 239 KiB can yield only a bounded visible excerpt, while
a 768 KiB+1 streamed response is rejected and cancelled. These checks do not
prove that any particular publisher permits access or that the browser can
fetch the live page. An anonymous local reader check of the previously
supplied public Vietnam.vn candidate accepted one 2,048-character excerpt
without printing or saving raw text; this does not prove Chrome access or
rights. The single approved live ChatGPT QA attempt stopped before any
Responses dispatch because the protected connection could not be restored
(`Connected ChatGPT plan unavailable`). The verified project service was
briefly stopped for the exclusive-port harness and restarted with the same
extension Origin and durable pairing. A fresh ChatGPT sign-in is needed
before live quality can be assessed; no provider result is claimed.

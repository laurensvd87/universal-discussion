# ADR-053: Bounded ChatGPT research for missing related-page evidence

Date: 2026-10-07
Status: implemented and verified for owner-local PoC; not release approval

## Decision and supersession

The owner rejects a cache of pages visited by the current user as the answer to
the network-effect problem: related URLs may have been contributed by *other*
users. The owner now explicitly authorizes testing ChatGPT HTTP research with
up to 100 requests (preferably fewer). This supersedes ADR-052's no-provider-
search rule **only** for a deliberate Get insights action on public pages.

Keep the current tab's bounded, reattested article extract as the subject. The
extension first attempts its existing bounded anonymous related-page reads.
When selected eligible candidate URLs lack an accepted excerpt, the paired
local service may provide the official Responses `web_search` tool to the
already-selected account/model, constrained to those missing candidates'
public HTTPS domains. The model must inspect the candidate URLs, use a related
page only if it concerns the same specific subject, distinguish a snippet from
a verified article, and support external claims with provider URL-citation
annotations. Locally supplied excerpts retain ADR-051's `[[ref:n]]` attribution.
No automatic Insight, retry, share, new account, API key or paid fallback is
authorized. The user's source-exclusion setting still applies.

This is **not** an authorization to bypass publisher blocks or robots rules.
A candidate URL, `open_page` event or search-result snippet alone does not prove
the article body was read. A citation-free response cannot be represented as
verified external evidence. Search may fail on the selected model or site; the
app must report failure honestly, not silently substitute made-up facts.

## Evidence and limitations

Official OpenAI documentation describes hosted Responses web search, optional
`tool_choice`, domain filtering and clickable `url_citation` annotations;
Sign in with ChatGPT makes web search subject to model/account policy:

- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

The isolated, one-Responses-request-per-invocation GPT-5.5 PoC used the existing
protected ChatGPT-plan connection and fixed public URLs. Four requests were
sent, well below the owner's ceiling:

1. PEP 8/257 control: completed; two `open_page` calls and citations to both
   exact pages.
2. De Standaard Kyiv article: completed with a search and an `open_page`
   attempt, but no citation. Its answer reported a fetch/cache failure and
   robots.txt block, so no article-content verification was established.
3. RTL/RD army-size pair: completed; RD was cited, RTL was not.
4. Repeated De Standaard case with a bounded public-result excerpt confirmed
   the access-failure explanation, not article access.

These tests show a useful best-effort route, not universal publisher coverage.
Only URL/title/vector are retained in the local catalog; other users' raw page
text is not thereby available to ChatGPT. Hosting a future multi-user source-
evidence exchange would be a separate privacy/security/provider/publication
decision. Existing account usage and possible provider-side costs remain under
the owner's ChatGPT controls; the app cannot enforce those settings.

## Verification gate

The exact-URL citation allowlist, completed web-search-call requirement,
source exclusions, no-source failure, inline-link restrictions and existing
`[[ref:n]]` path are covered by offline tests. The final production-path live
QA used one additional Responses request with an account-listed `gpt-5.6-luna`
model: a private PEP 8/257 draft returned an exact PEP 257 citation; it was
not shared. This brings the total to **six actual Responses requests**. A
separate GPT-5.5 production preflight failed model-list validation before
dispatch and is not included in that count. Full restricted extension tests
976/976, service tests 248 passed with four optional skips, and isolated
Chrome synthetic smoke passed after its stale list selector was corrected.
An independent read-only Trust review identified the initial citation-scope
gap; exact-URL, completed-tool, annotated-link and no-source corrections were
made. Its final re-review found no remaining blocker. A matching citation can
still reflect a search excerpt rather than full article access. No release,
deployment or general-site policy clearance follows.

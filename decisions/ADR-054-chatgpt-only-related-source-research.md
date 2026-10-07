# ADR-054: ChatGPT-only research of related sources

Date: 2026-10-07
Status: implemented and locally verified in extension 0.13.17; release approval remains separate

## Decision

The owner wants related-source content researched only by the connected ChatGPT
account, not fetched or extracted by the extension or local service. This
supersedes ADR-053's anonymous related-page read-first path and ADR-051's
locally supplied related-excerpt path for new Insights. The current tab remains
the subject: its bounded, reattested visible article extract is still supplied
to the model. Background local vector matching is unchanged.

On an explicit **Get insights** action, supply up to five selected related
public HTTPS article URLs to the official Responses `web_search` tool. Apply
the user's source exclusions and existing sensitive URL/path/credential rules
*before* choosing five; no extension or service HTTP preflight is made to
those sites. Existing catalog records do not contain reliable public-access
or paywall status. A publisher cannot be declared reachable from its URL or
domain, and public articles must not be excluded by a broad publisher
blacklist. The provider may fail to access one or all selected URLs. Present
only a private draft after a completed tool call. Every externally sourced
claim requires a provider citation to an exact selected URL. If none of the
five yields usable evidence, the owner explicitly wants a current-page-only
private draft based on `articlePrefix`; a missing external citation must not
discard it. The prompt must forbid unverified external claims in that case,
and the validator still rejects foreign citations and unannotated links. This
cannot mathematically prove that all claims came from the page; private
review and separate Share remain important. A citation never proves the full
article body was read. No automatic retry, share, or extra provider request
follows.

The user's related-source setting remains default-on with an opt-out and is
renamed to describe ChatGPT research. When off, or with zero eligible
candidates, the request is tool-free. Older clients' related-page excerpts
must not be forwarded to the provider under this decision. The current-page
extract is still sent on an explicit Insight request; this decision does not
authorize automatic AI calls or private-page processing.

## Trade-offs and gates

Removing direct related-page reads eliminates this extension-initiated
cross-site traffic during Insight generation, but increases dependence on
ChatGPT's hosted search and publisher access. URL/title metadata for up to
five candidates and the current-page text leave the device through the
existing paired service when the user invokes an Insight. Search may consume
ChatGPT-plan usage and may return only snippets or no usable evidence. The
strict exact-URL citation rule intentionally rejects redirects/canonical
variants until separately reviewed. There is no new browser permission,
source-text retention, publication, deployment or store-policy approval.

Official tool contract: https://developers.openai.com/api/docs/guides/tools-web-search

## Verification

The production popup no longer imports or wires the anonymous related-page
reader. It keeps at most 20 local reversible source choices but rebuilds a
five-source request after exclusions, only from that visible choice pool. The
service independently validates that request against its catalog-derived
choice pool; a six-plus-source test confirms that excluding the first source
backfills the fifth slot, while excluding all 20 never draws an unseen 21st
source. Forged backfills are rejected. An older client sending nonempty related excerpts is
rejected at the service boundary. When related research is off, the provider
payload omits related URLs/titles and uses no web tool. Tests cover one exact
candidate citation despite other inaccessible URLs, a completed search with
zero citations yielding a private current-page draft, no completed search,
foreign citations, and unsafe links. An independent read-only Trust review
found no remaining blocker; model grounding cannot be proven mechanically.

Full restricted extension suite: 981/981 passed. Full local-service suite:
253 passed, four optional skips. Loopback integration: 2/2. Both secret scans:
zero findings. An isolated Chrome smoke passed on its second run with zero
runtime exceptions and zero external extension requests; the first run timed
out on a late compact-view wait. One additional owner-approved live QA
Responses request used `gpt-6-luna` with public PEP 8/257, no locally fetched
related excerpt. It returned a private, PEP-257-cited draft and was not
shared. Cumulative live research requests under the owner's 100-request
authorization: **seven**. The updated local service was restarted with the
same Origin and retained data. Actual owner-browser behavior with extension
0.13.17 remains to be checked after reload.

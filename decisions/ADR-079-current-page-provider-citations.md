# ADR-079: The supplied current page may be a provider citation

Date: 2026-10-10.
Status: evidence-backed technical/trust correction implemented and independently
reviewed in 0.13.37. Owner permits bounded diagnostic retries.

## Observed failure

After 0.13.36 the owner reports `response-web-citation`. The running normal
service's content-free `INSIGHT_TRACE` identifies `current-source-url`, not a
missing title, bad span or unselected third-party page. The response has a
completed search, a completed assistant at stream index 2, matching created/final
identity and empty terminal output; the existing strict finalized-stream fallback
reaches citation validation and rejects the supplied primary page.

No raw failed response or page text was archived in normal mode. The trace proves
this rejection category, not the answer's factual quality or exact original
payload. Do not invent those details or claim to replay unavailable raw data.

## Narrow decision

Accept a safe provider `url_citation` to the **exact** validated
`context.currentSource.url` when research is enabled, search is consistently
completed, the assistant result is complete and the citation span is valid.
Use the already validated primary Source title as the display-title fallback.
This applies to opening Insights and bounded replies. The URL is already in the
approved provider input; no new destination is supplied for research, fetched,
embedded or granted by this correction.

ADR-056 requested separate evidence and a trust decision before changing its
current-page rejection. The observed trace and independent Trust review satisfy
that requirement: primary-page citation compatibility fits the owner's existing
deliberate public-page research scope and is not a new provider/data approval.
Opening research still inspects its selected related candidates and does not gain
ADR-078's broader discovery. All other unselected opener URLs remain rejected.
Canonical/query variants do not become the current Source by resemblance. A
broad reply can still accept a different safe provider-annotated discovered URL
under ADR-078; it counts as outside the exact primary URL, not primary identity.

Current-page annotations require the same observed response/search identity and
index reconciliation as broad citations. No-search/tool-off citations, unsafe
URLs, invalid spans, refusal, incomplete/failure events and contradictory streams
remain rejected. Existing strict completed-stream fallback, canonical targets,
account/Source/Topic guards, exact-result proof and one-use local sharing remain.
All accepted citations share the five-distinct-destination ceiling, including
the primary page; do not silently drop references beside factual claims.

The primary page's valid link renders as the existing clickable superscript
arrow. A primary-only citation must not hide the no-outside-source cue. Compare
against trusted bound context, not prose, a parsed draft URL or provider title;
any accepted non-primary citation hides that cue. No citation implies the full
page was read or the claim is true.

## Diagnostic retry approval

The owner subsequently says "you are allow to retry it automatically" while this
failure is being diagnosed. The lead interprets this as permission for bounded
agent diagnostic retries within the already approved public-page/ChatGPT scope,
not an unattended background retry policy or permission to duplicate publication.
Use at most two fresh Responses calls for this checkpoint; prefer one. Do not
retry sign-in/billing/usage-limit failures, add a paid fallback or post QA output.
Keep normal app requests one-shot; no new app-wide retry loop is implemented.

Because the exact failed article/request is not retained, a fixed public-page
probe can verify fresh transport/citation compatibility but cannot reproduce or
judge the owner's exact price question. It must use the existing protected
connection normally, exclusively own the fixed port if restoring rotating
credentials, print only counts/fixed codes, and leave pairing/SQLite/posts intact.
Normal service is restored after the probe. No credential export or browser-store
extraction; no raw output in Git or chat.

## Verification

Required: normal and strict-fallback exact primary citations, current plus
outside references, no-search/tool-off rejection, exact-versus-variant opener
URLs, malformed URLs/spans, combined five-source cap and identity contradictions.
Client tests cover primary-only/mixed/missing-context cues and clickable links.
Independent Trust, full capability-denied regressions, secret scans and synthetic
Chrome narrow-layout/citation checks must pass. Any live outcome is reported
separately and does not replace these checks or clear a release gate.

Completed evidence:

- Independent Trust passes after normal-stream opener current annotations gain
  the same response/search identity and index checks as broad replies. Final
  harness/prompt review also passes; no trust blocker remains.
- Full service: 390 pass, four optional skips. Full extension: 1,103 pass, one
  optional skip; capability-denied extension: 1,104 pass. Secret scans and diff
  checks pass. The prompt explicitly includes primary citations in the total
  five-distinct-source limit; no provider URL list is expanded.
- Disposable Chrome synthetic shared-UI QA verifies clickable exact primary and
  mixed outside links, truthful primary-only cue, narrow layout, keyboard,
  typing/nesting, zoom and reduced motion. Root reviews both screenshots;
  these browser checks dispatch no provider request.
- The explicit `--current-source-citation` one-shot harness option uses the
  fixed public MDN HTTP overview, a 4,096-character extract and bounded synthetic
  published reply context with zero related candidates. It requires explicit
  web-search/model flags, excludes raw-result printing and other fixtures, and
  preserves the one-Responses-dispatch guard and exclusive protected-login use.
- One fresh run returns a completed gpt-6-luna result: one Responses call,
  278 body characters, one exact primary citation and zero outside citations.
  Counts only are printed; no result is shared or archived. This verifies fresh
  transport/current-page citation acceptance, not the original owner's exact
  product-page failure, factual accuracy or price-search quality. A second
  diagnostic request is unnecessary.
- Normal service is restored with the original Origin, pairing, protected login
  and SQLite; raw debug is off. A final normal restart loaded the prompt sentence;
  expected unauthenticated catalog 401 confirms listener availability only.

Official OpenAI Docs were checked for provider annotation URL/title/spans and
clickable citation presentation:
[web search](https://developers.openai.com/api/docs/guides/tools-web-search).

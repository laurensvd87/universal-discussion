# ADR-018: Background page matching and shared local discussions

Status: **Owner-requested direction; exact Security/Privacy/Policy activation
package below awaits explicit approval. No background capture is active.**
Date: 2026-09-29.

## Owner direction and boundary

The owner approved connecting learned embeddings and explicitly expanded the
desired outcome beyond synthetic examples: browse pages, derive vectors in the
background, store/group them in the backend, and see a comment on other pages
about the same Topic. Resolution and comments may appear after a few seconds.
Continue autonomously toward that testable app, except at explicit approval or
missing-information gates. Use parallel GPT-6 Sol Medium coding subagents.

This accepts the outcome, not an undisclosed decision to read all sites, retain
URL/title history or move raw-content inference to a server. ADR-013/014/016
require the exact expanded capture/permissions/payload/retention package to be
accepted first. The proposed synthetic-only UI step in the prior handoff is
superseded as the destination; do not spend another milestone on a toy UI alone.
Phase 0 and the 6/6 owner review remain complete. The R5 provenance-approved
200–250-pair task is not needed for this owner-only experimental local loop.

## Proposed single approval package

1. **Scope and ongoing consent.** One owner on the existing PC/unpacked Chromium
   extension and paired `127.0.0.1:4174` backend. Background matching starts off.
   The owner enables individual HTTPS sites through a plainly disclosed control
   and Chrome's optional host-permission prompt. Once enabled, navigating those
   sites requires no popup click per page. Process only the active tab of the
   focused window, including while the popup is closed; never enumerate history
   or scan inactive tabs. Provide a global Pause/Resume and per-site removal.
   Revocation/pause invalidates pending work and stops further capture/ingestion.

2. **Initial content scope.** Public articles/product/main-content pages the owner
   may lawfully process on enabled sites. Do not enable webmail, private messages,
   banking/health/account dashboards or other confidential contexts in this first
   package. No incognito, browser-internal/file pages, frames, attachments or
   arbitrary local/intranet targets. A separate project-owned loopback fixture
   path remains available for controlled testing. This is an explicit owner
   operating scope, not a claim that a generic extractor detects authentication,
   private data or paywalls reliably. No access-control bypass or remote fetch.

3. **Exact extraction and local processing.** Browser-observed URL (maximum 2,048
   characters), page title (maximum 200), and a bounded sample of rendered text
   from an `article`, `main` or main-role region (maximum 4,096 characters).
   Exclude forms/editable fields, scripts, navigation, comments, hidden text and
   frames; no unrestricted whole-document fallback, cookies or storage reads.
   Respect supported explicit negative in-head rights signals without claiming
   they establish complete permission. If no eligible region remains, display
   unsupported/manual Topic choice. E5 consumes a deterministic prefix sample
   of at most 512 tokens including prefix/special tokens; disclose limited
   coverage in the UI. Sampling is versioned, never presented as a full-page
   analysis. Raw text exists only transiently inside the extension, then is
   released; no raw-text network, logging, persistence or AI provider.

4. **Browser runtime and permissions.** Add an MV3 background coordinator and
   `offscreen` permission; optional host patterns `https://*/*` with actual grants
   requested only for owner-selected sites. Retain existing `scripting`,
   `activeTab`, `storage` and the fixed loopback permission. Permit packaged WASM
   through the narrow CSP change `wasm-unsafe-eval`, `connect-src 'self'` for
   packaged asset reads alongside the existing fixed loopback endpoint, and
   `worker-src 'self'` if needed for packaged workers. No CDN/remote scripts,
   JS `unsafe-eval` or extra Internet endpoint. Set minimum Chrome 116 for
   `runtime.getContexts`-based offscreen lifecycle checks.
   Use the already acquired E5 graph/tokenizer and locked Tokenizers.js 0.2.0 /
   ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`, CPU WASM single-threaded,
   proxy workers disabled. Explicitly review the prerelease browser runtime
   separately from Node ORT 1.30.0. No new download or purchase is proposed.
   Local packaging copies require roughly 150 MB plus small configuration files;
   check total development footprint stays below the existing 2 GiB bound.
   Stop before a runtime/asset change if the browser path fails compatibility.

5. **Payload and durable data.** Send the current page URL, short title, one
   384-dimensional vector, model/extractor version and bounded operation
   identifiers to the paired backend on this PC only. These values can reveal
   browsing interests; vectors are not anonymous or secret by transformation.
   Do not send body excerpts, raw metadata descriptions, forms, cookies, page
   storage or a navigation timeline. Preserve functional URL identity, reject
   credential-bearing/suspicious contexts, and do not trust page canonical hints
   as authority. URL/title disclosure is intentional in this proposed package,
   not hidden inside the word 'vector'.

6. **Storage/access/deletion.** SQLite keeps only the current Source URL/title/
   vector/model version and Source-to-Topic association, Topics and deliberate
   comments until manual deletion, with bounded catalog/state and no silent
   eviction. No per-visit history, external logs/analytics, sync or backup. Keep
   existing demo contributions. Vectors/scores are never returned in UI DTOs.
   Retain exact bearer/Host/Origin checks; browser pairing remains trusted
   session-only. Store only matching preference/site settings persistently in
   the extension, not body text/vectors. This is local development isolation,
   not encryption at rest or protection against a local administrator.
   Provide distinct Pause, Forget page, Delete Topic/discussion and confirmed
   Clear learned data controls; pausing does not delete retained data. Forgetting
   a Source does not secretly delete shared comments. Disclose logical deletion
   versus SQLite/OS forensic erasure and how revisiting can recreate a Source.

7. **Experimental automatic grouping.** Permit automatic provisional assignment
   to an existing Topic, or creation of a new provisional Topic, under a versioned
   conservative similarity/ambiguity policy. Do not call scores confidence or
   reuse the fixture cutoff. Same subject alone is not Topic identity; related
   but distinct events/products/claims need separation. Ambiguous results remain
   separate/manual; offer 'wrong topic' correction. Never automatically merge
   two existing discussions, move posts, override a manually confirmed link or
   retarget an unsent comment. Pin a comment's destination to its displayed
   Topic/version; navigation or re-resolution must disable stale submission.
   This approves a fallible local test behavior, not validated AUTO for other
   users. Later shared/private/global automatic matching retains R5 and its gates.

8. **Tests and limits.** Start with owned/synthetic browser pages and mocked
   hostile DOM; verify actual packaged E5/WASM inference offline, navigation
   cancellation, persistence, deletion, permission revocation and delayed popup
   updates. The owner can then test lawful enabled public sites in a dedicated
   non-sensitive browser profile. Agent automation need not browse private or
   third-party pages to prove the mechanics. No hosted backend, LAN/tunnel, other
   users, public posts, provider, search, spending, store submission or public
   distribution is included. Those approvals remain separate.

## Implementation slices after approval

| Slice | Deliverable | Required evidence |
| --- | --- | --- |
| B1 | Browser-native E5 packaging/worker and bounded content contract | Real CPU WASM run; pinned asset integrity; token bounds; no remote loads; model-space separation |
| B2 | Generic main-region reader and background coordinator | Focused foreground/document binding; bounded queue/cancellation; Pause/site revoke; hostile DOM/unsupported states |
| B3 | Secured ingestion, SQLite catalog and provisional resolver | Idempotent writes, finite/model/size validation, stable links, conservative no-match, deletion and preserved posts |
| B4 | Delayed popup Topic/discussion integration | Processing/ready/unavailable states, stale-write protection, English message keys, wrong-topic action, keyboard checks |
| B5 | Actual Chromium end-to-end flow and owner handoff | Several related owned pages share a comment; distinct page stays separate; restart/revisit/deletion work; documented public-site manual test |

Lead owns scope, orchestration, ADR/status reconciliation and commit/push. Delegate
non-overlapping bounded coding/test slices to Sol Medium; another role reviews
security-sensitive changes before activation. B1/B3 pure work can run in parallel;
B2/B4 integration depends on stable contracts. No model/data/report publication
follows from a code commit. Keep generated assets and real browsing data ignored.

## Engineering findings and policy evidence

The existing manifest has no background worker or offscreen document and only
the old active-tab/scripting/storage/loopback grants. Browser workers, foreground
observation and real Source ingestion do not exist. The current Source contract
already retains URL/title/embedding for fixtures, but only explicit fixture links
assign Topics. Existing discussion controllers provide useful stale-request and
detached-draft behavior to preserve, not replace.

Read-only asset inspection found E5 graph 118,308,185 bytes, tokenizer 17,082,730,
Tokenizers.js 98,937, and ORT CPU WASM 14,264,838 plus small loader modules.
This establishes local availability, not browser operator/CSP/performance/parity
success. Use a separate browser vector-space identity until numeric and ranking
parity with the Node reference is actually certified.

The ADR-017 synthetic no-match cases still had E5 cosine values around 0.78–0.84.
Consequently proximity alone, particularly the old 0.65 fixture threshold, cannot
establish same-Topic identity. Freeze and label any local heuristic as experimental;
do not turn the 64 descriptors into held-out production quality evidence.

Checked 2026-09-29: Chrome supports optional per-origin access requested by a
user gesture; offscreen documents require a distinct permission and expose only
the runtime extension API. The coordinator therefore owns permission/pairing/API
access; the offscreen document owns bundled inference. Browsing-derived data
remains user data even when transformed. These are engineering/policy findings,
not legal advice or store approval:

- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

## Supersession on acceptance only

Owner acceptance of this exact package would supersede ADR-013's gesture-only/
ephemeral-query proposal and ADR-014/016's fixture-only/no-auto limits **only for
this owner-only local test**. It would not authorize private-message/background
inbox support, remote vectors/raw content, external testers or release. The old
6/6 task remains finished; later independent policy/rights and R5 reviews remain.

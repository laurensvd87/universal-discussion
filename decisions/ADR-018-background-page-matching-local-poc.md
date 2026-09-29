# ADR-018: Background page matching and shared local discussions

Status: **Owner approved the exact Security/Privacy/Policy package below on
2026-09-29 ("approved"). B1–B5 implemented and browser-tested; capture defaults off.**
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

## Approved single activation package

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
   The original negative in-head metadata veto is superseded for this owner-only
   PoC by the 0.6.5 working-assumption amendment below; metadata is neither a
   permission grant nor a matching veto here. If no eligible region remains, display
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

## Implementation slices

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

Implementation refinements inside the approved scope: ingestion uses an expected
generation/revision fence, one current operation receipt per Source and no visit
ledger. Local provisional matching uses cosine >=0.94 against every compatible
Topic member and >=0.04 margin against the nearest member of competing Topics;
related-reading suggestions use >=0.85. These frozen v1 heuristics are explicitly
unvalidated and scores are not UI confidence. Existing links remain stable on
revisit; all corrections are explicit. Deletion removes vectors and receipts,
including orphan learned Topics via clear/delete controls, without purging demo
data. Exact source text is neither persisted nor accepted by the HTTP handler.

Actual Chrome 154 CPU inference passed for both packaged document and dedicated
worker paths; the current runtime works without new assets or substitutions.
Browser vectors still use a separate model-space identity: one synthetic smoke
does not certify numeric/ranking parity across Node, browsers or mobile devices.

Owner-feedback refinement (0.6.1): expose only a fixed foreground-context reason
in the existing worker-to-popup status contract when Enable is unavailable.
This adds no history, page content, logs, storage, backend fields or permissions.
Do not weaken the foreground/active-tab/complete-document and site-consent
requirements to hide a UI failure. A successful synthetic HTTPS eligibility test
does not identify the cause of a failed owner-page attempt.

Popup-focus correction (0.6.2): the owner reports the `window-unfocused`
diagnostic while using the action popup. Treat a freshly attested focused,
visible packaged action popup as foreground interaction with its own normal
browser window, even if that window's `focused` flag is false. The ordinary
focused-window path remains; never accept merely the last-focused window.
Authenticate the popup's live runtime port using Chrome-supplied own-extension
ID, exact packaged popup URL and absence of a tab sender. When Chrome supplies
the optional sender document ID, require its exact live `POPUP` context. Real
Chrome 154 action-popup ports omit that ID: in that case a compatible live
`POPUP` context corroborates existence, not a same-document identity join. The
authenticated port and trusted packaged responder are the authority. This relies
on the current package having no other tabless focusable `popup.html` surface:
no web-accessible resources, side panel, DevTools page or overrides, and offscreen
inference has a different fixed HTML path. Re-review before adding such surfaces.
A bounded fresh challenge
checks popup focus/visibility and its current parent window; no cached positive
focus, grace period, arbitrary window ID, tab-hosted popup or background lease.
Blur, close, unavailable/mismatched context and late replies must fail closed.
Preserve all active-tab, navigation, permissions, site-consent, pairing and
document-attestation fences. This changes the foreground witness, not the
approved capture/retention scope; no new permission, backend field or storage.

Chrome's [window API](https://developer.chrome.com/docs/extensions/reference/api/windows)
distinguishes the current associated window from its focus flag. Its
[runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime)
provides port sender document identity and live extension contexts. A local
Chrome 154 probe found the optional port document ID absent and action-popup
context `windowId = -1`, so those fields
cannot bind the parent; obtain it freshly from the trusted popup. Do not join
`WindowClient.id` to extension `documentId`: they differ in the probe. The
headless probe does not reproduce the owner's OS-focus behavior; regression
tests must explicitly label an injected false parent-focus flag, and owner
confirmation is still needed after the correction.

Diagnostic refinement (0.6.3): the owner's subsequent `context-unavailable`
report does not prove a window-identification failure. The old fallback combined
loading/incognito/navigation and focus-expiry failures under that text. Separate
only bounded reason enums for window/tab query failures, missing/changed context
and focus expiry/lifecycle change; keep raw Chrome errors out of the DTO and UI.
Classify invalid initial tabs before fallback revalidation and stop querying tabs
after a failed window recheck. Keep the original 500 ms deadline and single-flight
challenge; possible API latency or an inherited pending-challenge deadline is a
hypothesis, not a measured cause or authority to widen the bound. No new collection,
logs, storage, permissions or eligibility bypass. Fault-injection/recovery evidence
must remain distinct from confirmation of the owner's actual browser behavior.

Unsupported-state recovery (0.6.4): a missing foreground observation must be
distinguished from invalid page URLs and reader rejection. An enabled, selected
site with a fresh eligible foreground may schedule the existing fully fenced
refresh when the previous state is exactly `unsupported/no-focused-page` with no
tab/URL. This is recovery of approved ongoing matching, not authority granted by
a status request. Re-read consent, permission, pairing and foreground before
capture; immediate invalidation prevents status polling from postponing work.
Never auto-retry actual reader restrictions/missing-region/budget/document errors
through this path. Expose only fixed allowlisted unsupported codes and localized
guidance. The reader, rights checks, resource limits, collection, storage and
permissions remain unchanged. A restriction code describes prototype behavior,
not legal permission or prohibition. The owner's actual rejection is still unknown.

## Owner-approved local working assumption (0.6.5) — 2026-09-29

After being asked specifically whether freely readable pages with an explicit
processing reservation should still be blocked, the owner answered:
"wir machen vectoren daraus zum matchen. wir müssen davon ausgehen dass das
erlaubt ist, sonst geht das ganze konzept in die tonne". In that context this is
the owner's explicit direction to proceed with local vector matching under a
permission assumption, including that reservation case. Do not repeat the same
approval question or present the earlier three-preview proposal as the decision.

For this single-owner, unpacked, local-only PoC, remove the real-page collector's
`robots`, `googlebot` and `tdm-reservation` metadata veto entirely. These values
are not parsed, transmitted or stored; there is no per-page rights/advisory DTO.
Unknown, empty, malformed or conflicting values also do not veto collection by
themselves. The bounded head traversal and title extraction remain. Keep the
legacy `rights-restricted` projection for compatibility; the new collector does
not emit it solely from these tags. The frozen metadata-only experiment stays
unchanged. English UI disclosure must state the working assumption and absence
of legal/store clearance.

This supersedes only the metadata stop in package item 3. All per-site grants,
default-off/Pause/revocation, foreground/document binding, URL/private-context
policy, visible main-region/form/comment/hidden/paywall-container exclusions,
resource bounds, inference, exact loopback payload and retention/deletion rules
remain. No whole-body fallback, access-control bypass, authentication/private-page
expansion, automatic site grant, new field, permission, endpoint, model download
or data migration. Existing owner-granted sites stay granted under this expressly
requested amendment; no new grant-reset workflow is necessary for this one-owner
test. Structural exclusions are not reliable private/paywall detection.

This records product-owner risk acceptance, **not a finding that vectors make
processing lawful**. Copyright, contract, privacy and platform applicability
remain unresolved; the necessity of a feature does not prove permission. Public
visibility, local processing and withholding raw text do not independently
establish blanket clearance. The primary sources below remain relevant, including
[Directive 2019/790](https://eur-lex.europa.eu/legal-content/EN-FR/TXT/?uri=CELEX%3A32019L0790)
and the [Chrome Web Store IP policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property).
No claim that this app definitely falls inside or outside a legal exception is
made. Before external testers, distribution, store submission or remote use,
reassess the applicable law/terms/platform policy and obtain the separate owner
approval; neither this amendment nor an AI code review provides that clearance.

Focused tests use only project-created public-page fixtures: formerly rejected
metadata now passes, while content/identity/budget exclusions and payload shape
remain protected. The exact publisher tag that triggered the owner's report is
still unverified. Removing this gate does not guarantee that the particular page
passes other checks or that all freely accessible sites are supported.

## Historical preview proposal — superseded by the 0.6.5 amendment

The following records the earlier investigation and unanswered question at that
time, not a current stop instruction. The owner's response above resolves the
local project-policy choice, not the legal uncertainty.

The owner reports `rights-restricted` on a public article. The exact page tag
could not be verified through the research browser; do not treat a synthetic
reproduction as observed publisher policy. The actual collector rejects every
`robots`/`googlebot` token except `all`, `index`, `follow`. A read-only, capability-
denied 32-assertion probe confirmed that it also rejects these declarations:

- `max-image-preview:large`: allows a larger Search image preview.
- `max-snippet:-1`: no specified Search text-snippet character limit.
- `max-video-preview:-1`: no Search video-preview duration limit.

Technical meanings verified against [Google's official robots metadata reference](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
on 2026-09-29. This describes Google's indexing/serving behavior, not permission
for our product's content processing, a publisher contract or store acceptance.
No inference that these directives grant a reuse licence is authorized.

**Proposed, not yet approved or implemented:** add only these three explicit
declarations to the existing positive allowlist, with bounded parsing and tests.
Keep the existing `noindex`, `nofollow`, `nosnippet`, `noai` and all other negative,
unknown, empty or malformed values blocked. A negative/unknown value mixed with
an allowed value or present in another relevant meta tag still blocks; preserve
the current `tdm-reservation` behavior (only exact normalized `0` is accepted).
Do not switch to a permissive denylist or add a site-specific exception. All
foreground, public-site consent, region/visibility/resource, inference, payload
and retention rules stay unchanged. The frozen older metadata-only experiment
is not widened by this proposal. New parser tests should cover positive preview
values, whitespace/case variants, conflicts, unknowns, negatives and TDM controls.

This changes which pages the prototype accepts, so ask the owner explicitly
before implementing. Approval is only a project-policy decision, not a legal
clearance. Do not promise the reported article will work: its trigger may be an
actual restriction that remains blocked. Until approval, leave 0.6.4 and the
existing gate intact. No new browser permissions, endpoint, model, raw-content
transfer or stored fields are proposed.

Owner follow-up: **"frei zugängliche seiten sollten alle erlaubt sein"**.
This states the desired general public-page coverage but leaves an important
exception unresolved: a freely readable article can still carry an express
processing reservation. Do not silently interpret the statement as either exact
acceptance of the three-token package above or permission to ignore TDM/AI signals.
The recommended revised direction is to distinguish documented Search-only
controls from explicit supported processing objections, preserving per-site
consent, public-only operating scope and bounded unknown/malformed handling.
Ask one concrete question about the explicit-objection case before implementation;
other implementation details remain delegated to engineering after the boundary
is settled. Manual Topic choice remains available when capture is unavailable.

Checked 2026-09-29: Google's reference describes `noindex`/`nofollow` and preview
controls as Search indexing/serving controls, not a general processing licence.
[Directive 2019/790, Article 4](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32019L0790)
conditions its general TDM exception on the absence of an appropriate express
reservation; this is not a conclusion about which exception covers this app.
The [TDMRep Community Group specification](https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240510/)
defines a machine-readable reservation mechanism, but is explicitly not a W3C
Standard or a universal legal test. The [Chrome Web Store IP policy](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property)
requires respect for intellectual-property rights; it does not certify a metadata
algorithm. These sources support keeping access, Search directives, processing
policy and store readiness distinct. No conclusion that every public page is
legally processable or that the owner's specific page is restricted follows.
No product code, version, collection, retention or permission changes are made
while this policy boundary remains unresolved.

## Planning findings (before implementation) and policy evidence

The following baseline inventory records what was missing when this package was
proposed. Implementation has since added these pieces and verified browser CPU
inference; current evidence and remaining work are recorded in STATUS.

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

## Scoped supersession on owner acceptance

Owner acceptance of this exact package supersedes ADR-013's gesture-only/
ephemeral-query proposal and ADR-014/016's fixture-only/no-auto limits **only for
this owner-only local test**. It does not authorize private-message/background
inbox support, remote vectors/raw content, external testers or release. The old
6/6 task remains finished; later independent policy/rights and R5 reviews remain.

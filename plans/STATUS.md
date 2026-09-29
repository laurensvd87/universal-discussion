# Project status

Updated: 2026-09-29. Active direction: ADR-014/015/016 and the product-first roadmap.
ADR-017's synthetic-only local experiment is implemented and measured. The owner
now requests the real-page background -> vector -> local Topic -> shared-comment
loop. [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md) records
the exact expanded Security/Privacy/Policy package explicitly approved by the
owner on 2026-09-29. **B1–B5 are implemented and verified in actual Chrome**,
with capture default-off and site-by-site enablement. The owner now confirms Enable
is clickable but the page remains unsupported. Extension 0.6.4 fixes a reproduced
stale foreground-failure state and exposes the actual unsupported reason; the
owner's page outcome is still unconfirmed. Matching quality remains unvalidated.
Previous detailed chronology is preserved in
[the historical status](archive/STATUS_2026-09-25.md).

## Where we are

We have a tested local service and a usable on-device semantic discussion prototype.
The core product hypotheses—semantic concentration, personal AI utility and
community adoption—remain unvalidated. Stop expanding review infrastructure.
The requested browsing -> local embedding -> provisional Topic -> shared-comment
loop is built. Next gather owner feedback within the approved scope; broader
private/remote/AI/moderation work and all external release gates remain separate.

## Owner feedback: disabled site controls — 2026-09-29

- Latest owner report: the public site's origin is displayed and **Enable is
  clickable**, but its activation leaves "No eligible public main-region context".
  Do not ask the owner to repeat the checkbox/Enable instructions again.
- Confirmed code bug, independently reproduced with capability-denied mocks:
  null foreground published `unsupported/invalid-url` before any content read;
  a later status showed an eligible origin but never restarted matching.
  **0.6.4** reports `no-focused-page` accurately and schedules the existing fenced
  400 ms refresh only when fresh foreground, enabled preferences and selected
  origin agree and the prior failure has no tab/URL. Immediate invalidation means
  repeated polling cannot defer the refresh. Reader rejections never trigger it.
- The popup now displays allowlisted unsupported guidance and fixed diagnostic
  codes instead of claiming every failure means no main region. Unknown reasons
  are not echoed. Extraction, rights rules, the 500 ms focus bound, permissions,
  backend payloads and retention are unchanged. The owner's actual reason is not
  yet known; a confirmed generic recovery bug is not a confirmed site diagnosis.
- Full restricted suite **523/523**, indicator suite **341/341**; separate AI Trust
  review accepts the slice and independently passes **177/177** focused checks.
  Normal suite: 522 pass / one intentional guard-only skip. Secret scan: 140 files,
  zero findings. Actual Chrome 154 passes **21 eligibility
  checks**, now including stale foreground recovery without a browser event and
  the retained real host-permission gate. Only disposable synthetic preferences
  were seeded/removed. No external requests, exceptions, model loads, content
  capture or backend access. No owner browser/profile/service/data touched.
- Next owner action: reload **0.6.4**, reopen on the enabled public article, and
  report the specific unsupported message/code if it remains. No backend restart,
  data reset or repeated owner-review task. Successful matching is still unconfirmed.
- Separate reproduced follow-up, not fixed by this slice: a transient failed
  `authorized()` observation after a successful read can leave `processing/reading`
  without recovery if no lifecycle event follows. It prevents ingestion but may
  strand the UI. Address with a separately tested cancellation/state transition;
  do not broaden this limited initial-foreground retry into repeated content reads.

- Previous owner report on 0.6.2: **context-unavailable** ("Chrome could not identify
  the current browser window"). This did not isolate a window failure: mock
  reproduction showed valid focused popups with loading/pending/incognito tabs,
  navigation and an expired focus witness could all produce that generic text.
  No particular one is yet established on the owner's browser.
- **0.6.3** separates missing/query-failed/changed windows, tab-query failures and
  identity changes, focus expiry/lifecycle changes and normal tab eligibility.
  Invalid initial tabs are classified before fallback revalidation; an invalid
  rechecked window stops before another tab query. Acceptance is equivalent or
  stricter; the 500 ms focus deadline, per-site consent and capture fences remain.
  Only fixed enums cross to the popup; no raw errors, logs, permissions or storage.
- Actual Chrome 154 passes **19 eligibility checks**, including four injected
  tab-query fault/recovery pairs with a real focused popup and simulated unfocused
  parent. No external requests, exceptions, inference, assets or backend access.
  Full restricted suite **484/484**, indicator suite **302/302**, separate AI
  Trust review's focused suite **109/109**. Normal suite: 483 pass / one intentional
  guard-only skip. Secret scan: 140 files, zero findings.
  These are regression results, not reproduction of the owner's OS/site failure.
- Previous owner action: reload to **0.6.3**, reopen on the public article and report
  the exact message still shown after a few seconds. Do not repeat the old focus
  instructions as a presumed fix. Keep the existing backend/data; no restart or
  reset is needed for this diagnosis. Owner success remains unconfirmed.

- Historical 0.6.2 follow-up and evidence:
- Follow-up: owner confirms **window-unfocused** while using the action popup.
  The extension must account for foreground interaction with its own focused
  popup, not equate the parent-window flag with all browser interaction. The
  0.6.2 correction is implemented: fresh bounded authenticated popup focus,
  visibility and parent-window checks; no positive focus cache or wider scope.
  Real Chrome 154 testing found popup port sender document IDs are optional and
  absent here; retain exact-ID validation when available, otherwise authenticate
  the live own-extension/exact-popup/no-tab port and trusted responder. The
  [ADR refinement](../decisions/ADR-018-background-page-matching-local-poc.md)
  states the exact package assumptions. Do not claim headful reproduction or
  owner success from an injected parent-focus flag in headless Chrome.
- Actual Chrome 154 passes all **11 eligibility/focus checks** after the fix,
  including the injected false parent flag with real popup focus, injected blur,
  focus restoration and wrong-window rejection. No external requests, runtime
  exceptions, model loads or backend access; temporary profile cleaned. The
  focused restricted suite passes 46/46 and the indicator suite 253/253; separate
  AI Trust review accepts the scoped correction. Full restricted suite 435/435;
  normal suite 434 pass / one intentional guard-only skip. Secret scan: 140 files, zero
  findings. The earlier 0.6.1 diagnostic commit is now committed and pushed.
- Previous owner action: reload to **0.6.2**, revisit the public article, reopen the
  popup and try Enable. Keep Developer mode enabled; the DevTools window is a
  separate thing. This is a tested handling of the reported focus condition,
  not confirmation that the owner's exact browser behavior is already resolved.

- The owner reports all four matching controls disabled with checked consent,
  first on an internal Chrome page and then on a public HTTPS article. The
  supplied HTTPS address passes the syntactic URL policy; article extraction
  happens later and cannot explain a missing eligible origin at this stage.
- A fresh-profile actual-Chrome probe confirms temporary action-popup access
  supplies the HTTPS URL to the worker before an optional host grant. Enable
  becomes available with consent on the owned synthetic article. This does not
  reproduce or establish the cause of the owner's public-site failure.
- Patch 0.6.1 exposes a bounded foreground-context reason beside Enable, clears
  stale site details on worker failure and replaces the misleading disabled
  wait cursor. Focus, active-tab, URL, completion, permission and consent gates
  remain unchanged; no wider capture, logging, persistence or permissions.
- Focused tests pass 45/45; complete restricted suite 399/399; normal suite
  passes with its intentional guard-only skip; indicator/client suite 217/217.
  Secret scan: 138 files, zero findings; 57 local documentation links resolve.
  Separate AI Trust review found no material defect. Actual Chrome 154 passes
  the seven-check HTTPS eligibility regression, including visible rejection
  guidance, disabled cursor and consent-before-grant behavior. One owned article
  and its favicon were fulfilled locally; no external requests, exceptions,
  inference contexts, model loads, service listener or owner data access.
- The 0.6.1 diagnostic request is complete: owner supplied `window-unfocused`.
  Do not repeat it or request tokens, storage dumps or private page material.

## New owner direction and next gate — 2026-09-29

- Owner answered **"approved"** to the complete ADR-018 package. Browser inference,
  bounded main-content extraction and backend ingestion/matching are assigned to
  separate Sol Medium agents; the lead owns integration, security review and QA.
- Owner approves connecting learned matching and asks for a testable real-page
  browsing loop with background vectors, durable backend grouping and comments
  shared across similar pages, allowing asynchronous resolution. Work should
  continue autonomously except at genuine approval/information boundaries.
- Owner explicitly reiterates parallel subagents. Two Sol Medium read-only
  inspections ran in parallel: browser/background implementation and Trust/data/
  matching review. The lead reconciled a single ADR-018 approval package and B1–B5
  plan, rather than another synthetic-only UI milestone or per-module interview.
- Approved scope: optional per-site background read/WASM permissions,
  public main-content sample, persisted URL/title/vector payload on this PC,
  deletion controls and fallible provisional automatic grouping. Private inboxes,
  off-device transfer, deployment and publication are excluded from this package.
- No new model download is inherently needed; approximately 150 MB of existing
  assets are now packaged locally. Actual browser WASM execution passed B1;
  cross-runtime/mobile parity remains unverified. The exact package
  has now been approved; the completed 6/6 review stays finished.
- Separate AI Trust review found the package coherent for one bundled approval
  request; sensitive URL rejection and complete matching-state deletion remain
  focused implementation checks. The earlier documentation-only preparation
  checked 55 local links and changed no product code; implemented evidence follows.

## ADR-018 implementation completed

- B1 packaged browser E5 is implemented and actually tested in Chrome
  154.0.8037.58: direct inference plus background -> offscreen -> dedicated worker,
  finite normalized 384D outputs, zero external extension requests and zero
  runtime exceptions. Cold direct run about 3.6 seconds; three worker samples
  about 1.3 seconds combined. These are one-PC mechanics, not mobile benchmarks
  or quality validation. The browser space stays distinct from Node.
- Nine pinned assets copied locally (149,832,250 bytes); experiment plus extension
  footprint 1,614,594,675 bytes, below 2 GiB. No new acquisition. Generated assets
  remain ignored; redistribution/license/store approval is not implied.
- B2 main-region capture, document attestation, default-off site preferences,
  foreground coordinator and cancellable inference are implemented. Separate
  Trust review found and verified fixes for delayed pause/revocation writes,
  stale enable-after-pause, unbounded queued text and 401 pairing cleanup.
- B3 ingestion, conservative provisional grouping, persistent current vectors,
  correction/forget/delete/clear are implemented. Service tests 67/67 passed at
  this checkpoint; client ingestion checks pass without raw-body or score DTOs.
- B4 delayed popup resolution and controls are implemented. Review identified
  and verified fixes for orphan learned-Topic deletion visibility and keyboard
  focus across polling; focused UI/client tests passed. Final UI hardening also
  preserves dropdown options and clears destructive confirmations on context
  changes. Full spike restricted suite passes 396/396; indicator checks 214/214.
  No remaining material issue in the separate
  AI Trust review; this is not independent-human/legal/store certification.
- B5 passed all 14 real-Chrome checks: popup-closed inference, two paraphrased pages
  sharing a Topic/comment, unrelated page separation, Pause/Resume, rights/form
  rejection, SQLite restart/new pairing, correction preserving old comments,
  Forget, confirmed deletion/clear and site removal. Four 384D vectors, six owned
  intercepted documents, zero raw-text API payloads, external extension requests
  or runtime exceptions; latest full run about 11.7 seconds. Original S3 browser
  smoke also passed its 19 categories. Temporary profiles/databases/listeners
  were cleaned; no existing owner data was touched. The owner stopped their
  preexisting listener with Ctrl+C to free port 4174; transport tests passed 2/2.
- [Implementation review and retained limits](../research/ADR018_IMPLEMENTATION_REVIEW_2026-09-29.md)
  records evidence. Real HTTPS optional-permission prompts and matching accuracy
  on owner-selected websites remain owner testing, not results inferred from
  intercepted fixtures. No new approval is needed for the already-approved scope.
- Final normal suite: 396 tests, 395 pass and the intentional restricted-guard
  skip. Both secret scans found zero findings (137 spike / 48 service files);
  all 67 checked local documentation links resolve and `git diff --check` passes.

| Capability | Actual state |
| --- | --- |
| Exact URL/fingerprint resolution | Implemented on synthetic fixtures; not semantic similarity |
| Chromium URL lookup | Bundled example.com/example.org mappings only |
| Metadata capture | Controlled loopback fixture and one pinned MDN route only; explicit button, no body/egress/storage |
| Review/evaluation tooling | Implemented mechanics; no real larger corpus or held-out model results |
| Synthetic owner review | Finished: 6/6. Do not repeat |
| Related-page discovery | Service ranks retained compatible learned Sources; fixture recommendations remain separately labelled; no web search |
| Discussions and replies | Local human Topic create/select, roots/replies/edit/withdraw implemented in service and extension; no private/AI/moderation controls yet |
| Local persistence | Memory and SQLite adapters; app DB ignored. Pairing token only in trusted session storage; drafts only popup memory |
| Current-tab auto-load | Paired popup loads catalog and delayed selected-site page resolution; older reserved-domain fixture lookup remains when matching is off |
| Learned embeddings/general same-Topic matching | Browser E5 + bounded main-region extraction and local provisional grouping implemented; actual shared-comment and lifecycle smoke passed; no validated production AUTO |
| AI handoff/import/provider | Planned; no inference or real credentials |
| Local backend | S1–S3 fixed loopback service, SQLite, session-paired thin client; actual socket and Chrome checks pass |
| Real accounts/mobile/hosting/stores | Not implemented, deployed or submitted |

## Local embedding experiment completed 2026-09-29

- Frozen corpus/scoring committed and pushed at `821baf7` before inference.
  Measured lexical, full/sliced float32 static controls, two compact int8 packs
  and E5. Source assets, derivative packs, vectors and reports stay ignored/local.
- Model/runtime archives were pinned and byte-verified. Offline installation
  disabled every lifecycle script; the CPU runner disables JavaScript network,
  DNS and subprocess APIs. No service listener, extension change, new permission,
  real-page input, upload, search or provider was activated.
- Acquisition accounting: 802,637,843 bytes including a 64 MiB metadata/HTTP reserve;
  measured full workspace footprint about 1.47 GB, below 1 GiB transfer / 2 GiB
  installed caps. This is a development workspace, not an end-user app size.
- Lead review favors E5 as the contextual quality reference for the next bounded
  on-device prototype; the compact static model remains a size alternative.
  Neither supports automatic Topic joins based on this smoke test. English and
  cross-language metrics, difficult distinctions, no-match diagnostics, CPU and
  whole-process memory are recorded separately in ignored reports. No global
  language-quality, mobile runtime or production-model selection claim.
- Focused checks 54/54; actual-asset integration 4/4; existing service regressions
  51/51. Spike normal/restricted/indicator suites pass (normal retains its one
  intentional guard-only skip); both secret scans report zero findings. No new
  listener or browser smoke was needed for this isolated CLI-only increment.
  The experiment remained isolated from the then-fixture-only interactive app.
- Its next step was the owner-reviewed browser/device packaging and interactive
  input plan, now approved and implemented as ADR-018 above.
  The completed 6/6 task and later provenance-approved R5 review remain untouched.
- Separate AI review returned qualified accept of the acquisition/runtime and
  evidence interpretation. A final review finding was corrected and regression-
  tested: a missing ledger-recorded artifact now stops before any new request.
  This review is not independent-human, legal or store certification. All 56
  checked current-document links resolve; `git diff --check` passes.

Earlier approval/research chronology:

- Owner answered **"approved"** to the revised ADR-017 package. Begin the bounded
  local compact-static/E5 experiment; preserve source/derived-data locality,
  1 GiB download / 2 GiB installed caps and all later gates.
- Lead owns acquisition/dependency review/integration; GPT-6 Sol Medium agents
  receive bounded non-overlapping encoder and fixture/evaluation tasks. No
  repeated Phase 0 or 6/6 owner review. Earlier research evidence follows.
- Prepared the frozen 64-descriptor corpus/evaluator and bounded static-table
  parser/quantizer. Initial focused offline tests: 33/33 pass. Acquisition review
  requires concurrency, path and cumulative metadata-limit corrections before
  model downloads. No model inference has run. Runtime lock generation fetched
  registry metadata only, with installation scripts disabled.

- Researched official model cards, licenses, artifact sizes and runtime releases.
  The first Granite/E5 shortlist is superseded by a size-focused comparison:
  compact multilingual static variants versus E5-small and a lexical baseline.
- [Research and options](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md) and
  [approved exact package](../decisions/ADR-017-local-embedding-experiment.md)
  describe revised assets/runtime, download bounds, 64 synthetic multilingual descriptors,
  local-only inference, retained local artifacts and later review gates.
- Owner clarified global scope with English the first priority. Preserve one
  compatible multilingual space across users/platforms; unrelated language
  models are not interchangeable. [Size-focused research](../research/SMALL_EMBEDDING_FOOTPRINT_2026-09-29.md)
  distinguishes English-only tiny models, estimated 16.5/30.1 MB static packs,
  contextual-model footprints and unsupported zero-download native shortcuts.
  No compact pack is built or quality-tested; small size alone cannot choose it.
- The revised comparison needs approximately 572 MB of source assets before
  dependencies, still capped at 1 GiB download / 2 GiB installed for development.
  End users would receive one selected pack, not the whole experiment or Node.
- The owner's privacy question prompted an explicit deployment distinction:
  today's PC-local process is on-device; future hosting must not silently move
  raw-content processing there. Separate local derivation from remote matching;
  sensitive vector transfer still requires its own approval (ADR-013).
- Read-only code review and synthetic 384/768/1,024-dimensional ranker/state
  probes passed. This is structural compatibility only, not actual model quality,
  speed, memory use or browser/mobile inference evidence.
- No model/package installation, inference, listener, real-page capture or new
  permission. Product suites were not rerun for this research/documentation work.
  This describes the earlier research stage; the owner has now approved the
  bounded package above. S4 and expanded inputs remain unapproved.
- Earlier documentation checks: `git diff --check` passed; all 47 local Markdown
  links across five documents resolved before the size/global-language revision.
- Earlier separate AI Trust/architecture review returned qualified ACCEPT of that proposal;
  clarified total-token accounting and public-catalog local matching. This is not
  owner activation approval, a dependency audit or independent legal/store review.
- A bounded platform investigation found no documented common built-in embedding
  space across Chrome/Android/iOS. Native APIs do not remove model compatibility
  or download concerns; extension model-data delivery/CSP still needs exact review.
- Revised documentation checks: `git diff --check` passes; all 53 local Markdown
  links across six documents resolve. Size arithmetic and the 64-item language
  allocation were independently checked. Separate AI Trust/architecture review
  found no blocker; clarified vector-space identity versus runtime provenance,
  retaining parity certification before cross-platform comparisons. No model ran.

## Reassessment completed 2026-09-27–28

- Audited code against documentation and ran the current suites. Preserved
  completed experiment evidence without claiming product readiness.
- Recorded provider-neutral matching without a crawler, content-kind-aware
  Topic granularity, optional local embeddings and user-confirmed associations.
- Researched official AI-host connectors and manual handoff for subscription
  users without API keys. No provider integration or subscription proxy built.
- Corrected mobile policy requirements: personal user blocking, reports and
  moderated public UGC; selected private AI-output reporting without broad
  moderator access. Qualified retention, account-rights and appeal claims.
- Replaced the per-module approval sequence with a bounded local envelope and
  explicit meaningful external/data gates. Preserved old records as history.
- Implemented metadata lifecycle invalidation for the post-attestation same-URL
  reload race. Pending and resolved snapshots clear on source-tab changes;
  listeners are removed on reset/retry/disposal. No new permissions or capture.
  Code commit: `f8947a2`.

Research: `research/PRODUCT_RESET_2026-09-27.md` and
`research/PRODUCT_RESET_POLICY_2026-09-27.md`. Decision: ADR-014.

## Related-source increment completed 2026-09-28

- Owner accepted personal utility before community volume and proposed related
  pages as a standalone reason to use the app. ADR-015 prioritizes early real
  embeddings and source discovery alongside R1; no fake populated forum.
- Implemented a bounded browser-neutral candidate ranker, deterministic duplicate
  handling and strict model/dimension compatibility. Similarity never assigns a
  Topic. Existing same-Topic associations and related reading render separately.
- Added an English message pack and an isolated zero-post demo panel. Six bundled
  synthetic Sources have explicitly hand-authored vectors, not learned embeddings.
  No source-tab observation, network, storage or additional permission enters it.
- Researched provider-independent known-source ranking, ordinary-search handoff,
  Brave/Exa pricing and reuse restrictions, and Common Crawl tradeoffs. No provider
  selected; no API request, download, paid account or external integration made.
- Follow-up research covers recurring Brave/Tavily/Parallel free allowances and
  on-visit background lookup feasibility. Neither a provider nor passive browsing
  observation is approved or activated by the owner's feasibility question.
- Updated only generated unit-test digest snapshots for the expanded provenance
  manifest. The actual owner ledger and its completed 6/6 task are untouched.

Evidence: `research/RELATED_PAGE_DISCOVERY_2026-09-28.md`; ADR-015.

## Service-first orchestration completed 2026-09-28

- Owner deferred external search and requested a cheaper-model implementation
  handoff with explicit return-to-GPT-6-Astra checkpoints.
- Owner requested embeddings, linked pages and application state on a local
  server now to simplify later hosting. ADR-016 supersedes the canonical
  extension IndexedDB plan: one Node service, replaceable repository/embedding
  adapters, SQLite locally, versioned API and a thin extension client.
- [IMPLEMENTATION_HANDOFF](IMPLEMENTATION_HANDOFF.md) froze the now-completed S1/S2 block:
  pure domain/catalog, memory/SQLite repository and secured in-process handler.
  No listener, new extension permission, model asset or real input is activated.
- The first stop was Astra review and explicit owner approval of the exact
  loopback/pairing/permissions/payload/retention package before S3 integration.
  Both checkpoints are now complete; see the S3 approval record below.
  Later model, data, provider and deployment gates remain explicit. Returning to
  Astra is a review checkpoint, never a substitute for owner approval.
- Checked Node 24.19.0 and an in-memory `node:sqlite` probe (SQLite 3.53.3).
  No disk database or socket was created. The built-in module has release-candidate
  stability; the adapter isolates it and hosting requires revalidation.

The orchestration-only baseline was `9e48916`; S1 was committed as `324163e`.

## Local-service S1/S2 completed 2026-09-28

- Added `apps/local-service` with no external dependencies. Its pure domain owns
  separate Sources, confirmed Source links, Topics, Discussions and Contributions.
  The catalog reuses six project-created fixtures and the existing pure ranker;
  vectors remain labelled hand-authored demo coordinates, not learned embeddings.
- Implemented create Topic, human root/reply/edit/withdraw, grouped deterministic
  views, ownership checks, revision purge on withdrawal, synthetic actor registry,
  resource bounds and generation/revision compare-and-swap. Related suggestions
  never create Topic links; API DTOs expose neither vectors nor similarity scores.
- Added interchangeable memory and built-in `node:sqlite` repositories. SQLite
  uses prepared statements, transactions and one bounded `demo-state/v1` record.
  Reopen, concurrent stale writes, rollback, reset, unknown schema, malformed and
  structurally manipulated state are covered. Logical deletion is not claimed as
  forensic erasure; unknown/corrupt databases are never silently overwritten.
- Added a transport-neutral `/v1` handler and dormant composition point. Exact
  Host and bearer are mandatory; supplied Origin must match, preflight is narrow,
  request/response shapes and sizes are bounded, errors are generic, and arbitrary
  URL/path/model/provider operations do not exist. The handler was tested only
  in-process under the existing socket/DNS/fetch/subprocess denial harness.
- No HTTP server implementation or `.listen()` call exists. `test:integration`
  is an intentional failing approval gate. No extension file/permission, real
  page input, model asset, external request or disk database in the repository
  was added. At completion the stop was Astra/Trust review plus explicit ADR-016
  owner approval; both are now complete, as recorded below.

## S3 owner approval recorded 2026-09-28

- After the corrected S1/S2 review, the owner answered **"ja"** to the explicit
  local-connection approval request. The exact approved package is in ADR-016:
  `127.0.0.1:4174`, random manual pairing in trusted `storage.session`, narrow
  loopback/storage permissions and exact-port CSP, synthetic IDs/actors and
  deliberate demo contributions retained in the local DB until manual deletion.
  Loopback and browser integration tests are included. No cloud, cost, real
  captured page data or model acquisition is authorized by this approval.
- The next cheaper-model block is S3: listener, pairing, thin extension and
  human discussion UI. Do not repeat the same owner approval or completed 6/6
  review. The handoff provides S3a/b/c increments and the next Astra checkpoint.
- That approval-recording continuation changed documentation only. Its baseline was
  `818dd6e`; it had no listener, connected client or new permission.
  New transport/permission changes need focused Trust/Quality review and actual
  loopback/browser evidence. Return to Astra after S3, or earlier if an unresolved
  architecture/security issue or a new approval boundary is reached.

## Verification and residuals

S3 execution started (2026-09-28): the owner selected GPT-6 Sol Medium coding
subagents with Astra orchestration/review in the same conversation. Independent
transport, client-adapter and UI slices have explicit file owners. The lead owns
integration/security review, shared documentation and verified commits; manual
model-switch handoffs are no longer required. No wider capability is authorized.

S3a completed and reviewed (2026-09-28): fixed `127.0.0.1:4174` transport, manual
terminal-only random pairing token, random persistent IDs, bounded raw headers/
stream/deadlines, shutdown and separate local integration guard. The six Harbor
Sources are unchanged; two explicitly project-created reserved-domain Sources
bridge the old URL fixture IDs to a separate shared Topic, with null embeddings.
Pre-bridge databases stay unchanged until deliberate reset. Service tests:
51/51 offline; 2/2 actual loopback integration; secret scan 30 files, zero findings,
six self-tests. The lead reproduced the socket suite after transport review;
all test listeners are closed. S3b/c and real-browser evidence follows below.
Details: [S3 implementation review](../research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md).

S3b/c completed and accepted (2026-09-28): extension 0.5.0 is a session-paired
thin client with automatic fixture-only lookup, Topic create/select, human roots,
replies, edit/withdraw/reset and service-ranked related Sources. English message
keys, inert rendering and actual human/AI counts are separate from old diagnostic
fixtures. Drafts remain memory-only; navigation detaches rather than retargets
them. Focused review corrected async pairing/lifecycle races and keeps writes
blocked after uncertain outcomes until a fresh service reload. A separate
read-only Trust pass accepts the corrected scope, not production security.

Final lead-reproduced verification after all corrections:

- Spike: 330 normal tests (329 pass, one expected skip), 330/330 restricted,
  148/148 indicator. Service: 51/51 offline, 2/2 actual loopback.
- Actual Chrome 153.0.8010.53: PASS across 19 UI/integration categories, including
  pairing, service Source ranking, CRUD/reopen/restart, shared fixture Topic,
  inert markup, keyboard and session-only storage. Zero JavaScript exceptions or
  unapproved extension requests observed. Two reserved-domain pages were served
  entirely from intercepted project-created HTML, not fetched from real websites.
- Secret scans: 113 spike files and 30 service files; zero findings, six scanner
  self-tests each. Syntax/inventory/capability checks and `git diff --check` pass.
- Test-owned profiles/databases/listeners are cleaned up; no demo service is left
  running. The interactive CLI token is shown only in the user's own terminal.
- S3a is committed as `9bfe9d5`. The S3b/c completion commit contains this record;
  inspect git history for its hash. README/startup and active decisions agree.
- Separate documentation consistency review found and corrected a stale blanket
  server STOP line; only ADR-016's already approved fixed-loopback exception is
  permitted. All later expansion gates remain. No completed review was repeated.

S3 completion is the current stop: no R2 model acquisition or S4 activation yet.
The exact model/runtime/license/assets/input proposal is now prepared in ADR-017
and awaits the owner. No manual model switch or independent human reviewer is
needed now.

Historical S3 approval/handoff documentation checks (2026-09-28): `git diff --check` passes;
all 41 local Markdown links across the 12 changed documents resolve. Approval,
implemented capability and later gates were reconciled across active documents.
No product tests, loopback listener or browser smoke were run for this docs-only
continuation; the S1/S2 results below remain the last executed code evidence.

Astra/Trust review of S1/S2 (2026-09-28): qualified ACCEPT of the corrected offline
core; the owner subsequently approved ADR-016's local S3 activation package. The
[review record](../research/S1_S2_REVIEW_2026-09-28.md) lists reproduced failures,
fixes and the concrete S3 transport/client requirements.

- Fixed multiline bodies, write-before-response overflow, repository successor/
  reset version checks, non-atomic initial database creation and full-state
  application mutation returns. Memory and SQLite share these contract checks.
- Service suite: 39/39 pass; secret scan: 25 files, zero findings, six self-tests.
  The prior 28-test result below describes the implementation before this review.
- Existing extension/spike code is unchanged; no fresh browser/loopback claim.
  The review accepts the offline core only. New S3 transport and
  permissions still need their focused checks/review during S3 implementation.

Documentation-only service handoff checks (2026-09-28):

- `git diff --check` passes; all 37 local Markdown links across 16 changed/new
  documents resolve. No product test rerun is claimed for this documentation change.
- Separate AI Trust/Quality review returns qualified ACCEPT after correcting
  missing-Origin handling and requiring the existing network-denial harness for
  service tests. ADR-016, handoff and active documents agree on placement and gates.
  This accepts the plan, not service security, durability, browser interoperability,
  learned matching or store readiness. The later implementation evidence follows.

S1/S2 implementation checks (2026-09-28):

- Local service `npm test`: 28/28 pass under the external-capability denial harness.
- Local service `npm run check:secrets`: 22 files, zero findings, six scanner self-tests.
- Existing spike `npm test`: 294 total, 293 pass and one expected restricted-only skip.
- Existing spike `npm run test:restricted`: 294/294 pass.
- Existing spike `npm run indicator:test`: 112/112 pass.
- Existing spike `npm run check:secrets`: 101 files, zero findings, six self-tests.
- Syntax checks pass for every local-service JavaScript file; `git diff --check`
  passes. No loopback integration or browser smoke was run because S3 is gated.

2026-09-28 post-discovery-increment checks:

- `npm test`: 294 tests, 293 pass, one expected restricted-harness-only skip.
- `npm run test:restricted`: 294/294 pass.
- `npm run indicator:test`: 112/112 pass (overlaps the full suite).
- `npm run check:secrets`: 101 package files, zero findings, six scanner self-tests.
- Separate AI Trust/Quality review accepts the bounded navigation correction.
  This is not independent-human, legal or store approval.
- Separate AI Trust/Quality review accepts the isolated related-page demo after
  correcting the stale synthetic digest expectations. No live discovery or
  learned-embedding usefulness is claimed. Real-browser panel smoke is pending.
- Cross-document review found a conflicting blanket ban on private-draft
  persistence. It is corrected: local demo drafts may persist as scoped, while
  credentials and automatically captured source context may not. Active links
  and local/external approval boundaries were checked; the reviewer verified
  the correction and returned qualified ACCEPT with no remaining doc blocker.
- Follow-up ADR-015/current-document review accepts the implemented/planned
  distinctions and retained gates; all 23 checked local Markdown links resolve.

The new lifecycle wiring has automated mocked-browser/race coverage, but no
fresh real-Chromium smoke yet. Earlier owner smoke remains complete for its old
version; it does not cover this change. Event delivery is asynchronous, not an
atomic guarantee of DOM freshness; any source-tab update conservatively clears
the metadata and may require retry. The MDN experiment expires on 2026-10-23.

## Next work and authority

R0 reassessment/hardening and documentation reconciliation are complete.
R2's first fixture-only related-source increment and R1 handoff S1–S3 are complete.
Astra review and explicit owner approval of ADR-016's exact activation package
are complete. The listener and paired extension loop are implemented and locally
tested; do not repeat S3 or its unchanged approval. Keep the default offline guard.
Synthetic identity is a testing device, not real login/security isolation.

The owner approved the first bounded embedding experiment in ADR-017 on
2026-09-29; that package is now implemented and measured. The lead handles the
review here, without a manual model switch. ADR-018 separately approved the exact
public selected-site browser inference and local URL/title/vector retention
package; its implementation and tests are recorded above. Broader private inputs,
off-device transfer and new model assets remain gated. External search is deferred.
Provider/data egress, real accounts/testers, deployment, purchases, public posts,
recruitment and store submission each retain explicit applicable approvals.

The 200–250-pair provenance-approved review is deferred to R5. Stop and ask before
acquisition/review becomes required; give the owner a concrete assignment for an
independent person then. No independent person is needed for the next local code
increment. Completed synthetic labeling is not real-world accuracy evidence.

## Important decision status

- ADR-014: active sequencing and local engineering envelope.
- ADR-015: related pages as first-user utility, early embeddings, provider-neutral
  discovery with explicit coverage/rights/cost limits; no provider activated.
- ADR-016: active local-service-first architecture; S1/S2 reviewed, exact local
  S3 activation package owner-approved; listener/client/UI implemented. Supersedes IndexedDB
  placement; no wider data/network permission follows from the approval.
- ADR-017: bounded synthetic-only local comparison completed;
  no interactive model activation or real inputs. Hosting does not inherit
  permission for raw content or vectors.
- ADR-018: exact owner-local real-page background matching package approved on
  2026-09-29; B1–B5 implemented and Chrome-tested, no wider private/remote/release scope.
- ADR-001/004: frozen baseline/editorial evaluation evidence; unchanged.
- ADR-009: NO-AUTO remains for production/shared resolution; ADR-018 supersedes
  it only for the approved fallible owner-local provisional grouping experiment.
- ADR-010/011: existing exact URL/metadata boundaries unchanged by this reset.
- ADR-012: prior design retained with policy corrections; exhaustive lifecycle
  features are phased with actual capabilities, not all prerequisites for R1.
- ADR-013: sensitive body-derived matching remains separately gated; local
  transformation does not establish anonymity, website rights or store approval.
- ADR-003/005: backend/correction candidates, not deployed infrastructure or
  permission for global merges.

During ADR-018 preparation, no additional data/model acquisition, provider call,
spending, deployment, announcement, store submission or public discussion
occurred. The earlier approved ADR-017 model/runtime acquisition is recorded above.

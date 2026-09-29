# Project status

Updated: 2026-09-29. Active direction: ADR-014/015/016 and the product-first roadmap.
ADR-017 is a proposed experiment, not an approved activation.
Previous detailed chronology is preserved in
[the historical status](archive/STATUS_2026-09-25.md).

## Where we are

We have a tested local service and usable synthetic human-discussion extension.
The core product hypotheses—semantic concentration, personal AI utility and
community adoption—remain unvalidated. Stop expanding review infrastructure.
The first local discussion loop is built; next prioritize real embedding utility
after its exact model/input approval, then the remaining private/AI/moderation UX.

| Capability | Actual state |
| --- | --- |
| Exact URL/fingerprint resolution | Implemented on synthetic fixtures; not semantic similarity |
| Chromium URL lookup | Bundled example.com/example.org mappings only |
| Metadata capture | Controlled loopback fixture and one pinned MDN route only; explicit button, no body/egress/storage |
| Review/evaluation tooling | Implemented mechanics; no real larger corpus or held-out model results |
| Synthetic owner review | Finished: 6/6. Do not repeat |
| Related-page discovery | Service-ranked fixture recommendations in extension 0.5.0; six synthetic Harbor Sources/hand-authored vectors, no web search |
| Discussions and replies | Local human Topic create/select, roots/replies/edit/withdraw implemented in service and extension; no private/AI/moderation controls yet |
| Local persistence | Memory and SQLite adapters; app DB ignored. Pairing token only in trusted session storage; drafts only popup memory |
| Current-tab auto-load | Paired popup loads catalog and exact reserved-domain fixture mapping automatically; only known Source ID sent, all other tabs manual |
| Learned embeddings/general same-Topic matching | Not implemented; early R2 model experiment before R5 AUTO validation |
| AI handoff/import/provider | Planned; no inference or real credentials |
| Local backend | S1–S3 fixed loopback service, SQLite, session-paired thin client; actual socket and Chrome checks pass |
| Real accounts/mobile/hosting/stores | Not implemented, deployed or submitted |

## Embedding options investigated 2026-09-29 — awaiting approval

- Researched official model cards, licenses, artifact sizes and runtime releases.
  The first Granite/E5 shortlist is superseded by a size-focused comparison:
  compact multilingual static variants versus E5-small and a lexical baseline.
- [Research and options](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md) and
  [proposed exact package](../decisions/ADR-017-local-embedding-experiment.md)
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
  The next action is owner model/input selection and explicit approval, not S4.
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

The next boundary is choosing and explicitly approving the first real embedding
experiment; no model is chosen/downloaded by S3 completion. The lead handles the
review here, without a manual model switch. Model acquisition/activation and broader real-page capture remain separate exact
fields/contexts/permissions/assets/retention gates. R1 stores no captured browsing
data. External search is deferred, not a blocker for these steps.
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
- ADR-017: proposed local learned-embedding comparison; no model/runtime/input
  activation approved. Hosting does not inherit permission for raw content or vectors.
- ADR-001/004: frozen baseline/editorial evaluation evidence; unchanged.
- ADR-009: local-first NO-AUTO direction retained and made executable.
- ADR-010/011: existing exact URL/metadata boundaries unchanged by this reset.
- ADR-012: prior design retained with policy corrections; exhaustive lifecycle
  features are phased with actual capabilities, not all prerequisites for R1.
- ADR-013: sensitive body-derived matching remains separately gated; local
  transformation does not establish anonymity, website rights or store approval.
- ADR-003/005: backend/correction candidates, not deployed infrastructure or
  permission for global merges.

No real data acquisition, new provider call, model download, spending,
deployment, announcement, store submission or public discussion occurred.

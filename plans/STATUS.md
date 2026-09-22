# Project Status

## Current phase

Phase 0 foundation in progress; P0.1 and the frozen offline P1.1 kernel are
complete, P1.2 evaluation and owner-review workflow work is in progress, and a bounded offline
P1.3a synthetic HTML extraction increment has passed independent offline
Trust/Quality review pending owner disposition of proposed ADR-006. A
P1.5b is complete for the owner-approved `activeTab`-only local URL boundary:
automated evidence, Trust/Quality engineering review, and the owner-run
Chromium smoke pass. The exact approved P1.5c metadata implementation now
exists and its automated verification passes; independent review and owner
browser smoke are not yet recorded. General page/WebView extraction and full browser
integration stay at a separate owner/security/privacy/rights/store-policy stop.

## Current objective

Close the remaining P0.2 decisions—especially architecture, browser
egress/retention, and proposed merge/split semantics—before connected
implementation, while building the license-safe P1.2 corpus/evaluator and
review-ready owner labeling workflow, and advancing the shortest local
NO-AUTO proof of concept. Preserve the completed P1.5b URL-only evidence while
verifying the exact P1.5c vendor-neutral Chromium metadata boundary before any
broader Chromium, Android, or iOS extraction implementation.

## Completed on 2026-09-19

- Read and reconciled every bootstrap document.
- Defined the five-role lean team and single-writer/review handoffs in `agents/TEAM.md`.
- Challenged the core assumptions, separated the discovery/resolution/AI hypotheses, proposed measurable gates, and recorded a cost envelope in `plans/PHASE_0_FOUNDATION.md`.
- Recorded dated market, browser-policy, privacy, semantic, and hosting evidence in `research/PHASE_0_EVIDENCE.md`.
- Added a threat model for the offline resolver and a future read-only indicator in `docs/PHASE_1_THREAT_MODEL.md`.
- Added a provider-neutral BYO-AI threat model; its proposed pre-provider boundary permits only a deterministic fake adapter until the full credential, privacy, authorization, and provider gate passes.
- Turned Phase 1 into ordered tasks with owners, dependencies, acceptance criteria, and stop/go gates in `plans/ROADMAP.md`.
- Implemented `spikes/topic-resolution/`: conservative URL normalization, exact-fingerprint topic resolution, fail-separate provisional topics, audit metadata, and separate public human/agent activity counts.
- Reconciled later phases with explicit AUTO/ASSISTED/NO-AUTO and human-only/AI-enabled branches, correction and data-lifecycle dependencies, owners, evidence, and stop/go gates.
- Initial restricted verification passed 62 tests with 0 failures on Node 24.19.0; the ordinary suite passed 61 with only the restricted-harness self-test skipped. JavaScript syntax and whitespace checks also passed.
- An independent final consistency/code review reproduced the suite and found no remaining concrete blocker after its reported edge cases were corrected.
- The owner accepted a time-bounded atomic-development Topic definition in ADR-004. The P0.1 pilot now contains 24 project-created synthetic pair decisions across 20 clusters with the required 8/8/4/4 case mix.
- An independent reviewer labeled six blinded pilot pairs (25% coverage) with no disagreements. `npm run evaluate:pilot` validates the schema and reproduces TP=4, FP=0, TN=16, FN=4 without using review-only titles or summaries.
- The owner accepted ADR-002's user-invoked `activeTab` direction, with passive discovery and all connected data use still outside the accepted boundary.
- Added a checked fixture-provenance inventory and a process-level restricted harness that actively denies socket, DNS, HTTP, subprocess, fetch, and WebSocket access while running the full suite.

## Completed on 2026-09-20

- Added focused hostile-input checks for empty values, Unicode-confusable origins, HTML/instruction-like titles that cannot affect resolution, unsupported nested evidence, cyclic observations, and overlong evidence identifiers. Downstream rendering and prompt safety remain separate controls.
- Added a dependency-free package scanner for a versioned set of high-confidence credential formats. It self-tests every detector using in-memory synthetic samples, reports no matched values, and `npm run check:secrets` scanned 21 JavaScript, JSON, and Markdown files with zero findings; this is package evidence, not a replacement for repository/host secret scanning.
- Closed the two technical partials from the P1.1 gate audit: deep/mixed-representation parser boundaries now pass, and a deterministic 768-case URL matrix preserves repeatability, idempotence, and security origins. The matrix exposed an over-limit normalized-output edge, which is fixed and versioned as resolver 1.0.1.
- The frozen P1.1 gate verification passed all 70 tests under the restricted process guard; the ordinary suite passed 69 with only the guard self-test skipped. One independent read-only audit issued both Trust and Quality ACCEPT dispositions for code commit `d33f010` at 8 PASS / 0 PARTIAL / 0 FAIL, and the Lead marked that offline gate complete. Review provenance and residuals are in `research/P1_1_GATE_REVIEW.md`.
- Proposed append-only Topic/Discussion correction semantics in ADR-005: corrections never copy or reauthor Contributions, every active Topic has one writable Discussion, and legacy Discussions can appear only as provenance-preserving read-only projections.
- Added `research/ALPHA_COST_MODEL.md`, a current bottom-up managed/self-hosted paper comparison with explicit workload, currency, service-level, and operational omissions. It does not replace P1.9 load/restore evidence or authorize a purchase.
- Began P1.2 evaluator hardening without changing the exact-signal baseline:
  the deterministic report now includes tested two-sided 95% Wilson intervals,
  coverage/abstentions, automatic-join evidence sufficiency, and zero external
  cash cost/provider calls. The CLI separately records scoped runtime metadata.
  The report explicitly rejects gate sufficiency because this pilot is not held
  out and has only 4 predicted joins across 4 gold clusters; the larger corpus,
  cluster split, and bootstrap remain open.
- Added a canonical-digest-bound dependency-block split contract and executable
  dry run. It validates complete/exclusive cluster assignment, keeps every
  negative pair in one block, rejects cross-partition exact URL/fingerprint
  signals, and reports four connected pilot blocks. Both partitions and the
  output are explicitly marked as non-held-out, gate-ineligible evidence.
- Added a deterministic, bounded whole-dependency-block bootstrap engine for a
  future frozen held-out run. Synthetic matrix tests cover seeded selection,
  full-block resampling, six metrics, percentile intervals, input/selection
  digests, overlapping-cluster rejection, bounded inputs/work, minimum valid
  replicates, and explicitly conditional undefined-denominator handling. Every
  result is sensitivity-only and gate-ineligible, and the engine is
  intentionally not applied to the retrospective pilot.
- Added the strict future P1.2 corpus contract without adding corpus data.
  Generated boundary tests cover the 200 eligible-pair/50-cluster/six-case/20%
  review minimums, primary/secondary/adjudication history, unresolved-label
  exclusion, reviewer independence, provenance inventory, bounded hostile
  inputs, canonical corpus/evaluation digests, and a resolved-label wrapper for
  dependency-block splitting. Structural readiness remains gate-ineligible and
  requires external Trust review. An independent read-only implementation
  review found and verified fixes for full-corpus digest binding, truthful
  adjudicated-label naming, canonical reviewer identity, and bounded preflight
  diagnostics; its final disposition was PASS with no remaining blocker.
- Added the strict pre-result evaluation-policy contract without creating a
  receipt or evaluating predictions. It binds corpus/projection/split and
  candidate-artifact digests; freezes integer join/abstention, normative gate,
  true-positive cluster-evidence, seeded bootstrap, and offline-only scope
  semantics; checks held-out feasibility separately from quality; and always
  denies held-out/gate evidence pending external chronology and review. An
  independent read-only review reproduced all 11 focused policy/bootstrap
  tests in both normal and restricted modes and reported PASS with no
  commit-blocking findings.
- Added a strict unevaluated prediction-bundle contract without adding a real
  bundle or CLI. It requires complete sorted coverage of the declared held-out
  pair inventory, distinguishes missing retrieval from an integer verification
  score, transitively binds policy/dataset/split/artifact digests, rejects
  gold/result fields, and never thresholds or evaluates scores. An independent
  read-only review reproduced all 12 focused policy/prediction tests in normal
  and restricted modes and reported PASS with no commit-blocking finding.
- Added a generated-fixture-only result evaluator without adding a bundle,
  report, or CLI. It rejects non-synthetic Sources; applies only the frozen
  integer decision and bootstrap policies; reconciles global, case, and block
  matrices; reports six metrics, Wilson intervals, coverage, and bounded error
  queues; and always withholds held-out evidence and a final gate branch. An
  independent read-only review reproduced the complete normal/restricted
  verification and secret scan and reported PASS with no commit blocker.
- Implemented the first P1.3 increment as a dependency-free in-memory
  synthetic HTML profile. It requires fatal UTF-8 and an explicit bounded
  head, extracts one normalized title, records canonical metadata only as an
  absent/same-origin/rejected/ambiguous hint, preserves the observed URL, and
  hashes the exact validated bytes. The Source projection passes the resolver,
  and its fields integrate into a separately completed strict P1.2 Source
  record; canonical hints alone cannot join Topics.
- Added exact tests for all declared byte/head/tag/attribute/comment/name/value/
  title/canonical/identifier limits; malformed and active content; deceptive
  comments/meta/body data; one-pass entities; invalid UTF-8; exact-byte
  sensitivity; and accessor/proxy/subclass/shared/resizable/decorated/non-owned
  byte inputs. Runtime extraction has no filesystem, network, process, browser,
  or logging capability, and raw document bytes are neither returned nor
  persisted.
- Inventoried and pinned one 580-byte project-created synthetic HTML fixture,
  added HTML to the secret scanner, and recorded the parser/fingerprint
  contract in proposed ADR-006 and `EXTRACTION_CONTRACT.md`. The report states
  that `fixtureId` and `synthetic-fixture` evidence are caller declarations and
  that runtime provenance is unverified; a connected path still needs trusted
  observation/receipt design.
- An independent read-only implementation audit found and verified fixes for
  unterminated-head acceptance, proxy/backing-buffer leakage, oversized
  typed-array preflight, and overclaimed fixture provenance. Its technical
  disposition was PASS for the bounded offline scope.
- Current verification passes all 125 tests under the restricted process
  guard; the ordinary suite passes 124 with only the guard self-test skipped.
  The pilot evaluator and split dry run still run successfully, and the local
  secret scanner finds zero matches across 49 package files after all six
  detector self-tests pass.

## Updated on 2026-09-21

- Refined P1.2 around an owner-ready review queue rather than manual corpus
  JSON. The future workflow must assemble bounded provenance-checked metadata,
  present `same-topic` / `different-topic` / `uncertain` decisions, and retain
  review/adjudication history. It must stop and present the prepared task to the
  owner before freezing a held-out split or making any automatic-join decision.
- Implemented the first synthetic-only P1.2 owner-review workflow increment.
  Exact bounded TSV metadata becomes a canonical task digest, seeded opaque
  primary order, and separately seeded 20% secondary-review plan before labels.
  The local CLI exposes only `prepare`, `owner`, and safe `status`; it blinds
  case/cluster/provenance/selection internals, persists each primary answer as
  a task-bound digest-chained event, retains `uncertain`, and refuses stale or
  concurrent overwrite. The Source/provenance subset now matches the frozen
  corpus bounds, but no corpus, cluster assignment, secondary review,
  adjudication, split, evaluation, or gate decision is produced.
- Added six project-created synthetic review pairs plus exact UTF-8/TSV,
  presentation allowlist, terminal-control, chronology, task/event tamper,
  append/restart/concurrency, CLI, capability, fixture-inventory, and secret-scan
  checks. The default task is explicitly below the 200-pair target and is not
  the roadmap owner checkpoint. Reviewer IDs/times remain declarations, and a
  fully recomputed alternative history or valid ledger suffix requires
  comparison with an independently retained digest to detect replacement.
  Proposed ADR-007 and the review-workflow contract record these boundaries.
- The owner completed the local six-pair dry run: 6/6 answered, all six binary,
  no uncertainty, task digest
  `sha256:b734d983f3fcc9fece8ef6235ee7cac896e2dc7ab049313da637a72c157cb9ad`,
  and final local session digest
  `sha256:d8ad7c504df9a52af041d676ef2368cc036a3ba4ac865e682fa30b1557af9698`.
  The fixture task/provenance dates were moved to 2026-09-20 so the 2026-09-21
  local-clock events did not predate the task. This finishes the synthetic
  owner exercise and will not be repeated; it still supplies no real corpus,
  independent review, semantic-quality, or gate evidence. The recorded final
  digest is a manual Git anchor for this run only, not an automatic/general
  ledger-anchoring service.
- Verification passes 25 focused workflow/capability tests, all 147 tests under
  the restricted capability guard, and the ordinary 147-test suite at 146 pass
  with only the guard self-test skipped. The expanded scanner covers checked-in
  TSV and reports zero findings across 60 files after six detector self-tests;
  the pilot evaluator and structural split dry run remain unchanged and pass.
- An independent read-only reviewer applied both Trust and Quality lenses to
  final tree `d3818ab` and issued ACCEPT / ACCEPT with no open critical, high,
  or medium finding. This was one reviewer, not two independent people and not
  owner acceptance. The final hash, reproduction evidence, resolved findings,
  control matrix, residuals, and non-authorizations are recorded in
  `research/P1_2A_GATE_REVIEW.md`.
- Added the P1.2 collection/completion plan, now accepted for generated-only
  preflight, rather than manufacturing
  a bare-minimum benchmark. It provisionally targets 250 candidate pairs/60
  opaque acquisition strata, a 30% precommitted coverage set plus ranked
  reserve, exact acquisition-plan/provenance digests, a separate
  uncertainty-preserving archive/completion receipt, and deterministic
  post-review cluster checks. It distinguishes generated design work from real
  acquisition and records stops both when the primary task is presented and
  before any split/evaluation. No data collection or additional review role
  has been authorized or started.
- A separate independent read-only reviewer reproduced the focused and full
  verification, applied both Trust and Quality lenses, and issued ACCEPT / ACCEPT
  for the bounded offline P1.3a scope with no implementation, test, or security
  blocker. This is one reviewer applying two lenses, not two independent people;
  the accepted residuals remain explicit and ADR-006 still needs owner
  disposition. Review provenance and the control matrix are recorded in
  `research/P1_3A_GATE_REVIEW.md`.

## Updated on 2026-09-22

- Implemented the bounded P1.5a browser slice under ADR-009. Loading
  `spikes/topic-resolution/browser/` as an unpacked Chromium extension opens a
  zero-permission bundled-fixture popup with resolved, unmapped, unsupported,
  malformed, and hostile-text scenarios. It reads no tab/page data, has no
  browser API, background/content script, request, storage, telemetry, write,
  auth, or AI capability, and makes no real-page or semantic-quality claim.
- The browser-neutral response contract now rejects unknown/behavioral or
  resource-exhausting input and cross-binds Source, source-topic mapping,
  Topic, Discussion, topic-scoped activity counts, and freshness. Resolver
  parity tests pin three displayed Source/mapping records. UI phase is separate
  from terminal outcome; reset, newer valid selection, and newer invalid
  selection all prevent a late completion from replacing current state.
- P1.5a verification passes 21/21 focused contract/controller/package checks,
  the full ordinary suite at 202 passes plus its one expected restricted-guard
  skip, the restricted suite at 203/203, and the expanded CSS-inclusive secret
  scanner across 78 files with zero findings after six detector self-tests.
  The fixture provenance manifest is now version 1.2.0; its intentional digest
  change is propagated through the generated review-chain regression pins.
- One separate read-only agent applied Trust and Quality engineering lenses to
  implementation commit `608a2ba` and issued ACCEPT / ACCEPT for the exact
  bundled-fixture code/package boundary, with no blocking finding. This is one
  AI reviewer, not two independent people, a human privacy/security review, or
  owner approval. Browser-level traffic/storage inspection, Chromium and
  accessibility smoke, hidden-DOM clearing before real data, adapter timeout,
  Firefox support, real-tab binding, and the full P1.5 gate remain open. The
  evidence and residuals are recorded in
  `research/P1_5A_ENGINEERING_REVIEW.md`.
- The owner explicitly accepted ADR-010's exact P1.5b boundary on 2026-09-22.
  The manifest now requests only `activeTab`. After the popup action, the
  Chromium reader projects only current active top-level tab ID and URL; the
  policy rejects all queries and every non-allowlisted context, strips only a
  fragment, and accepts exactly `https://example.com/` and
  `https://example.org/`. No title, DOM, canonical metadata, body, frame,
  storage, network, background/content script, telemetry, auth, write, or AI
  capability was added.
- P1.5b performs a bundled exact-normalized-URL Source lookup, records that
  lookup receipt separately from the pinned exact-content-fingerprint
  Source-to-Topic mapping, and re-queries the active/current tab immediately
  before rendering. A different tab, URL/navigation, closed tab, permission
  loss, malformed or cross-bound result, reset, or newer activation fails
  closed and clears all previously rendered fields. The package CSP explicitly
  denies connections; the P1.5a fixture selector remains available.
- The focused P1.5b policy/reader/controller/contract/package suite passes
  46/46 checks. The full ordinary suite passes 227 tests with only its expected
  restricted-harness self-test skipped; the restricted suite passes 228/228.
  The expanded scanner covers 84 files with zero findings after six detector
  self-tests. Static evidence cannot prove real browser permission, traffic,
  storage, console, or keyboard behavior; the owner therefore completed the
  bounded Chromium smoke documented in
  `research/P1_5B_MANUAL_SMOKE.md` on 2026-09-22. Supported and rejected URLs,
  navigation and closed-tab races, fixture states, local-only resource loading,
  empty console/storage, and keyboard/visible-state behavior passed. This
  closes P1.5b only for its exact local scope.
- A separate read-only AI reviewer applied Trust and Quality engineering
  lenses to implementation commit `53c7e84`, verified the documentation-only
  smoke-checklist reconciliation in `4e782e4`, and issued ACCEPT / ACCEPT with
  no open engineering finding. This is not an independent human, owner manual
  smoke, legal/store-policy review, or release approval. The evidence,
  resolved checklist gap, and residuals are recorded in
  `research/P1_5B_ENGINEERING_REVIEW.md`.
- Current official-source policy research now covers Chrome Web Store, Apple
  App Store, Google Play, Android/iOS WebView feasibility, robots/meta signals,
  paywalls, content rights, and search-provider lock-in. It rejects per-site
  APIs as the core architecture and defines one generic, standards-based,
  user-invoked metadata envelope with local processing and URL fallback.
  Technical DOM access and metadata presence do not by themselves settle store
  acceptance. The owner directs the PoC to assume public head metadata is
  locally processable and not to build generic paywall detection or per-site
  APIs; this is a product assumption, not a legal/release conclusion. The owner
  has approved only the exact P1.5c controlled route and pinned MDN page after
  explicit Security/Privacy/Policy detail; evidence and alternatives are in
  `research/CONTENT_ACQUISITION_AND_STORE_POLICY.md` and
  `research/P1_5C_SCOPE_AND_REAL_PAGE_POLICY.md`.

## Completed on 2026-09-22

- Implemented the exact ADR-011/P1.5c Chromium metadata path as a separate
  explicit popup action. The manifest is pinned to `activeTab` plus `scripting`
  with Chrome 106+, no host/background/content/storage/network capability, and
  the existing connection-denying CSP. The adapter accepts only the controlled
  loopback fixture and pinned MDN route before the recorded expiry.
- The isolated top-frame collector inspects at most 256 direct head children
  and 32 exact-selector candidates. Strict local contracts enforce field
  precedence/limits/provenance, same-origin queryless canonical hints,
  supported in-head robots/TDM controls, safe text, valid publication
  timestamps, and no raw retention. A second `documentId`-targeted injection
  plus a final active-tab read detects same-URL reloads and navigation races.
  There is no body, JSON-LD, auth/paywall-state, model, fingerprint, resolver,
  Topic, storage, log, telemetry, or egress path.
- Added a project-created script-free fixture and exact loopback-only server.
  A live local harness probe returned 200 with `no-store`, `nosniff`, and the
  expected synthetic fields; HEAD returned no body, while a query and wrong
  Host were rejected with 404 and 400. Fixture provenance advanced to 1.4.0
  and its intentional review-chain digest changes are pinned.
- Focused browser checks pass 83/83. The full ordinary suite passes 264 tests
  with only its expected restricted-harness self-test skipped; the restricted
  suite passes 265/265. The scanner covers 95 files with zero findings after
  six detector self-tests. Independent Trust/Quality review and the exact
  owner-run local/MDN Chromium smoke remain open.
- Recorded the owner's PoC assumption that public document-head metadata is
  locally processable and no generic paywall detector or per-site API is
  needed. The code makes no auth/paywall-detection claim. This is not a legal,
  generalized-site, store, deployment, or publication approval; those gates
  remain explicit.

## Active decisions

- `ADR-001-offline-resolution-spike.md`: **Accepted for offline P1.1 only** at code commit `d33f010`. It authorizes no connected behavior, real data, or semantic-quality claim.
- `ADR-002-browser-observation-privacy.md`: **Accepted direction; connected-use gate open**. It approves user-invoked `activeTab`, not data egress or real-user collection.
- `ADR-003-alpha-architecture.md`: **Proposed**; its paper cost comparison exists, but measured load, recovery, security, and operations evidence still block a production-stack commitment.
- `ADR-004-initial-topic-granularity.md`: **Accepted** for the initial English editorial corpus.
- `ADR-005-topic-discussion-correction-history.md`: **Proposed**; owner, Trust, and Quality review are required before correction implementation.
- `ADR-006-synthetic-html-extraction-profile.md`: **Proposed with offline implementation evidence and Trust/Quality ACCEPT**; the narrow synthetic profile is implemented, but owner acceptance remains open. It authorizes no live page or production fingerprint use.
- `ADR-007-offline-owner-review-ledger.md`: **Accepted by the owner for the offline workflow and generated-only P1.2b-1 preflight**; the existing synthetic implementation has Trust/Quality ACCEPT, but the decision authorizes no real-data collection, real independent review, corpus finalization, split, or evaluation.
- `ADR-008-generated-review-resolution-journal.md`: **Accepted for generated-only P1.2b-1 implementation under the owner's continuation direction**; it requires one versioned causal head and derived exclusions, and authorizes no real review, adjudication completion, reserve activation, corpus, split, or evaluation claim.
- `ADR-009-local-poc-before-semantic-validation.md`: **Accepted for local fixture-driven PoC sequencing**; it defaults semantic resolution to NO AUTO, permits candidates only as local suggestions, and defers rather than satisfies the real human-review requirement. It authorizes no connected use, collection, deployment, spending, or publication.
- `ADR-010-local-active-tab-url-observation.md`: **Accepted and complete for the exact local P1.5b boundary.** It adds only `activeTab` for an invoked, queryless, two-URL allowlisted read held in popup memory and authorizes no title/content extraction, storage, network, broader browsing observation, deployment, or publication. Automated, Trust/Quality engineering-review, and owner Chromium evidence pass.
- `ADR-011-cross-platform-content-signal-boundary.md`: **Accepted and implemented for the exact P1.5c controlled-page plus one pinned MDN-page experiment; post-implementation review/manual evidence pending.** It authorizes only the frozen generic metadata envelope under `activeTab` plus `scripting`, ephemeral local processing, and temporal-hint non-use. It authorizes no body/JSON-LD extraction, model, semantic decision, egress, storage, mobile adapter, general third-party page, deployment, or store submission.

## Blockers

- Passive discovery remains an untested, separately gated hypothesis; the accepted user-invoked design can measure panel utility but cannot produce a pre-click activity indicator.
- P1.5b now proves the exact `activeTab`-only URL observation and two-read
  tab/navigation binding with automated, engineering-review, and owner-browser
  evidence. It does not request broad `tabs`, inspect a title/DOM/body, invoke
  P1.3 extraction, or establish store eligibility. The owner approved only the
  exact ADR-011/P1.5c controlled-page plus pinned-MDN metadata experiment; its
  implementation exists, while independent review and owner-browser evidence
  are now the next local work. ADR-006 also
  still needs owner acceptance before its different synthetic byte-extraction
  profile is integrated anywhere.
- Exact egress fields, account linkage, sensitive-site exclusions, log/backup retention, deletion, and telemetry are undecided.
- The auth/object-authorization/data-lifecycle threat model and identity/provenance/moderation state decisions required by P1.6 have not been produced or approved.
- The alpha architecture and host/auth/provider choices are not accepted.
- BYO AI remains blocked on provider terms, credential handling, content disclosure, retention, and explicit publication design.
- P1.1 is complete only for its frozen offline code at `d33f010`; a code-bearing change reopens review. The acceptance does not authorize connected or real-data behavior, automatic semantic joins, or browser/service controls.
- P1.2 remains incomplete: the pilot is not a cluster-separated held-out set,
  its precision Wilson lower bound is about 0.51, and it has 4 automatic-join
  decisions across 4 clusters versus the predeclared 60/20 minimum. The
  real provenance-approved 200-pair/50-cluster review task and corpus, held-out
  block-bootstrap sensitivity report,
  actual expanded cases, pre-result tuning/held-out policy freeze, isolated
  candidate bundle, provenance review, and independent reproducibility review
  are still needed. The strict schema, policy/prediction contracts, and
  generated result evaluator plus retrospective dependency-block dry run
  plus the synthetic six-pair primary-review workflow validate tooling only
  and cannot close any of these evidence gaps. Real secondary review, reserve
  activation, rereview, adjudication, gold-cluster materialization, and a
  general automatic latest-ledger anchor are not implemented. No
  external policy receipt has been frozen, and no prediction bundle or real
  result exists. Once the review queue is ready, work must stop at the recorded
  owner checkpoint before any split freeze or held-out evaluation.
- The accepted synthetic workflow cannot safely be repurposed as the real
  collection merely by supplying 200 rows: it has declarations rather than a
  reviewed acquisition-plan/provenance-inventory digest, no attrition reserve
  beyond exact 20%, and no completion artifact that retains `uncertain` history
  while binding a binary corpus. Exact acquisition authority, Trust's
  provenance protocol/inventory acceptance, and named distinct reviewers are
  required before real acquisition or review.
- The owner accepted ADR-007 and the P1.2 completion plan for generated-only
  P1.2b-1 work and disclosed that the project currently has one human builder.
  Fixture identities can test role separation, but they are not evidence of
  real independent review; P1.2b-2 through P1.2b-4 remain blocked on explicit
  acquisition authority and distinct real reviewer staffing.
- Implemented the first P1.2b-1 pure preflight slice without changing the v1
  owner workflow. Canonically digested generated-only acquisition plans bind
  exact strata/pair quotas and four explicitly synthetic role identities;
  per-Source provenance inventories bind every owner-visible metadata field,
  retain accepted/rejected/pending disposition and declaration history, and
  permit only project-created reserved-domain fixtures; completion tasks bind
  both artifacts plus the exact accepted v1 task subset while deriving the
  full 30%-plus-reserve coverage priority. Every
  scope denies real metadata authority, verified independent humans, completed
  review, corpus, split, evaluation, and gate evidence.
- Implemented the next bounded P1.2b-1 generated-only slice without changing
  the v1 workflow or CLI. A pure completion ledger now requires an exact
  completed primary ledger, records the task-derived initial-coverage snapshot,
  exposes a blinded secondary view, and appends only the next synthetic
  secondary decision with exact task/session/primary-event/digest/chronology
  bindings. Its state preserves primary/secondary uncertainty and binary
  disagreement while always crediting zero eligible independent-human reviews.
  The generated successor now covers supplements, rereview, and derived
  unresolved-role exclusions. Reserve activation, adjudication, broader
  provenance/graph exclusions, cluster/corpus/archive/receipt materialization,
  and receipt-bound downstream wrappers remain open.
- Accepted ADR-008 for the next generated-only slice. It chooses one versioned
  resolution journal after the frozen completion-ledger prefix, permits only a
  bounded synthetic evidence supplement, same-role rereview, derived unresolved
  exclusion, and continuation of the initial secondary queue, and requires the
  first implementation to stop at adjudication or initial resolution
  completion. Adjudication, eligibility projection, and fixed-point reserve
  activation remain later separately reviewed code increments. The completed
  6/6 synthetic owner run remains closed and is not repeated.
- Implemented the ADR-008 version 1 generated resolution journal. It freezes
  the exact completion-ledger prefix and global predecessor, projects the sole
  next action, resolves generated primary/secondary uncertainty through one
  bounded provenance-reviewed synthetic supplement and same-role rereview,
  derives rather than solicits unresolved exclusions, and continues the
  remaining initial secondary queue. It stops at adjudication or initial
  resolution completion and provides no adjudication, reserve activation,
  corpus, split, evaluation, real-review, persistence, or gate capability.
- Owner direction now prioritizes the shortest working local proof of concept
  and defers corpus-scale semantic validation until matching logic can be
  revisited from observed use. The 200-to-250-pair human review remains a later
  prerequisite for a validated automatic-join claim, not for local fixture UI
  and integration. Until such evidence exists, the PoC defaults to NO AUTO:
  deterministic/curated mappings may resolve a Discussion and experimental
  semantic candidates may only be local reviewer suggestions.
- Verification for the generated resolution journal passes 39/39 focused
  boundary/task/ledger/journal checks, the full ordinary suite at 181 passes
  plus its one expected restricted-harness skip, the restricted suite at
  182/182, and the secret scanner across 67 files with zero findings after six
  detector self-tests. An independent read-only Trust/Quality engineering audit
  issued ACCEPT / ACCEPT with no critical, high, or medium finding. Its one low
  residual is superlinear prefix replay, bounded to 1,000 entries for the
  250-pair generated target and requiring a benchmark/refactor before materially
  larger use. This is engineering evidence, not human corpus review or labeling.
  Review provenance, controls, and residuals are recorded in
  `research/P1_2B1C_ENGINEERING_REVIEW.md` for implementation commit `f71b7e2`.
- Verification for the completed-primary bridge passes 24/24 focused
  boundary/task/ledger tests, the full ordinary suite at 166 passes plus its
  one expected restricted-harness skip, the full restricted suite at 167/167,
  and the secret scanner across 65 files with zero findings after six detector
  self-tests. A separate read-only AI reviewer applied Trust and Quality
  engineering lenses to commit `00372ec`, reproduced the evidence, verified
  corrections for concurrency, manual-anchor, unkeyed-history, blinding, and
  timestamp-bound claims, and issued ACCEPT / ACCEPT with no open critical,
  high, or medium finding. This is not a human corpus review or independent
  labeling evidence; provenance and residuals are recorded in
  `research/P1_2B1B_ENGINEERING_REVIEW.md`.
- Verified that preflight slice with 14/14 focused tests, the full ordinary
  suite at 156 passes plus its one expected restricted-harness skip, the full
  restricted suite at 157/157, and the secret scanner across 63 files with
  zero findings. A separate read-only AI reviewer first identified a missing
  full-Source binding and then issued ACCEPT after the correction and an
  independent rerun. That engineering review is not a real corpus review,
  Trust approval, or evidence of an independent human role.
- P1.3 remains incomplete beyond the synthetic-only parser increment. The
  extractor does not verify caller-declared fixture provenance, parse general
  HTML, identify main content, establish semantic equivalence, observe a
  browser, fetch a URL, or define production fingerprint attestation. ADR-006
  still needs owner disposition.
- A technically general DOM/WebView extractor cannot presently be described as
  universally publishable. Apple requires third-party-service permission under
  applicable terms; Chrome treats local scraped and derived page data as user
  data; Play rejects unauthorized WebView wrappers and copyright violations.
  Robots/meta can supply negative policy signals but do not grant permission.
  The generic metadata path in ADR-011 is accepted only for the exact P1.5c
  envelope and two routes. It deliberately does not inspect auth/paywall state.
  Full body, JSON-LD, private-data handling, remote-fetch, model, and
  search-provider paths remain disabled.
- ADR-005's correction semantics and ADR-003's architecture remain proposed; the cost worksheet is not measured capacity or recovery evidence.

## Current gate

**GO:** local fixture-only resolver/evaluator/extraction/review-workflow work;
continued local use of the completed, exact P1.5b `activeTab` URL-only slice;
and implementation/review/manual-smoke work strictly inside the approved
ADR-011/P1.5c two-route metadata boundary.

**STOP:** any `scripting`, title/metadata/DOM/body/WebView extraction, field,
selector, or URL eligibility beyond the exact accepted ADR-011/P1.5c envelope
and two routes;
integrating P1.3 into a client; unapproved
real/public corpus acquisition or check-in; real browsing capture/egress, live
URL fetches, hosted embeddings, auth/public writes, AI
credentials/inference, deployment, spending, announcements, recruitment, and
store submission.

## Next owner approval required

The exact ADR-011/P1.5c fields, contexts, `activeTab` plus `scripting`
permission, ephemeral retention, temporal non-use, controlled fixture, and one
pinned MDN test are approved. No additional owner input is required to
implement and independently review that exact slice. General adapter code must
not be mistaken for universal authorization; every other third-party,
authenticated/private/paywalled, unknown-rights, mobile, model, egress,
provider, spending, deployment, or store/publication action returns to its own
explicit gate. ADR-006 can remain pending because P1.5c does not integrate its
different byte-extraction profile.

Approve or revise ADR-003's modular-monolith direction, ADR-005's append-only
merge/split history semantics, and ADR-006's narrow synthetic extraction
profile. For any P1.2 work beyond generated-only P1.2b-1, separately authorize
the exact metadata origins/fields/acquisition/retention scope and name distinct
real primary, secondary, adjudication, and provenance reviewers. Then decide
the browser-egress/retention assumptions and acceptable operational cost
shape. The owner is available to perform the owner/primary assignment but is
currently working alone; when independent staffing becomes necessary, stop and
provide a bounded reviewer assignment rather than treating role aliases or AI
fixture labels as independence. No connected implementation starts from the
approvals recorded so far.

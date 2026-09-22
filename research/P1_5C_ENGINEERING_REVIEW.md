# P1.5c bounded page-metadata engineering review

Date: 2026-09-22

Reviewed implementation commit: `8b9eabf46f5cd715029b2a86df06d61e093a83d8`

Audit-reconciliation commit: `db331dedc3dd626050238926a9ab00ce4a34560c`

Reviewer provenance: one separate read-only agent task
`p15b_final_audit`, commissioned by the Lead/orchestrator. The same reviewer
applied Trust/Security and Quality engineering lenses. This was an AI
engineering review, not two independent people, qualified legal advice, a
store-policy decision, owner browser evidence, or release approval.

A second read-only AI task, `final_consistency_review`, checked only the final
cross-file status and gate claims. It found one stale threat-model sentence,
the Lead corrected it, and the checker then reported no remaining blocker. It
was not a second independent code/security review.

## Scope

The review covers only the accepted ADR-011 P1.5c experiment: the unpacked
Chromium manifest and popup, exact two-route policy and expiry, isolated
top-frame packaged collector, strict metadata contract, document attestation,
final active-tab check, safe rendering, synthetic fixture and loopback server,
package/capability boundaries, automated tests, threat model, and status
claims.

The only eligible routes are the exact project-owned loopback fixture and the
pinned MDN metadata-reference page. The slice reads bounded direct-head title,
description, canonical, publication, robots, and TDM-reservation candidates
after an explicit click. It has no body, visible-text, JSON-LD, frame, cookie,
storage, authentication/paywall, network, logging, telemetry, model,
fingerprint, resolver, or Topic-decision path.

## Control matrix

| Control | Result | Principal evidence |
| --- | --- | --- |
| Package and permission boundary | PASS | Manifest V3 requests exactly `activeTab` and `scripting`, requires Chrome 106+, disables incognito, declares no host/background/content/storage/network capability, and keeps a connection-denying CSP. Package inventory and import/resource closure are tested. |
| Route and expiry boundary | PASS | Eligibility accepts only the two literal queryless URLs after fragment removal. Nearby paths, ports, hosts, credentials, queries, privileged schemes, case variants, numeric/octal loopback forms, and dot-segment aliases reject before injection. The MDN record expires at `2026-10-23T00:00:00.000Z`. |
| Collection minimization | PASS | One packaged isolated-world collector targets top-level frame 0, validates document identity before touching metadata, scans at most 256 direct `head` children, and retains at most 32 exact-selector candidates. |
| Contract and policy controls | PASS | Exact plain-data schemas enforce field/source allowlists, raw and output bounds, deterministic precedence, duplicate agreement, safe text, timezone-qualified publication values, same-origin queryless canonical hints, and fail-closed supported in-head robots/TDM controls. Missing optional values are explicit `null`. |
| Navigation and concurrency binding | PASS with documented residual | The result carries Chrome's document ID, a second injection attests that exact document, a final active-tab read rechecks tab and URL, stale request tokens suppress superseded work, and scripting is bounded by a three-second timeout. A small post-check/pre-render same-URL reload or tab-switch TOCTOU window remains. |
| Semantic separation and temporal non-use | PASS | Static and resolver regression checks reject a metadata-to-resolver import or `publishedAtHint` input. P1.5c creates no fingerprint, candidate, Topic, Discussion, join, or match decision; publication time is display context only. |
| Rendering and retention | PASS | The popup uses `textContent`, clears prior values on loading/failure/reset, keeps valid description-list markup and visible context-only labeling, and has no persistence, logging, telemetry, or egress path. |
| Fixture and local-server boundary | PASS | The project-created script-free fixture is provenance-pinned. The server binds `127.0.0.1:4173`, serves one exact GET/HEAD route with defensive headers, and rejects queries and an unexpected Host. |
| General site/mobile/store eligibility | OUT OF SCOPE / STOP | The owner assumption that public head metadata is locally processable is sufficient only for this PoC experiment. It is not a legal conclusion, website permission, mobile/store decision, or authorization for another page or selector. |

## Findings resolved during review

The first audit of implementation commit `8b9eabf` found one medium
documentation issue and several low consistency or hardening issues. Commit
`db331de` resolves all of them:

- current package documentation now states the actual `activeTab` plus
  `scripting` permission and bounded live-MDN path; the earlier P1.5b checklist
  is explicitly historical;
- the threat model now classifies the exact live metadata and project-loopback
  exceptions accurately;
- route parsing rejects non-literal textual aliases instead of relying only on
  URL-parser normalization;
- scope, status, and threat-model claims accurately describe the residual
  post-attestation time-of-check/time-of-use window;
- optional-envelope wording matches the implemented `null` representation;
- ADR-011 records P1.5b as complete and marks model approval inapplicable to
  this no-model slice;
- a regression check makes the lack of a metadata-to-resolver path explicit;
  and
- the publication context note now uses valid description-list markup.

The reviewer inspected the remediation, reproduced the focused and targeted
checks, and reported no open finding.

## Reproduction evidence

Environment: Node 24 or newer under the dependency-free package.

- `npm run indicator:test`: 83/83 pass.
- Targeted policy/package/resolver remediation checks: 26/26 pass.
- `npm test`: 264 pass, one expected restricted-guard-only skip, zero fail.
- `npm run test:restricted`: 265/265 pass, including the active guard
  self-test.
- `npm run check:secrets`: 95 files scanned, six detectors self-tested, zero
  findings.
- The loopback server probe returned the expected GET and bodyless HEAD
  responses with `no-store` and `nosniff`, rejected a query with 404, and
  rejected an unexpected Host with 400.
- `git diff --check`: clean.

## Dispositions

Trust/Security: **ACCEPT - exact P1.5c engineering slice only.** No open
engineering finding remains inside the accepted two-route, locally processed,
no-egress metadata boundary.

Quality: **ACCEPT - implementation at `8b9eabf`, reconciled by `db331de`.**
The contracts, package boundary, tests, accessibility markup, documentation,
and non-claims are internally consistent.

At review time these dispositions did not complete P1.5c because the separate
owner-run Chromium smoke was still required. The owner subsequently reported
all documented permission-presentation, controlled-fixture, signed-out MDN,
navigation/closure, traffic, storage, console, and keyboard checks passing on
2026-09-22. `P1_5C_MANUAL_SMOKE.md` records that evidence and its limits.
Together they close only the exact P1.5c experiment, not broader P1.5.

## Residuals and next stop

- The document-ID attestation and final tab check cannot eliminate every
  asynchronous change after the last applicable check and before synchronous
  rendering. Impact is limited to transient local display because the result
  is neither persisted nor transmitted and the next click starts fresh.
- The adapter can see supported in-head controls only. It does not inspect HTTP
  headers, `robots.txt`, a sitewide TDM file, authentication, subscription, or
  paywall state and makes no complete rights-detection claim.
- The real-page rights record is route-specific and time-limited. Rechecking
  the page, terms, licence, and applicable signals is required after expiry or
  before any route change.
- No general third-party-page, Firefox, Android, iOS, production, legal,
  store-review, deployment, spending, or publication evidence exists.

Stop before another URL, field, selector, permission, body/JSON-LD/WebView
read, semantic connection, model/provider, storage, egress, telemetry,
deployment, store submission, or publication. Each applicable owner,
Security/Trust, Privacy, Policy/Rights, provider, spending, deployment, and
publication gate remains explicit. The 200-to-250-pair provenance-approved
human review is a separate later checkpoint and has not been started.

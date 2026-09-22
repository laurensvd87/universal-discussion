# P1.5a bundled-fixture browser engineering review

Date: 2026-09-22

Reviewed implementation commit: `608a2ba`

Reviewer provenance: one separate read-only agent task
`next_slice_audit`, commissioned by the Lead/orchestrator. The same reviewer
applied Trust and Quality engineering lenses; this was not two independent
people, a human security/privacy review, or owner approval. The Lead recorded
the result. After disposition, the Lead applied the reviewer's narrower
threat-model wording for source-level capability evidence; implementation and
test behavior did not change before commit.

## Scope

The review covers the browser-neutral indicator contract/controller, bundled
synthetic fixtures, Chromium manifest and popup, package/provenance boundaries,
tests, threat-model/ADR/roadmap/status wording, and repository verification at
`608a2ba`.

It covers only a developer-loaded, zero-permission fixture popup. It does not
cover current-tab/page access, extraction integration, real browsing data,
browser-level traffic/storage inspection, remote lookup, persistence,
telemetry, identity, posting, semantic quality, deployment, or publication.

## Control matrix

| Control | Result | Principal evidence |
| --- | --- | --- |
| Package and permissions | PASS | Exact package inventory; Manifest V3 has no permissions, host permissions, background/content scripts, web-accessible resources, or external connection; incognito is disabled. All document resources and module imports resolve inside the unpacked `browser/` root. |
| Capability and egress | PASS for source boundary | Runtime allowlists/static checks reject network, extension, storage, logging, dynamic-code, unsafe-HTML, process, and Node capability use; full suite passes with external capabilities denied. This is not browser-level traffic proof. |
| Response integrity | PASS | Strict plain-data schema, exact fields, bounded strings/nodes/depth/counts, canonical reserved-domain URLs, activation binding, and cross-bindings among Source, mapping, Topic, Discussion, topic-scoped activity, and timestamps. |
| Fail-closed behavior | PASS | Unmapped, unsupported, malformed, rejected, stale, reset, and superseded results cannot display a resolved count; invalid newer activations invalidate older work. UI phase is separate from terminal lookup outcome. |
| Rendering and injection | PASS | Local CSP allows self-hosted scripts and disables objects; HTML has no inline handlers/scripts or remote assets; all fixture values use `textContent`; markup-like title text remains inert. |
| Identity/count provenance | PASS | Human and agent counts remain separate. Three displayed Source/mapping records are pinned against deterministic resolver output, including a distinct hostile-title Source. Fixture manifest 1.2.0 records project-created synthetic provenance. |
| Accessibility/support claim | PARTIAL by design | Static labels, unique IDs, live region, and DOM bindings pass. No real Chromium visual/keyboard/screen-reader smoke or Firefox adapter run was performed, so the full P1.5 support gate remains open. |

## Findings resolved during review

- The first package layout placed shared imports outside the documented
  unpacked root. The manifest now lives at `browser/`, and an import/resource
  closure test prevents recurrence.
- The first result shape validated individual IDs/counts without proving that
  they belonged to one Source/Topic/Discussion. Explicit mapping, Discussion,
  activity-scope, Topic, and freshness bindings plus cross-wire tests now fail
  closed.
- Transient `idle`/`loading` values initially occupied the same field as
  terminal lookup outcomes. The view now separates `phase` from `outcome`.
- An invalid newer activation initially did not supersede older in-flight work.
  It now clears state and invalidates the older activation.
- The hostile-title scenario initially reused another immutable Source while
  changing its title. It now has its own resolver-derived Source and mapping.
- The controller briefly allowed `/` in scenario identifiers while the
  response contract did not. The allowlists now match, and `a/b` is a
  regression case.
- Browser fixtures were added to the provenance manifest and browser runtime
  modules to the capability boundary; the scanner now includes CSS.

## Reproduction evidence

Environment: Node 24 or newer under the repository's dependency-free package.

- `npm run indicator:test`: 21/21 pass.
- `npm test`: 202 pass, one expected restricted-guard-only skip, zero fail.
- `npm run test:restricted`: 203/203 pass, including the active guard self-test.
- `npm run check:secrets`: 78 files scanned, six detectors self-tested, zero findings.
- Browser JavaScript syntax, manifest JSON parsing, package/import closure,
  and staged diff whitespace checks pass; only expected local autocrlf notices
  appeared before commit.

## Dispositions

Trust: **ACCEPT — exact bundled-synthetic-fixture P1.5a slice only.** No
blocking Trust finding remains inside the zero-permission source/package
boundary.

Quality: **ACCEPT — code and package contract at `608a2ba`; not the full P1.5
browser gate.** Focused and full verification reproduce with no failure.

## Residuals and next stop

- A real Chromium load, browser-level traffic/storage inspection, and
  visual/keyboard/screen-reader smoke remain unperformed. Firefox support is
  untested and unclaimed.
- Hidden resolved DOM strings are not cleared when a later state hides the
  resolved panel. This is non-visible synthetic data today; clear it before
  any real-page adapter so hidden stale URL/title data is not retained.
- The local fixture Promise needs no timeout in practice. Any slower local or
  remote adapter requires bounded timeout/cancellation and an accepted
  freshness/staleness policy.
- Static capability scans are defense in depth, not proof against every Web
  Platform exfiltration primitive. A real browser test must inspect traffic,
  storage, built contents, effective permissions, and CSP behavior.
- The contract supports only pinned exact-fingerprint fixture resolution.
  Exact-URL, curated/confirmed, suggestion, correction, and end-to-end local
  paths required by the wider ADR-009 PoC remain open.
- No B-ELIG result, active-tab/navigation binding, extraction integration,
  privacy review, egress/retention decision, store compatibility, or automatic
  semantic-quality evidence exists.

Stop before adding `activeTab`, `tabs`, content injection, real page
observation/extraction, persistence, or a service. The owner must explicitly
dispose ADR-006 and approve the exact local browser fields/permissions; Trust
and privacy review must then be repeated. Deployment, spending, recruitment,
publication, and the provenance-approved 200-to-250-pair real review remain
separate later gates.

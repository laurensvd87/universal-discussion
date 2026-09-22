# P1.5b active-tab-only URL observation engineering review

Date: 2026-09-22

Reviewed implementation commit: `53c7e84c0eca5e9547b90d23984ac940e1aaf24d`

Checklist reconciliation commit: `4e782e4`

Reviewer provenance: one separate read-only agent task
`p15b_final_audit`, commissioned by the Lead/orchestrator. The same reviewer
applied Trust and Quality engineering lenses. This was an AI engineering
review, not two independent people, a human security/privacy review, a legal
or store-policy opinion, owner manual-browser evidence, or release approval.

## Scope

The review covers the exact ADR-010 P1.5b slice: Chromium manifest and popup,
active-tab reader, exact URL policy, two-read controller, URL-to-Source lookup
receipt, existing Source-to-Topic mapping, strict response contract, rendering,
package and capability boundaries, tests, threat model, and status/roadmap
claims.

It covers only a developer-loaded, user-invoked, popup-memory-only lookup for
the two queryless reserved-domain URLs. It does not cover title, metadata, DOM,
body, frame, WebView, authenticated/private/paywalled content, persistence,
network egress, telemetry, semantic suggestions, providers, mobile or Firefox
adapters, store submission, deployment, spending, or publication.

The reviewer also checked ADR-011 and the content-acquisition research for
scope honesty only. The generic standards-based metadata direction remains a
proposal and authorizes no live extraction.

## Control matrix

| Control | Result | Principal evidence |
| --- | --- | --- |
| Package and permission boundary | PASS | Manifest permission is exactly `activeTab`; incognito is disabled; there are no host, broad `tabs`, `scripting`, content/background, storage, network, telemetry, or remote-resource capabilities. Exact package inventory and import/resource closure are tested. |
| Minimized browser projection | PASS | Every invocation performs a fresh `tabs.query({ active: true, currentWindow: true })`; the adapter reads and retains only `id` and `url` from the returned Tab object. |
| URL eligibility | PASS | The policy accepts only normalized `https://example.com/` and `https://example.org/`, strips only a fragment, and rejects queries, credentials, malformed URLs, non-HTTPS URLs, and every other route without echoing the input. |
| Identity and provenance binding | PASS | The URL-to-Source receipt binds method, normalized URL, and Source ID separately from the exact-content-fingerprint Source-to-Topic mapping. Source, scenario, mapping, Topic, Discussion, activity, and request token are cross-bound by the strict contract. |
| Navigation and concurrency safety | PASS for the code boundary | A second fresh active-tab read must match tab ID and normalized URL. Stale checks follow each asynchronous boundary; reset and newer activations invalidate prior work. Failures produce generic unsupported or unavailable states. |
| Rendering and retained values | PASS | All values render with `textContent`; every render clears previously resolved DOM fields before deciding whether the next state is resolved. CSP and static capability checks deny connections, unsafe HTML, dynamic code, storage, and logging paths. |
| Test and provenance evidence | PASS | Both active URLs are pinned project-created synthetic fixtures with distinct Sources, one shared Topic/Discussion, separate human/agent counts, and explicit `NO AUTO` scope. |
| General extraction/store eligibility | OUT OF SCOPE / STOP | No content read exists. ADR-011 correctly keeps live metadata/body access behind separate owner, Security/Trust, Privacy, rights/store-policy, and Quality approval and makes no store-acceptance guarantee. |

## Finding resolved during review

ADR-010 required the real-browser smoke to exercise private/local, navigated,
and closed-tab cases, but the first browser README checklist did not name those
three cases. This was a low documentation/process gap, not a code-safety
finding: automated tests already covered URL/tab changes, read failure, and
exact allowlist rejection.

Commit `4e782e4` adds a safe local-address rejection case and breakpoint-driven
navigation and closed-tab steps without asking the owner to open real private
content. The reviewer verified the documentation-only change, ran
`git diff --check` and the secret scan, then reported no open engineering
finding.

## Reproduction evidence

Environment: Node 24 or newer under the dependency-free package.

- `npm run indicator:test`: 46/46 pass.
- `npm test`: 227 pass, one expected restricted-guard-only skip, zero fail.
- `npm run test:restricted`: 228/228 pass, including the active guard self-test.
- `npm run check:secrets` on the audited implementation/checklist tree: 84
  files scanned, six detectors self-tested, zero findings.
- `git show --check 53c7e84`: clean.
- The reviewer separately verified that only the documented checklist changed
  in `4e782e4` and that its diff and secret scan remained clean.

## Dispositions

Trust: **ACCEPT - exact P1.5b engineering slice only.** No open engineering
finding remains inside the accepted local URL-only boundary.

Quality: **ACCEPT - code/package contract at `53c7e84`, with the checklist
reconciled by `4e782e4`.** Automated evidence reproduces without failure.

These dispositions do not close P1.5b. The required owner-run manual Chromium
smoke is still pending.

## Residuals and next stop

- Browser-level permission, traffic, storage, console, CSP loading, and
  keyboard/accessibility evidence remains mandatory.
- Two reads cannot distinguish a same-tab/same-URL reload or document
  replacement and leave a small post-second-read time-of-check/time-of-use
  window. That is acceptable for this local exact-URL fixture lookup, not for
  future metadata or body extraction.
- Chromium necessarily returns a broader Tab object, although audited code
  accesses and retains only ID and URL.
- No Firefox, Android, iOS, store-review, legal, or qualified human policy
  evidence exists.
- An unresolved browser API Promise has no explicit timeout; popup lifetime
  bounds the local experience. Any slower adapter needs a reviewed timeout and
  cancellation policy.

Stop before adding a larger URL set, `tabs`, `scripting`, host access,
title/metadata/DOM/body/WebView extraction, storage, egress, telemetry, model or
provider use, deployment, spending, or store/publication action. The next
immediate input is only the bounded manual Chromium smoke documented in
`spikes/topic-resolution/browser/README.md`. The 200-to-250-pair
provenance-approved human review remains a separate later checkpoint.

# P1.5b owner Chromium manual smoke

Date: 2026-09-22

Result: **PASS for the exact local ADR-010 / P1.5b boundary**

Executor: project owner, using a locally loaded unpacked Chrome/Chromium
extension. The project currently has one human builder, so this is owner
evidence rather than an independent-person review. The exact browser version
was not recorded.

Artifact basis: the owner exercised the P1.5b package after implementation
commit `53c7e84`, checklist reconciliation `4e782e4`, and engineering-review
record `f2496a9`. Browser-to-Git artifact identity is based on the owner's local
workflow and report, not a signed build or automated browser attestation.

## Reported observations

| Check | Result | Owner-reported evidence |
| --- | --- | --- |
| Unpacked package and permission inspection | PASS | The owner completed the setup/inspection portion before requesting instructions for step 7 onward. The exact checked package separately pins only `activeTab`, disables incognito, and contains no host permission, site-access list, or background worker. No permission-detail screenshot was retained. |
| Supported `example.com` route | PASS | `https://example.com/` resolved to “Reserved-domain demonstration A”, Topic `topic_d5d91cb67852edba65a9e2d0`, Discussion `discussion_786f004f0db183c413448b09`, 1 human and 1 agent contribution, `exact-normalized-url` Source lookup, and `exact-content-fingerprint` mapping. |
| Fragment handling and shared Topic | PASS | `https://example.org/#manual-fragment` resolved to distinct demonstration B while retaining the same Topic and Discussion, separate 1/1 counts, exact URL Source lookup, and exact-fingerprint mapping. |
| Query, local, and restricted rejection | PASS | `https://example.com/?manual-probe=1`, `http://127.0.0.1/`, and `chrome://extensions/` each displayed `unsupported` / `local-context-unsupported` without prior resolved fields. No real private, authenticated, or paywalled page was used. |
| Navigation and closed-tab races | PASS | After clarification that the breakpoint must start from a supported page, the owner reported both breakpoint-driven navigation and closed-tab cases in checklist step 7 as OK. |
| Bundled and hostile scenarios | PASS | The owner reported all checklist step 8 fixture scenarios as OK, including inert hostile text and cleared non-resolved states. |
| Traffic | PASS | After clearing the popup DevTools Network panel and exercising the checks, the only reported row was bundled `popup.css`. The owner confirmed its Request URL began with `chrome-extension://`; no HTTP(S) or other external request was reported. |
| Console and storage | PASS | The Console remained empty. Application/extension storage was inspected after locating the hidden Application panel and reported empty. |
| Keyboard and visible status | PASS | The owner reported the keyboard activation, visible focus, scenario selection/submission, and visible status checks as OK. |

The owner supplied a Network-panel screenshot during the review session. The
image itself is not checked into the repository; the observed local stylesheet
row and subsequent `chrome-extension://` confirmation are recorded above.

## Disposition and limits

This evidence closes the manual-browser requirement for the exact P1.5b local
URL-only proof-of-concept slice. Together with the automated evidence and the
Trust/Quality engineering review, P1.5b is complete.

It does not establish semantic matching quality on real pages, packet-level
network absence, accessibility conformance, Firefox/Android/iOS compatibility,
general page or WebView extraction rights, store acceptance, deployment
readiness, or publication approval. The small same-URL document-replacement
and post-second-read race residuals in `P1_5B_ENGINEERING_REVIEW.md` remain.

Stop before broader URL eligibility, `scripting`, title/metadata/DOM/body
access, storage, egress, telemetry, provider/model use, deployment, spending,
or publication. The next content increment requires explicit disposition of
ADR-011 and its owner, Security/Trust, Privacy, rights/store-policy, and Quality
gates.

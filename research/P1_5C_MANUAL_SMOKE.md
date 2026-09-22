# P1.5c owner-reported Chromium manual smoke

Date: 2026-09-22

Owner report: **PASS — all documented checks worked**

Implementation commit: `8b9eabf46f5cd715029b2a86df06d61e093a83d8`

Audit-reconciliation commit: `db331dedc3dd626050238926a9ab00ce4a34560c`

Engineering-review record commit: `cfb08203e0cf36ac6930ee5276b4ad0e00fb8dc1`

## Evidence provenance

The owner was given the complete P1.5c checklist in
`spikes/topic-resolution/browser/README.md`, received simpler instructions for
the less obvious steps, and then reported, "okay, all works." The Lead maps
that blanket statement to a pass for every listed criterion. This is
owner-reported manual evidence, not an automated-browser transcript,
screenshot set, independent-human review, formal accessibility audit, legal
opinion, store review, or release approval.

The test used an unpacked Chrome/Chromium extension. The exact browser product
and version were not reported, so this record makes no version-specific
compatibility claim. No observed MDN metadata values were requested from or
reported by the owner, and none were committed.

## Reported results

| Check | Result | Recorded observation |
| --- | --- | --- |
| Package and permission presentation | PASS | The reloaded unpacked package presented the documented `activeTab` plus `scripting` boundary, with incognito disabled and no site-access list, background worker, or content script. |
| Controlled fixture | PASS | The explicit metadata action showed the expected synthetic Harbor Barrier title, description, exact observed/canonical URL, and context-only publication hint; the body decoy did not appear. |
| Fragment and query handling | PASS | A fragment-only variant remained eligible. A query variant became unsupported and cleared all previously rendered metadata values. |
| Exact signed-out MDN route | PASS under the predeclared criterion | The owner reported the check worked. The checklist permitted either a bounded resolved envelope or a clean unsupported/unavailable terminal state. The exact terminal state and page values were deliberately not collected. |
| Rejected contexts | PASS | The nonallowlisted public context, privileged extension page, nearby loopback route, and query-bearing approved routes failed closed and did not retain old metadata. |
| Navigation/reload race | PASS | Pausing immediately before document attestation, then reloading or navigating the source tab and resuming, produced no stale metadata. |
| Closed-tab race | PASS | Closing the source tab while paused before attestation and resuming produced no stale metadata. |
| Network boundary | PASS | After clearing popup Network, local, MDN, and rejected checks added no extension-originated external request. Local `chrome-extension://` resources and the page's own traffic were treated according to the checklist. |
| Console and storage | PASS | The popup Console remained without extension error/output and extension storage remained empty. |
| Keyboard and visible state | PASS | Keyboard-only focus and activation worked, with visible focus and visible status changes. |
| Fixture-server cleanup | PASS | The checklist's final `Ctrl+C` cleanup was included in the owner's all-checks-pass report. |

## Disposition

The exact P1.5c two-route experiment is **complete** when this owner evidence is
combined with:

- the implementation and automated evidence at `8b9eabf`;
- the audit reconciliation at `db331de`; and
- Trust/Security and Quality engineering ACCEPT recorded in
  `P1_5C_ENGINEERING_REVIEW.md`.

Completion means only that the bounded, explicit-click, locally processed,
no-egress Chromium experiment behaved as specified on the owner's setup. It
does not complete the broader P1.5 browser/product flow and does not authorize
another route, field, selector, permission, browser, mobile adapter,
page-body/JSON-LD read, semantic decision, persistence, egress, provider,
deployment, store submission, spending, or publication.

## Residuals

- This is a concise owner self-report rather than captured or independently
  witnessed browser evidence.
- The exact Chrome/Chromium version and displayed extension artifact identity
  were not reported.
- The signed-out MDN check intentionally records no live page value or exact
  terminal state; it establishes only that the approved pass/fail behavior was
  observed without an unsafe or stale result.
- The small post-check/pre-render TOCTOU residual documented in the threat
  model remains; no result is persisted or transmitted.
- The route-specific MDN rights record still expires at
  `2026-10-23T00:00:00.000Z`, but the one approved live-page test campaign is
  already complete and its authority is consumed. Any later use needs fresh
  explicit owner and Policy/Rights approval even before that date.
- The owner's PoC assumption that public head metadata is locally processable
  is not a legal conclusion or publication/store-acceptance guarantee.

The 200-to-250-pair provenance-approved human semantic review remains a
separate later gate and was not part of this smoke test.

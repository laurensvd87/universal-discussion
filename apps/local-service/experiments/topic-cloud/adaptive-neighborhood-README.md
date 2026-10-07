# Adaptive whole-neighborhood shadow comparison

This is an offline, socket-denied, synthetic fresh-batch comparison. It imports
the current production planner only to read its partition result. Neither side
opens a database, calls a provider, retains input, assigns Topic IDs, moves
comments, or changes the production rule.

From the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-cloud/adaptive-neighborhood.test.js
```

Five tests pass. The invented vectors show:

| Case | Measured shadow outcome |
| --- | --- |
| Three mutually 0.92-similar pages | Current fresh-batch planner keeps three singletons; whole-neighborhood admission makes one group in every tested input order. |
| Bridge with two 0.92 edges and an endpoint pair below 0.90 | Complete-link admission keeps one endpoint outside. |
| Two supported 0.94-cohesive subgroups | A 0.04 separation boundary keeps the groups apart. |
| Exact duplicate copies on each side | Copies add no independent subgroup support. |
| Semantically different fixture pair at cosine 0.93 | The proposed rule falsely joins them. |

The shadow first finds 0.94 complete-link groups with at least two independent
representatives. A pair of those groups establishes a protected boundary if
their minimum internal cohesion exceeds their strongest cross-pair similarity
by at least 0.04. It then greedily admits complete-link groups at 0.90 without
the production planner's global outside-member margin, while respecting those
boundaries. Ties resolve by stable Source ID. This removes the known three-page
margin veto without using current Topic membership as evidence.

The procedure is intentionally limited to an unpinned fresh batch. It does
not implement manual links, sticky supported splits, existing Source/root
movement, representation-stamp pinning, Forget, or transactional Topic reuse.
It scans pair similarities and repeatedly considers group pairs, so it is not
a scalable incremental design. Invented cosine geometry cannot establish
same-subject meaning; the hard negative proves the rule can falsely combine
different subjects even in this tiny suite.

Activation requires a separately reviewed rule for existing assignments and
full ADR-023 lifecycle, plus provenance-approved real, graded labels that
measure same-subject false joins separately from related-page recall. Include
no-match, bridge, duplicate-majority, opposing-view, cross-language and
arrival-order slices; set acceptance criteria before tuning. Measure planner
p95 latency and growth on realistic catalogs. Any normalized-store migration
or owner-data regrouping remains under ADR-044/049's explicit owner and Trust
gate. This shadow alone authorizes neither action.

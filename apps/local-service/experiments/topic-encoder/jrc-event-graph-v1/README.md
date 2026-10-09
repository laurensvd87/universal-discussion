# JRC event-graph v1 — offline exploratory prototype

This directory compares one fixed, label-blind local-corroboration graph to
fixed 0.90 and 0.94 cosine connected components. It is **not** a validated
matcher or production proposal. The private approved JRC CSV stays outside
Git; the script prints only aggregate counts. It has no network or provider
access and never writes text, URLs, vectors, labels or row assignments.

Usage, from the repository root (PowerShell):

```powershell
node apps/local-service/experiments/topic-encoder/jrc-event-graph-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/jrc-event-graph-v1/run.js --private-dir <absolute-private-directory> --input <absolute-private-CSV> --split train
node apps/local-service/experiments/topic-encoder/jrc-event-graph-v1/run.js --private-dir <absolute-private-directory> --input <absolute-private-CSV> --split validation
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/jrc-event-graph-v1/core.test.js
```

There is deliberately no `test` scoring mode. Input SHA-256 is checked before
CSV parsing, and only the requested train or already-spent validation split is
embedded. The protocol's 212-title selected test split remains sealed.

The matcher uses the existing packaged E5 on title only, normalized title
tokens and URL host as a source proxy. `LABEL` is used only in aggregate
evaluation. It does not use the CSV's entity list, date or label description.
It is **not input-parity** with the live extension's body-derived retained E5
vector. URL hosts are not verified independent publishers. JRC labels may be
broad themes rather than precise app Topics, and cross-label event leakage
has not been conclusively adjudicated.

Fixed rule: cross-host cosine >=0.90 forms the candidate graph. An edge is
locally supported if title-token Jaccard >=0.50 or it has at least two common
0.90 neighbors. Supported edges are considered in descending cosine order.
Two singletons may join on one supported edge; a singleton joining a group
needs supported links to at least two group members. Two non-singleton groups
need at least three supported cross-links touching at least two members on
each side. There is no global all-outside veto and no Topic member cap.
Lack of support means abstention, not a claim of distinct identity.

This is a bounded development experiment: no threshold search on the five
validation labels; if the fixed prototype fails the precision/whole-group
comparison, stop. The 0.90 connected-component rule is a diagnostic baseline,
not an acceptable product policy.

The fixed candidate **failed** on the spent validation partition. See
[RESULTS.md](./RESULTS.md). Do not tune it on the same five labels and call
them independent validation; a separately developed/frozen candidate would
need a new independent holdout and stronger event-level adjudication.

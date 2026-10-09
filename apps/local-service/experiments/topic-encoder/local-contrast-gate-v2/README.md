# Local contrast gate v2: frozen development protocol

The frozen development run produced no eligible attachment and failed its
continuation screen; see [RESULTS.md](RESULTS.md). The v5 holdout remains
sealed.

This offline, event-level follow-up starts with v1's failed double-support
grouping: 84/270 true direct edges, 69/252 cross-language true edges,
0/5,508 false direct edges, and 2/18 complete events on C development.
The v5 holdout stays sealed. The primary Topic target is the owner's
provisional principal event (`eventKey`); chronological story stages may
appear as Related discussions. This rule is not deployed.

## Inputs and frozen fit

Reuse `event-token-pool-v3/adapter.js` byte pins and family partition:
A+B contain 162 fit and 54 calibration fictional reports; C1+C2+C3 contain
108 development reports from six disjoint families. Each event has six
articles in five languages. Use the unchanged packaged E5 title plus 384
body characters, at most 64 content-token states, 384D attention vector,
and 40-step v3 dynamic training. Verify model and all source/corpus byte
hashes. No new training or model download is part of this experiment.

Compute the v1 mutual-top-five graph and its calibration-only triangle and
double-support thresholds exactly as frozen in v1. Start from the connected
components of v1's double-support edges, including isolated articles.
An isolated article may attach to exactly one *existing* component with at
least two members. It needs two distinct members with triangle-eligible
edges (mutual top five, one common neighbor, contrast strictly above v1's
triangle calibration cutoff). If two existing components each offer two
links, abstain. Existing multi-article components never merge, and all
attachments are decided synchronously against the initial components; newly
attached articles supply no subsequent support. There is no member cap.

Rank an orphan's links into its unique qualifying component by local
contrast; take the second-largest as the limiting score. Subtract the
largest eligible link contrast to *any other existing multi-article
component*, or zero if none is positive. This is the attachment margin.
Attach only if this margin strictly exceeds the calibration margin cutoff.
The cutoff is the largest margin among **wrong-event** attachment proposals
in the 54-report calibration partition plus `1e-9`; if none exists, it is
zero. For this cutoff alone, construct proposals from mutual-top-five edges
with one common neighbor **before** the v1 triangle contrast cutoff. Applying
that cutoff first would remove every calibration false edge by construction.
The actual development attachment still requires the v1 triangle cutoff.
Labels select only this new margin cutoff, never a development edge. Add exactly
the two strongest links to the selected component. Stable article ID breaks
equal-score ties. Malformed graphs, scores and cutoffs fail closed.

Run once on C after lead review and code freeze. Print aggregate counts only:
direct true and false edges, within-family false edges, cross-language true
edges, mixed groups, false grouped pairs, complete events, singleton and
component counts, plus baseline and attachment counts. The continuation
screen requires **zero false edges, zero false grouped pairs, zero mixed
groups, at least 81/270 true edges, at least 63/252 cross-language true
edges, at least 4/18 complete events, and a strict gain over v1's two
complete events without losing any v1 double-support admitted edges**.
Because v1 admitted 84 true and 69 cross-language true edges on C, the
frozen rule must retain at least those exact edge sets. Development zero
false observations would be exploratory, not an independent precision claim.
A failed screen leaves v5 sealed. A passed screen still needs independent
review and a separately frozen one-shot holdout protocol before any claim.

The runner emits only aggregate counts and byte hashes. Text, token states,
vectors, pair scores and weights stay in RAM; it saves no artifacts and
denies provider/network access. It has no holdout loader. No live service,
extension, SQLite, permissions, retained vectors or discussion routes change.

Before review, run only:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/local-contrast-gate-v2/core.test.js
node apps/local-service/experiments/topic-encoder/local-contrast-gate-v2/run.js --dry-run
```

Do not run `--development` until the lead has reviewed and frozen this
README, tests and runner.

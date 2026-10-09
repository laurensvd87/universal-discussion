# Local contrast gate v1: frozen exploratory development protocol

This is an offline research branch after the v3 global cutoff admitted zero
links despite 106/108 correct nearest-event retrieval. It does not alter the
extension, service, SQLite, permissions, retained vectors, or discussion routes.
The owner provisionally defines a primary Topic by `eventKey` (ADR-064).
Different stages of one evolving story may be shown as Related discussions.

## Data, fit, and one development read

Reuse the hash-pinned, original fictional A/B/C1/C2/C3 records and partition
from `event-token-pool-v3/adapter.js`. A/B supply nine whole fit families
(162 reports) and three disjoint calibration families (54 reports). The C
chunks supply six wholly disjoint development families (108 reports). Each
event has six reports in five languages. Use the packaged E5 exactly as v3:
normalized title plus the first 384 body characters, first at most 64 content
token states, 384D attention output. Fit the unchanged v3 dynamic miner for
40 steps on the fit partition only. The v3 published development result is
context, not a source of labels or thresholds for this gate. Model and corpus
byte hashes are checked before use; the new runner has no holdout path.

Score every pair within calibration and development by cosine of its event
vectors. Sort each report's neighbors by descending cosine, then stable ID on
ties. A candidate pair must be **mutual top five**. Its local contrast is
`cosine(pair) - max(cosine(sixth neighbor of either endpoint))`. This compares
each candidate with nearby alternatives, not with the maximum unrelated
pair anywhere in the corpus. Count common neighbors in the mutual-top-five
graph. A Top-five neighborhood limits pair-search work only: components may
grow without any fixed number of Topic members.

Exactly these three variants are frozen before C is scored:

1. `triangle`: mutual-top-five pair, at least one common mutual-top-five
   neighbor, local contrast above its calibrated threshold.
2. `double-support`: same, but at least two common neighbors.
3. `seed-expand`: use `double-support`'s calibrated threshold. Seed edges
   require at least three common neighbors and must themselves participate
   in a triangle of such eligible seed edges. Then admit eligible two-support
   edges for an unassigned report only when at least two such edges lead to
   one seeded component and no other seeded component qualifies. Expansion
   occurs in synchronous rounds until unchanged. Seeded components are never
   joined by an expansion edge.
   This is a deterministic graph rule; no gold label or arrival order enters.

For each of variants 1 and 2, calibration threshold is maximum local contrast
of *different-event* calibration candidates under that variant's topology,
plus `1e-9`. Admission requires contrast **strictly above** this threshold.
If there are no such calibration negatives, use zero. The third
variant reuses variant 2's threshold, so its expansion receives no separate
development-tuned knob. If a calibrated threshold exceeds all candidate
contrasts, the variant abstains. Scores, support, and threshold must be finite;
malformed input fails closed. The calibration labels are used only for the
threshold, never at development admission. This is not a statistical error
bound: calibration has just three fictional families.

Run all three once on C, report every variant, and do not choose a winner by
repeated C tuning. For each, report direct true, cross-language true, false,
and within-family false edges; complete events, mixed groups and false
grouped pairs; singleton counts and number of admitted components. Report
retrieval separately. The preregistered continuation screen is **zero false
admitted edges including same-family, zero mixed groups, at least 81/270
true admitted edges, at least 63/252 cross-language true admitted edges,
and at least 4/18 complete events**. All five conditions must hold for a
variant. Density and order diagnostics are descriptive only. A failure means
no sealed v5 holdout. A pass still requires independent review and a
separately frozen one-shot holdout protocol before any independent claim.

This experiment emits only aggregate counts and code/model/corpus hashes.
It holds text, token states, vectors, weights and pair scores in RAM and saves
none of them. It makes no provider/network call or model download. Never
open `topic-benchmark/multilingual-holdout-v5` or another sealed holdout here.
Do not run `--development` before lead review of this README, tests, and code.

Safe pre-run commands:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/core.test.js
node apps/local-service/experiments/topic-encoder/local-contrast-gate-v1/run.js --dry-run
```

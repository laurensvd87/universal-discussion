# Frozen synthetic Topic identity experiment

Owner-approved ADR-019 A experiment only. No service/browser capture activation,
owner database/profile/page access, external requests, new model or dependency.
Every document and expectation is invented. Opposite judgments about one
discussion subject are positives; related distinct occurrences/issues are negatives.

Corpus SHA-256 before inference: `0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950`.
This hashes UTF-8 JSON.stringify of the exported object, preserving field/array order.
Corpus, evaluator and rule constants must remain unchanged after viewing results.
Five whole families are development; three whole families are held out. The corpus
has 32 documents, 16 narrow subjects and only two variants per subject. Translations
are project-created smoke examples, not independently reviewed annotations.

The initial run occurred before the intended git checkpoint. Its corpus digest,
labels, evaluator and rule constants were fixed before inference, but no
pre-inference git commit is claimed. They remain unchanged after adverse results.
Article preference/title + lead are preserved as a dormant proposal under
`spikes/topic-resolution/experiments/topic-input/`; production keeps legacy input
and grouping. Read [RESULTS.md](RESULTS.md) before considering another experiment.

Run from repository root:

```sh
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-identity/evaluate.test.js
node apps/local-service/experiments/topic-identity/parity-audit.js
```

Inference reads only fixed packaged extension assets. The production asset
manifest validates every executable/model/tokenizer hash before import. Missing
or modified assets fail without download. The same browser ONNX WASM runtime,
query prefix, 512-token truncation and masked mean/L2 pool run in Node CPU WASM.
This is numerical input evidence, not an actual-browser lifecycle test.
The unchanged inference runner is retained for reproducibility; do not run it as
a routine check. The parity audit tokenizes only the same 32 fixed documents,
using the preserved proposal helper. It does not load a model or perform inference.

Three transforms: current body prefix, normalized title plus leading text inside
one 4096-character limit, and title only as a diagnostic. None receives gold labels,
family names, split labels or IDs as model input. No stemming, sentiment stripping,
neutral summary generation or instruction-following capability is assumed.

The frozen threshold grid and selection objective are in evaluate.js: choose the
development threshold with maximum positive joins and zero false-positive pairs,
breaking ties toward higher thresholds; return no selection if none qualifies.
Report held-out results without tuning. The margin stays 0.04. Candidate recall
at 1/5, positive/negative score overlap, pair sweeps and all-member grouping under
three arrival orders expose limitations. Pair calibration ignores margin for its
selection objective; the separate sequential result exercises margin and clusters.
This is an experiment, not authorization to deploy its selected rule.

The original report is retained unchanged at `preliminary-space-results.json`.
It contains synthetic IDs, similarities, aggregate results and runtime provenance,
never vectors. The runner originally created `results.json` exclusively; the
artifact was subsequently renamed to make its original proposed transform explicit.
No conclusions establish broad news, cross-language or production
accuracy; this tiny adversarial corpus cannot calibrate a confidence percentage.

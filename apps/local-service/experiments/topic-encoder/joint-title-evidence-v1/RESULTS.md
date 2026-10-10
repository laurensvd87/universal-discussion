# Joint title evidence v1: rejected for activation

Measured locally on 2026-10-10. Production, retained fields, canonical writes
and the catalog were not changed. No provider call occurred. Private prose,
vectors, joint features and trained task-head weights remained RAM-only.

## Outcome

Joint title evidence improved ranking, but did not establish safe Topic
membership. The development-best relevance-plus-vector head admitted seven
wrong fresh links. Connected-component exposure amplified these into 316 false
page relationships affecting 49 articles in mixed groups. The larger joint
CLS heads also failed. Do not activate these heads, transfer their cutoffs,
or repair their fresh results by retuning the inspected test.

The experiment establishes a practical retained-title inference seam, not a
usable identity classifier. The fundamental remaining problems are candidate
retrieval loss, unsupported high-precision calibration and false-bridge
amplification. A high average-precision score is not a grouping safety test.

## Frozen comparison and input parity

The development source/parameter/calibration receipt was frozen before fresh
inference and reproduced exactly:

`e18d3d6f2cfdb0b79c616a18e85ebfcba3fd3bc5748f32d957c93addd6b08dcc`

Fitting used 192 reports/15 whole events, calibration 98/8, and reused
development 150/13. The fresh shared selection contained 296 reports/24 events,
excluding 143 previously exposed whole events and their exact title/384-lead
keys. This is new-event evidence within the same corpus, not an independent
publisher/story-family corpus. No model, head, cutoff, input or candidate rule
was changed after development or from fresh results.

All selected fit/calibration/development/fresh titles were at most the app's
retained 200-character title budget; fresh maximum was exactly 200. The model
saw titles only for the main comparisons. Raw/adapted cosine features used
body-prefix E5 vectors. The diagonal comparator was fitted on this experiment's
192 body reports, not the separate 475-report title/lead adapter or the sibling
metric experiment. Its measurements must not be represented as those models.

Calibration and evaluation considered every raw-or-adapted cosine pair >=0.90;
there was no nearest-count pruning or membership cap. The 12,000-pair work
budget did not fire. Fit mining selected 774 pairs: 323 true and 451 false.
Calibration had 104 candidates, including only two negatives; reused
development had 148, including only one negative. Consequently its apparently
perfect admission precision was very weak evidence.

Fresh considered all 43,660 possible unordered article pairs and retrieved
292 candidates: 274 true and 18 false. It missed 1,474 of the 1,748 gold true
pairs (84.3%). The title verifier cannot recover pairs the E5 candidate radius
never supplies. All true admitted pairs in these comparisons were multilingual.

## Fresh results, unchanged calibration

Grouped pairs and pure/mixed pages below are connected-component exposure
diagnostics, not the production grouping policy. A component's indirect pairs
are counted because discussion visibility can be affected by a false bridge.

| Method | Direct true / false | Grouped true / false | Pure / mixed pages | Candidate AP |
| --- | ---: | ---: | ---: | ---: |
| Vectors (2 features) | 227 / 7 | 621 / 330 | 135 / 52 | 0.980847 |
| Relevance + vectors (4 features) | 261 / 7 | 718 / 316 | 147 / 49 | 0.997342 |
| Joint CLS (768 features) | 233 / 2 | 612 / 194 | 135 / 40 | 0.996769 |
| Joint + relevance + vectors (772 features) | 242 / 3 | 627 / 212 | 140 / 41 | 0.996979 |
| Raw body E5 cosine | 130 / 3 | 297 / 35 | 134 / 16 | 0.959678 |
| 192-fit diagonal body E5 cosine | 210 / 4 | 570 / 130 | 154 / 24 | 0.977071 |

The relevance-plus-vector head was development-best before this fresh result,
not selected from the fresh table. The CLS-only head makes fewer direct errors
than it, but still contaminates 40 articles; this is not an acceptable safety
tradeoff. The title model's added inference cost is not justified by these
results. Stronger ranking alone should not be substituted for event identity.

For transparency, the reused-development results were:

| Method | Direct true / false | Grouped true / false | Pure / mixed pages |
| --- | ---: | ---: | ---: |
| Vectors | 123 / 0 | 341 / 0 | 95 / 0 |
| Relevance + vectors | 138 / 0 | 372 / 0 | 100 / 0 |
| Joint CLS | 129 / 0 | 342 / 0 | 97 / 0 |
| Joint + relevance + vectors | 133 / 0 | 353 / 0 | 98 / 0 |
| Raw body E5 cosine | 83 / 0 | 195 / 0 | 73 / 0 |
| 192-fit diagonal body E5 cosine | 110 / 0 | 294 / 0 | 87 / 0 |

## Predeclared lead-text ablation

The fixed 120-pair reused-development work sample contained 119 true pairs
and one false pair. Title relevance AP was 0.999497; title-plus-384-lead AP was
0.999859. This positive-heavy sample cannot demonstrate reliable identity.
Applying the unchanged title-trained joint-plus-vector head to lead features
admitted all 119 true pairs and the one false pair, producing ten false
grouped relationships and eleven mixed articles. Reject this input transfer.
Lead text is unavailable to the retained backend and this ablation authorizes
neither its retention nor an additional vector.

## Runtime and artifacts

The first completed development run took 555,400 ms and 2,292 directional
cross-encoder calls. The frozen fresh run took 745,853 ms including rebuilding
all development state, 736 body-E5 article embeddings, 2,876 directional joint
calls and the slow lead ablation. These are offline pipeline times, not online
latencies with already-retained vectors. Inference was single-threaded WASM;
other local experiments caused some CPU contention.

The separate [benchmark.js](benchmark.js) was added after freezing the main
protocol, without modifying any receipt-bound source. It selected 64 unordered
fresh title pairs by a fixed label-blind hash work sample; it did not measure
quality or inspect task-head scores. Actual aggregate timings were:

- Model initialization: 1,334 ms.
- 128 directional calls / 64 symmetric pairs: 6,110 ms total inference.
- Mean / median / p95 symmetric pair: 95.472 / 81.308 / 172.043 ms.
- Mean tokens per direction: 43.078; zero token-sampled inputs.

This is an all-pair work sample, not precisely the candidate pool. It suggests
about 95 seconds for 1,000 comparable title candidates before other processing;
that is a workload projection, not a measured large-catalog service latency.
A future design would need label-blind retrieval and asynchronous work budgets
with unresolved evidence left pending, never arbitrary membership truncation.
No persistent pair cache or additional retained metadata is implemented or
authorized here.

The official model is
`cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`, revision
`1427fd652930e4ba29e8149678df786c240d8825`, Apache-2.0 per its pinned card.
The official 118,620,016-byte uint8 ONNX SHA-256 is
`6c2513767fb63d008a4377bef7a7a3555433d9436342bb53e35a3a72ffc52d4b`.
The RAM-only adapter exposes an existing CLS tensor without adding model
operations or weights; adapted SHA-256 is
`937a77f5df64febbfc970c432db3588c4d6e5b8d7710494019fbbc547d14d91c`.
Model/config/tokenizer/card and packaged runtime hashes are enforced in
[infer.js](infer.js). Model assets are outside Git; no article data or fitted
parameters were saved. There is no remote code or pickle loading.

Focused checks: six `core.test.js` tests pass, `benchmark.js` syntax checks,
the actual model smoke passes finite 768D features and exact pair-order
symmetry, and the frozen fresh receipt matches. Run tests with
`node --test --test-isolation=none apps/local-service/experiments/topic-encoder/joint-title-evidence-v1/core.test.js`;
default test subprocess isolation is blocked by the filesystem sandbox.

## Limits and next decision

GlobeSumm has event gold but no verified story-family, publisher-independence
or viewpoint gold. It cannot establish viewpoint-safe identity. Actual Chrome
reader extraction, adjacent-event/template hard negatives, broad outlet
variation and calibrated probability reliability remain untested. The .90
pool is still positive-heavy even in fresh evaluation; its two-negative
calibration was inadequate. Zero in-sample calibration errors were constructed
by the gate and were never an independent safety result.

Reject activation and retain this as negative research evidence. Do not spend
another reused-test threshold round. If a future joint verifier is considered,
it needs a new family/outlet-disjoint, adjacent-event-heavy evaluation and
fit/calibration support for the deployed candidate distribution, with exposure
metrics and frozen costs. Prefer evaluating the cheaper representation-level
candidate improvement before adding this model to the service.

Primary references: [official relevance-model card](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1),
[joint versus independent encoding](https://www.sbert.net/examples/cross_encoder/applications/README.html).

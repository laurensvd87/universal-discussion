# Event-token-pool v2 — bounded development experiment

This is an offline, CPU-only representation probe, not a live matcher or
activation request. It uses only the packaged multilingual E5 and the
project-original `multilingual-balanced-v1` train/validation. It does not
read either balanced test, the spent v3 holdout, or the new v4 holdout.
No new model/asset, network/provider call, persistent weights, vectors,
token states, article text, or row-level output is allowed.

## Frozen protocol before corpus execution

Input parity is deliberately limited: exactly the normalized `title` plus
the first 384 characters of `body`, passed through the already packaged
E5 `query:` path with 512-token model cap. This is the offline title+lead
surrogate, **not** the live extension's up-to-4,096-character body input.
The shared offline E5 hook copies at most the first 64 post-BOS/query-prefix,
pre-EOS content token states (384 float32 coordinates each) into RAM before
tensor disposal. No lexical event facts or gold labels enter inference.

The eight balanced train families are SHA-256 sorted with ASCII bytewise
comparison. The first six whole families (120 reports/12 developments)
fit the attention query; the other two (40/4) calibrate each variant's
cosine gate as maximum different-event pair score plus fixed `0.002`,
abstaining above 1. Validation is two other whole families (40/4) and
never fits weights or calibrates a cutoff. The sole grouping policy is the
unchanged triangle-supported threshold-edge component rule. No fixed
Topic-size cap is introduced; these small offline all-pairs tests do not
establish catalog-scale runtime.

Exactly three preregistered representations are compared in one pass:

1. `v1-attention-64`: frozen v1 reference, shared 384D attention query
   trained from zero for 40 full-batch Adam steps (`lr=0.01`, L2 `0.001`,
   gradient cap 1) on one static pooled-E5-mined triplet per fit article.
   Its unit-normalized softmax-weighted pool uses first up to 64 content
   token states, scale 8. Triplet loss is
   `softplus(cos(anchor,negative)-cos(anchor,positive)+0.05)`.
2. `prefix-attention-32`: identical architecture, optimizer, triplet
   mining and loss, fitted separately using only the first up to 32
   content-token states. This title-heavier compact vector tests whether
   later lead tokens blur adjacent developments. It is not a lexical
   action extractor; truncation may lose useful event facts.
3. `attention64-pooled25`: use the **same** trained 64-token query as (1),
   then L2-normalize `0.75 * attention_vector + 0.25 * packaged_pooled_E5`.
   This fixed residual tests whether preserving sentence semantics reduces
   attention overspecialization; it fits no extra parameters.

Triplet mining uses only six-family fit labels: hardest different-language
same-event positive and hardest same-family different-event negative under
unchanged pooled E5. The calibration families and validation labels cannot
enter query fitting. All variant cutoffs are train-calibration-only.
`prefix-attention-32` differs only in the token window; the residual
variant differs only in pooling. There is no optimizer, margin, residual,
window, gate or graph parameter grid.

The measured v1 development reference is retrieval@1 40/40 and @3 40/40,
triangle true retained edges 135/180, false 0/600 (hard 0/200),
cross-language true 120/160, complete developments 3/4, mixed groups 0.
Retrieval is saturated on this set, so a v2 candidate must **match** both
retrieval ranks rather than strictly improve them. To be selected, a
variant must retain zero false edges and zero mixed groups, recover at
least the v1 3/4 complete events, and strictly exceed v1 by reaching
4/4 complete events **or** more than 135 true edges. Among eligible
variants, choose by complete events, then true edges, then cross-language
true edges; exact ties between new variants prefer `prefix-attention-32`.
If neither new
variant qualifies, stop with a negative result. Selection on validation
is exploratory, not independent precision evidence. No v4 opening follows
without frozen-code review and a separately approved one-shot runner.

The pinned exact-byte corpus SHA-256 values are train
`6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632`
and validation
`734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5`.
Hash checks precede parsing. Aggregate-only output reports per-variant
cutoff, retrieval, retained-edge and whole-component counts, selection,
runtime and fixed input/model/code hashes. On numeric instability or
unexpected split/asset mismatch the runner fails closed with a fixed code.

Run fictional tests and a no-data dry-run from repository root:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/event-token-pool-v2/core.test.js
node apps/local-service/experiments/topic-encoder/event-token-pool-v2/run.js --dry-run
```

The `--development` run uses only pinned train and validation; it must
not be described as holdout evidence. Current app retention and Topic
routing are unchanged. Persisting an extra event vector or token states
would need separate owner/Trust approval and migration/privacy analysis.

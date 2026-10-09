# Event-token-pool v1 — frozen offline development protocol

This is **one** falsifiable token-level representation experiment, not a
production change. It reuses the already packaged E5 ONNX/tokenizer and
only project-original multilingual-balanced-v1 train and validation files
for development. The separate one-shot runner below uses balanced train
only for fitting and calibration, then the independent project-original
v3 challenge for evaluation.
No Wiki, JRC, GlobeSumm, user browsing data, balanced-corpus test, or
multilingual v3 holdout enters fitting or development selection. The v3
holdout remains sealed pending lead review of the one-shot runner.

## Frozen input and token rule

The offline E5 input is exactly the v5 surrogate: normalized `title` plus
newline plus the first 384 characters of `body`, using packaged `query:`
prefixing and the model's 512-token cap. The additive offline inference
hook copies `last_hidden_state` before ONNX tensor disposal. It verifies the
encoded leading BOS ID `0`, trailing EOS ID `2`, and the tokenizer's exact
`query:` token-ID prefix. The trailing space joins the first content token
under this tokenizer and is not separately skipped. It **skips** BOS, that prefix and
EOS, then takes the **first at most 64 remaining content-token states** in
input order. Each copied 384-float state is normalized to unit length for
the attention head; invalid or zero states fail closed. No token strings,
IDs, states, vectors or weights are printed or persisted. Copied arrays
remain in process RAM until garbage collection or exit; immediate memory
zeroization is not claimed. The title precedes
the lead; there is no language-specific stopword/action lexicon or test-
derived token selection.

## Frozen attention and training

One shared 384-parameter query `w` starts at zero. For an article's up-to-64
unit token states `h_i`, attention is `softmax(8 * dot(w,h_i))`; the article
event vector is the L2-normalized weighted sum of the token states. There
is one head, no bias, no projection layer or new model asset. Train one
`w` in RAM for **40 full-batch Adam steps**, learning rate `0.01`, L2
penalty `0.001`, gradient norm cap `1`, with a fixed softplus triplet loss
`softplus(cos(anchor,negative) - cos(anchor,positive) + 0.05)`.
Non-finite states, scores, gradients, parameters or degenerate vectors
fail closed; there is no post-result optimizer/temperature grid.

The eight existing balanced-corpus train families are sorted by SHA-256 of
their family key. The first six whole families (120 records) fit `w`; the
remaining two (40 records) are calibration only. Within the six fit
families, each anchor supplies exactly one static triplet selected with
**unchanged pooled E5**: the least-similar same-event report in another
language, and the most-similar different-event report in its own family.
No development, family or language label enters inference; they only choose
train triplets and score aggregate evaluation. The two balanced-corpus
validation families (40 records) stay separate and do not fit or calibrate.

The gate is the largest event-vector cosine among *all* 600 different-event
calibration pairs plus fixed `0.002`; if it exceeds 1, abstain. No
validation cutoff selection or refitting occurs. The sole hard-grouping
policy is the unchanged v5 triangle rule: retain a gated edge only if it
shares at least one other gated neighbor, then form components. Pair
retrieval ranks, retained edge admission, and whole-group quality are
reported separately. Baselines use the same E5 inference pass: raw pooled
E5 at fixed cosine `0.94`, and raw pooled E5 at its own max-calibration-
negative-plus-`0.002` gate. None is tuned on validation.

The **predeclared development screen** for the new event vector requires
zero false retained edges and zero mixed groups, at least **60/180** true
retained edges, at least **40/160** cross-language true retained edges,
and at least **1/4** complete developments. If any condition fails or
training is unstable, stop without opening an independent test. If it
passes, freeze code, input hashes and the exact cutoff, then seek lead
review before any one-shot untouched v3 holdout evaluation. A synthetic
pass would still not establish real cross-publisher safety.

The train/validation exact-byte SHA-256 digests are pinned to the corpus's
current frozen README: train
`6710E9EE4FD2A09E569FA60B624F599B2138A5A389C04C486CF714BDF985C632`,
validation
`734E23078B989DAEDC037E0C3B0416EF835877FD42C4678CF410C54FCA440AD5`.
Hash checks precede JSON parsing. The CLI denies network and subprocess
capabilities and emits only aggregate counts/fixed error codes.

Up to 64×384 float32 token coordinates use at most **98,304 bytes per
article**, plus transient model output; 200 article matrices would be about
19.7 MB of raw floats before JS/runtime overhead. The packaged model,
tokenizer and WASM assets already total about 149.7 MB on disk. No token
states or extra vector are **persisted** here. Retaining these states or an
extra event vector in the actual app would be a material new privacy,
storage, recapture/migration and owner/Trust decision; this research does
not authorize it. This brute-force 40-record grouping test is not a
catalog-scale performance result or a fixed Topic member cap.

From repository root:

```powershell
node apps/local-service/experiments/topic-encoder/event-token-pool-v1/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/event-token-pool-v1/core.test.js apps/local-service/experiments/topic-encoder/e5-infer.test.js
```

The development screen passed in one lead-run development evaluation. Its
selected attention cutoff is `0.8690268344580456`; the raw pooled E5
train-calibration cutoff is `0.9216038494934216`. The packaged model SHA-256
is `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.
This is development evidence, not an independent precision estimate.

## Preregistered one-shot v3 holdout

`run-holdout.js --one-shot` is a separate, explicitly gated entry point.
It reads only the pinned balanced `train.jsonl` (160 reports) before model
inference; it never opens balanced validation/test or another holdout. The
same SHA-256 family ordering allocates six whole families (120 reports/12
events) to 40-step attention fitting and the other two (40 reports/4 events)
to cutoff calibration. Validation labels cannot enter fitting, triplet
mining, calibration or cutoff verification. Before the v3 path is opened,
the runner checks reconstructed learned and raw cutoffs against the above
frozen values within `1e-10`, and checks the packaged E5 model hash. Any
mismatch fails closed. Code hashes are recorded in the aggregate report.

Only after those checks does it read the fixed relative path
`../topic-benchmark/multilingual-holdout-v3/holdout.jsonl` once, reject
symlinks/oversize files, check exact-byte SHA-256
`86FD3D5626A2C59ED0DDFF46AC6BB2386EC6A8E9FF163F8C5E95451C21BBBE2C`
before parsing, and validate the sealed schema and whole-event structure.
This is 60 reports, 15 gold events, 5 families, 90 true and 1,680 false
pairs (240 same-family hard negatives). Language is the fixed ID prefix;
gold `topicLabel` and `family` are used only for aggregate evaluation. The
matcher sees title+384-character lead token states and no gold label. The
cross-language true-pair denominator is computed from gold labels only
after opening for evaluation: each four-report event has at least three
distinct languages, but the denominator is not assumed to be 90 and never
influences fitting, cutoff or model input.

The sole primary method is the frozen attention event vector, frozen
`0.8690268344580456` threshold, and unchanged triangle-supported-edge
component policy. The fixed raw pooled E5 `0.94` and its own frozen
`0.9216038494934216` calibration threshold are diagnostic baselines, not
alternative selections. For all three, output is aggregate-only:
retrieval@1/@3, retained-edge TP/FP/FN/TN and precision/recall over all
60-choose-2 pairs (every report has a same-event mate; no no-match report),
hard-negative FP, cross-language true edge counts,
grouped-pair confusion, pure/mixed/singleton components, complete gold
events, exact gold-partition recovery, cross-event false joined pairs,
and per-language incident true-pair edge recall (a pair contributes to
each language present, so language denominators overlap). There is no
per-row, URL, title, text, token, vector, weight, label or assignment output.
Weights and copied states live in RAM only; no file cache is written.

The predeclared independent synthetic continuation screen is: zero false
retained edges and zero mixed groups; at least 30/90 true retained edges;
at least 25% of the actual cross-language true-pair denominator retained;
and at least 5/15 complete gold events. Report false grouped pairs even
if edge criteria pass. Passing this modest synthetic screen is only
permission to consider further independent research, not product
activation or real-publisher safety. Failing ends this candidate; no
threshold, token rule or graph retuning on this spent holdout.

The v3 README requires whole-partition metrics, but the dataset is authored
fiction, not independent publisher evidence. The one-shot brute-force
60-report evaluation says nothing about million-article scalability or
live input parity; retaining token states/event vectors in the app would
need separate privacy, storage and migration approval.

Safe pre-review checks, which do not open v3:

```powershell
node apps/local-service/experiments/topic-encoder/event-token-pool-v1/run-holdout.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/event-token-pool-v1/holdout-core.test.js
```

Do not invoke `--one-shot` until independent lead review and explicit
instruction. After one execution, v3 is spent for this method.

# Compact multilingual event encoder: research path (2026-10-09)

Status: research proposal only. No model was downloaded, trained, modified, or
requested from a provider for this note. It does not change a plan or ADR, and
does not authorize use of restricted corpora for training, new retained data,
an app change, or live Topic admission.

## Executive assessment

The most feasible route is a staged task-specific fine-tune followed by
distillation into a smaller multilingual student, evaluated against the
existing packaged E5 and a lightweight projection baseline. A projection or
adapter is the cheapest diagnostic and preserves the encoder footprint, but
cannot add facts the E5 representation never separates. Distillation is the
best eventual size path if (1) training material has explicit model-training
rights and (2) the student survives independent event-disjoint tests. Full
pretraining from scratch is not a practical first path: the existing
multilingual E5 model card describes pretraining on very large weakly
supervised data mixtures, including billions of text pairs, and supervised
fine-tuning across multiple retrieval tasks [E5 card/report](https://huggingface.co/intfloat/multilingual-e5-small),
[technical report](https://arxiv.org/abs/2402.05672).

The immediate failure is not just candidate discovery. Recent experiments
repeatedly find likely same-event neighbors and then either abstain on most
true pairs or admit a small number of dangerous adjacent-event false joins.
An encoder can improve the ranking geometry, but grouping still needs a
precision-first admission rule and complete-Topic evaluation. There is no
current evidence that a new encoder alone solves that second problem.

## Evidence read

- **Contextual-token attention, independently rejected for admission.** A
  384-parameter attention pooling head on packaged E5 token states, trained
  only on original synthetic reports, passed its 40-report development screen
  with 135/180 true and 0/600 false retained edges. On a separately authored
  frozen 60-report holdout it retrieved a same-event first neighbor for 50/60
  reports versus raw E5's 29/60, but admitted only 26/90 true edges and
  recovered 4/15 exact whole events, below the preregistered 30/90 and 5/15
  floors. No false joins were observed in that small challenge. This supports
  further study of token-level event representations, **not** a safe live
  matcher; the v3 holdout is spent and cannot guide a v1 revision
  [aggregate result](../apps/local-service/experiments/topic-encoder/event-token-pool-v1/RESULTS.md).
- **Independent synthetic pair-verifier rejection, 2026-10-09.** A 769-feature
  symmetric classifier on existing E5 vectors admitted 113/180 true and
  0/600 false pairs on its own development set, but complete-link made no
  whole events. A triangle-supported graph then appeared to recover 3/4
  complete development events. On a separately authored, frozen 80-report
  holdout, the unchanged model/cutoff/graph retained 282/360 same-event
  edges **and 194/400 adjacent-event hard false edges**, collapsing all four
  event families into mixed groups (0/8 exact events). The holdout is spent;
  this route is rejected, not a basis for another cutoff search. The result
  does not estimate real-site error, but directly falsifies the assumption
  that pooled E5 coordinate comparison plus triangle corroboration safely
  separates nearby actions [one-shot result](../apps/local-service/experiments/topic-encoder/offline-pair-verifier-v5/RESULTS.md).
- **JRC title-only pilot, real corpus, exploratory and negative.** The
  deterministic 1,200-title sample used packaged E5 on titles. Cross-language
  top-three retrieval was strong, but cross-language hard admission at cosine
  0.90 captured only 147/18,134 eligible validation pairs and included one
  false pair. The 0.90 validation rule made 22 false pair admissions, which
  connected-component grouping expanded to 687 false grouped pairs; it
  completely recovered only 2/5 validation labels. Train recovered 2/16
  labels at 0.90. The test split remains sealed. The leakage proxy did not
  verify event-disjointness or publisher independence. Most importantly,
  title-only input is not parity with the production body-derived E5 vector.
  The private CSV remains governed by [ADR-068](../decisions/ADR-068-jrc-cross-publisher-local-benchmark.md);
  it is not a training corpus under that approval.
- **Wikinews metric training and cross-corpus transfer, negative for
  activation.** A learned diagonal metric improved true joins only modestly
  over equally calibrated raw E5, while both rules admitted one false
  different-event pair on test. Transferring the Wikinews-fitted metric to an
  independent synthetic multilingual viewpoint set yielded 22/120 true pair
  joins and one false join, with zero exact five-report Topics. It ranked a
  same-development report in the top three for 59/60 reports. Wikinews
  editions and independent publishers reporting the same event are different
  distributions.
- **Synthetic event holdouts and relation features, limited/negative.** On
  v6, the exploratory topic graph admitted 79/120 true pairs and 8/1,650
  false pairs, all adjacent-family hard negatives; a nearest-neighbor veto
  removed these there but had seven false train joins. The stricter triangle
  admitted 21/120 true pairs with no false joins. A frozen relation model's
  full-text upper bound and retained-compatible title-plus-body-E5 ablation
  each retrieved a true neighbor in the top three for 60/60, yet each joined
  only 11/120 true pairs and recovered 0/12 complete Topics. The full-text
  lexical inputs are unavailable to the backend after capture. These small
  synthetic tests are valuable for task structure, not estimates of real-page
  error rates.

Together, these results show a retrieval/admission gap and weak whole-story
assembly. They do not establish that E5 is irredeemably unsuitable, nor that
training a new encoder will fix the gap. The JRC test partition is unopened;
do not treat the validation failures as a reason to tune another cutoff on
the same five labels.

## Candidate paths

| Path | What it changes | Feasibility and risk | Recommendation |
| --- | --- | --- | --- |
| Frozen E5 plus projection/adapter | Learns a compact output transform or a small parameter-efficient update over existing E5 vectors. A 384-to-128 linear projection is only about 49 thousand weights before bias; this is a dimensionality illustration, not a performance claim. | Lowest compute and simplest controlled comparison. Does not reduce the current encoder/tokenizer package size. The Wikinews diagonal metric showed only a small gain on synthetic transfer and still produced a false join. A projection can reshape distances, but cannot recover event facts discarded by pooling/truncation. | Run as the first supervised diagnostic, with hard adjacent-event negatives and separate retrieval/admission measures. Do not call it a compact encoder or production-ready representation. |
| Distill into a compact multilingual student | Train a smaller encoder to reproduce teacher neighborhood/ranking information and task labels. | Most plausible path to lower runtime and artifact size. Distillation can lose embedding quality, so size alone is not success. Multilingual MiniLM model cards show that multilingual sentence-embedding students are a viable model family, but its cited language coverage and generic paraphrase objective do not establish event matching quality. [MiniLM multilingual card](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2); [sentence-embedding distillation study](https://arxiv.org/abs/2112.05638). | Preferred second stage, only after the task-tuned teacher demonstrates robust held-out event separation. Distill the task behavior, not only raw E5 cosine scores. |
| Train a compact encoder from scratch | Learns tokenizer embeddings and all encoder layers from random initialization. | Highest data, compute, multilingual coverage, and rights burden. The current E5 is a 12-layer, 384-dimensional model with a 512-token limit and reports degradation for lower-resource languages; its training recipe used web-scale weak supervision and multiple supervised retrieval sources [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small). A project-scale story corpus is not enough to reproduce this broad language competence. | Do not start here. Reconsider only with a separately authorized, sufficiently large, licensed multilingual corpus and a concrete advantage over distillation. |

The repository's packaged E5 ONNX file is 118,308,185 bytes, with a tokenizer
around 17.1 MB according to the existing local embedding package notes. The
upstream model card reports 12 layers, 384 dimensions, a 512-token limit, and
broad multilingual coverage with uneven low-resource performance.
These are size/architecture reference points, not evidence for story matching.

## Rights-safe staged design

### Stage 0: freeze task and input parity

Use the same text the product can legally and technically encode: a bounded
article title plus a deterministic main-text prefix, or the exact current
body input if the experiment specifically compares against production E5.
Freeze extraction, max token count, languages, normalization, pooling,
quantization, and runtime. Keep title-only JRC results labeled title-only.
Do not add a second retained vector, query provider, or send content outside
the local research environment.

### Stage 1: original fictional event geometry

Build original synthetic stories with five-language reports where feasible.
Each event needs multiple independent report phrasings and viewpoints that
preserve the same core facts. Include:

- same event, same language, distinct author/publisher-style wording;
- same event across languages, with supportive, critical, neutral, skeptical,
  and public/consumer perspectives represented independently of language;
- adjacent events that share organization, people, location, and broad topic
  but differ in the decision, date, action, or outcome;
- same-entity unrelated events, near-duplicate headlines, generic background
  explainers, and no-match articles as hard negatives;
- mixed-language event sets, and language pairs held out from training where
  support permits.

Keep an event fact sheet separate from report writing: the fact sheet defines
the event identity and immutable facts; reports may differ in emphasis or
opinion but may not silently change the event. Split by event family before
writing or paraphrasing so a writer cannot leak the same event into test.
Counterbalance viewpoint by language, publisher-style voice, and position in
the corpus. A language must not act as a viewpoint label.

### Stage 2: rights-cleared supervision

Synthetic data is clean for task design but insufficient by itself for claims
about real publishers. For a real-data phase, acquire material only when the
rights holder or license explicitly permits local model training and the
intended evaluation; record provenance, attribution, territory, retention,
and deletion terms before ingest. Possible inputs are commissioned reports
under an explicit training license, original newsroom partnerships with
written permission, and public-domain or permissively licensed sources whose
terms actually cover text mining and model training. Dataset metadata or an
open-data badge alone is not enough. Do not train on the private JRC titles,
local user browsing history, or private Topic data under the approvals
currently recorded. Wikinews has the narrower research exception below.

The Wikinews corpus has a narrow, separately approved local offline training-
research scope under [ADR-066](../decisions/ADR-066-wikinews-multilingual-research-gate.md),
but its translation links are a weak proxy for cross-publisher viewpoints;
no weights or product model may be shipped from that approval. JRC remains
evaluation-only under ADR-068.

Human event annotations should distinguish: same exact development; related
but separate development; same named entity/theme only; unrelated; and
insufficient evidence. Annotate event boundaries at the development level,
not only broad subject categories. Where viewpoint is relevant, record it as
a separate field and ensure pairs are not labeled negative merely because
their stance differs. Keep source-level separation so train and test do not
contain duplicate syndication or the same publisher's rewritten copy.

### Stage 3: training recipe comparison

First freeze a projection baseline on the packaged E5 output. Train a shared
projection with supervised contrastive or multi-similarity loss: positives
are distinct same-event reports; negatives prioritize same-family adjacent
events and same-entity unrelated stories. Use language-balanced batches and
cross-language positive pairs. Add a modest teacher-ranking distillation loss
only as an ablation; pure teacher imitation can preserve the teacher's known
mistakes. Keep embedding normalization and output dimension explicit.

If the teacher creates better event separation on development data, distill
to a 2–6-layer student initialized from a rights-compatible multilingual
encoder. Use a combination of task-label contrastive loss, teacher soft
similarity/ranking targets, and language-pair consistency. Test that the
student does not collapse all reports with the same entity or broad theme.
Compare int8 and any smaller quantization only after float model selection;
quantization is a separate quality/runtime ablation. Do not train or save
weights from JRC or user data under current approvals. Wikinews may be used
only for the already approved, private in-memory training research; do not
save or ship a model derived from it.

### Stage 4: frozen evaluation

Use event-family-disjoint train, validation, and final test partitions. Add a
later-time test and unseen-publisher test when permissions and corpus size
allow. Preserve complete events in one split. Deduplicate exact and near
duplicates before partitioning; keep syndicated copies in one event/source
group. Select hyperparameters and admission rules on validation only, then
open the final test once. A revised candidate needs a fresh holdout or must
be marked exploratory.

Report retrieval separately from admission. At minimum measure Recall@1/5/10,
MRR, cross-language and cross-host retrieval, pairwise hard-match precision
and recall, false joins by negative class, abstentions, B-cubed cluster
precision/recall, complete event recovery, and exact group purity. Report
macro-by-event and micro metrics with cluster-level confidence intervals.
Stratify by language pair, publisher pair, report length, viewpoint relation,
event family, and group size. Include large groups without a product-size cap
and disclose whether a gold group is too broad for an atomic discussion.

## Proposed size and latency envelope (engineering targets, unmeasured)

These are proposals for an eventual student, not current device measurements:

- compressed model weights at or below **35 MB** and tokenizer at or below
  **6 MB**; total packaged model assets at or below **45 MB**;
- p95 CPU inference below **150 ms** for one 256-token article on a named
  mid-range Android reference device, and below **75 ms** on a named desktop
  reference; batch size one, warm and cold-start times reported separately;
- peak inference memory below **160 MB** in the same mobile test, with model
  initialization below **2 seconds** after assets are locally available.

No evidence yet shows a multilingual event encoder can meet all three while
keeping acceptable quality. The 2–6-layer student, sizes, and latency budgets
are design hypotheses; tokenizer vocabulary, operator support, WASM/WebGPU
availability, CPU characteristics, and quantization may dominate. The present
118 MB E5 ONNX file is already quantized, so a claimed smaller artifact must
be measured end-to-end with tokenizer and runtime included.

Any model shipped in an extension or mobile app can ultimately be extracted
and copied by a determined party. Compression or obfuscation may raise the
effort but is not a durable secrecy boundary; the defensible value would be
the quality of the Topic graph, discussions, source provenance, evaluation
process, and user experience around the model.

## Research gates, not automatic activation

Use the following as proposed research screens, not safety guarantees:

1. **Retrieval floor:** on untouched event-disjoint test, Recall@10 at least
   90% overall and at least 80% on each adequately supported cross-language
   and unseen-publisher slice. Report support and confidence intervals.
2. **Admission precision:** at the preselected operating point, at least
   99.5% pair precision with a cluster-bootstrap 95% lower confidence bound
   at least 99.0%, and no observed false joins in adjacent-event test pairs.
   Report recall and abstention beside it; abstaining on nearly everything is
   not a useful success.
3. **Whole-event quality:** at least 70% exact event-group recovery overall,
   with no high-volume language or publisher slice below 50%; report all
   incomplete and mixed groups. This is intentionally stronger than
   candidate retrieval.
4. **Footprint/runtime:** satisfy the stated package, latency, and memory
   targets on actual named devices after quantization, including cold start.
5. **Rights and isolation:** only explicitly training-cleared data enters
   gradients or saved weights; private research sources remain excluded under
   their current approvals. Final test labels remain unused until the model,
   threshold, and runtime package are frozen.

A failure on any screen means no research pass for this candidate. Passing all
screens would justify only another review of evidence and rights. It does not
automatically authorize training on restricted data, storing a new vector,
changing the live matcher, regrouping Topics, or releasing an extension model.

## Sources

- [Multilingual E5 model card](https://huggingface.co/intfloat/multilingual-e5-small)
  and [technical report](https://arxiv.org/abs/2402.05672).
- [Multilingual MiniLM sentence-transformer model card](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2).
- [DistilCSE: Effective Knowledge Distillation for Contrastive Sentence Embeddings](https://arxiv.org/abs/2112.05638).
- [ADR-068 JRC research boundary](../decisions/ADR-068-jrc-cross-publisher-local-benchmark.md)
  and private-corpus results summarized in
  [jrc-story-v1/RESULTS.md](../apps/local-service/experiments/topic-encoder/jrc-story-v1/RESULTS.md).

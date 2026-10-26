# Compact multilingual NLI development screen

Offline method screen; NOT activated. Local inference only, no provider requests,
canonical writes, account reads or owner URL/content egress. Same 120 public
retained titles as ADR-133, permanently DEVELOPMENT evidence, not fresh gold.

The original [author model](https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli)
is MIT. This experiment uses a **third-party**, not author-signed, quantized
[ONNX conversion](https://huggingface.co/onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX)
at revision `ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e`. The six-layer 384-hidden
model is 107,415,176 bytes, SHA-256
`55614f3c7da74184742eaa0006b978744437aa91de9ba4913db42f94d7844a8f`.
All nine artifacts have exact byte/SHA pins, including the existing checked
tokenizer JavaScript and WASM runtime; no PyTorch installation or E5 weight copy.

## Observed results, not suitable for rollout

The predeclared title-only NLI root hypotheses and entailment-minus-contradiction
ranking produced only **3/72 clear metadata roots compatible**. Restricting scores
to the existing E5 body/title top three candidates produced 12/72. These results
are poor; no NLI threshold, topic assignment or fallback has been adopted.
Unknown/ambiguous labels remain unscored, not negatives.

One session ran 1,920 pairs in 29,160.24 ms including setup; initialization
1168.68 ms. Pair median/p95 13.72/21.77 ms; all-16-root per-title median/p95
224.70/329.84 ms. Summed timing of the selected three pair evaluations was
43.12/62.89 ms, but that is NOT a measured end-to-end hybrid pipeline: it excludes
E5 retrieval/encoding, setup, queue and database. Full supervised process31.031s,
sampled RSS990,187,520/private commit1,035,313,152 bytes. Runtime speed is feasible;
this input/method configuration's quality is not.

The [official zero-shot implementation](https://github.com/huggingface/transformers/blob/main/src/transformers/pipelines/zero_shot_classification.py)
uses entailment-only candidate ranking for single-label mode. A disclosed post-hoc
DEV arithmetic reassessment of the same stored logits gave only 4/72; it did not
repair the result. No extra inference or independent test was involved.

## Plumbing checks and limits of diagnosis

The first eight-pair authored smoke observed all four intended relative contrasts,
but all positive examples still had neutral as their largest logit. Relative
contrast success alone cannot detect a consistently neutral model.

A separately versioned semantic smoke therefore tested eight NEW authored pairs.
Exact English/German/French/Spanish identity and explicit English negation controls
all had the expected class (5/5). Three mathematics topic paraphrases/title/wrapped
title controls all predicted neutral (0/3). This is semantic plumbing diagnosis,
not independent topic precision. An independent tokenizer-only check decoded both
segments intact with the intended XLM-R special tokens; no dropped/reversed
hypothesis, silent truncation or obvious class-order error was found.

Bare titles and long disjunctive taxonomy hypotheses differ substantially from
the author's sentence/short-label examples. Transfer mismatch is plausible, not
proven to be the sole cause. No comparison against original FP32 numerics was run;
do not blame or exonerate quantization based on these controls. These findings do
not establish that every NLI model is unsuitable for hierarchical classification.

## Retained evidence and guards

All generated assets/results are ignored on D:. Exclusive markers prevent hidden
reruns. Existing code and receipts for preparation, original smoke, development
and semantic smoke remain unchanged. Result hashes:

- Graph smoke: `b4cfe38b1f568d09bdeceea229b75a3492c053b18270449dc36bc7a439ebd2bc`.
- Development: `842799f16ba1d98029bd520220199a60fabaf899c1817cee7b42c001ad685708`.
- Semantic smoke: `a78951e1d87e636cc215a6318543c945d040feab567a03220690b2cf7c9132a6`.

Preparation verifies HTTPS and approved Hugging Face redirect hosts, checked D:
parents, streamed byte/hash bounds and new exclusive files. It used8.625s with
96MB sampled RSS. Inference uses one sequential one-thread WASM session, exact
input/output shape checks and explicit disposal. Premise/hypothesis each at most
512 UTF-16 units, pair at most256tokens; overlength rejects, never silently truncates.
Fixed supervision:1536MiB RSS/private commit, host1024MiB, C768MiB/D512MiB reserves,
wall180seconds. It can terminate only its own child, never the crawler/application.

Ten analytic runtime tests pass without external capabilities or actual models.
No production matching, memory-at-scale, hosted throughput, UI or user-account
preservation claim follows from this isolated experiment.

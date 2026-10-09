# Offline pair verifier v5 — sealed one-shot independent synthetic holdout

This runner was frozen and run **once** on the independent synthetic holdout.
The result was a decisive rejection; see [RESULTS.md](./RESULTS.md). It freezes the v2 full-coordinate
pair model, the v3 cutoff `0.9805850963542602`, and only v4's
triangle-supported connected-components policy. The project-original
multilingual-independent-v1 holdout is an 80-report JSON array at
`../multilingual-independent-v1/records.json`, SHA-256
`A6F1917A33E44BD80F50366DD1FE5290B576247F61DD83BCC3531BEE3C137B3A`.
The holdout was opened only by the lead's reviewed one-shot aggregate-only
run. Its contents were not inspected row by row by this adapter's author.
Dry-run and fictional unit tests do not read the file. Do not rerun `--run`
or use this spent holdout to tune a new candidate.

Execution order is fail-closed: hash-check and parse only the previously
frozen multilingual-balanced-v1 train/validation files (160/40 reports);
embed those alone with the packaged title-plus-384-character-lead E5;
refit unchanged v2 weights **in memory** on train only; recompute validation
max-negative-plus-0.002 and abort unless it matches the fixed v3 cutoff
within `1e-12`; only then open the 80-report holdout once, hash-check it
before JSON parsing, validate its eight ten-report events/four families/
five languages/two stances, and embed it separately. Neither the balanced
corpus's `test.jsonl` nor any other holdout is opened.

The sole holdout policy gates pairs at the frozen cutoff, keeps a gated
edge only if its endpoints have at least one common gated neighbor, then
forms connected components from those retained edges. It is label-blind at
decision time and has no Topic member cap. No threshold-edge-only graph,
bridge graph, raw comparator or policy grid is run on the holdout.

The predeclared research screen requires **zero false grouped pairs and
zero mixed groups**, **at least 2/8 complete events**, **at least 144/360
true retained edges** (40% recall), and **at least 96/320 cross-language
true retained edges** (30% recall). The aggregate report also gives
2,800 different-event pair opportunities, including 400 same-family hard
negatives, direct retained edge TP/FP, whole-group true/false pairs,
cross-language true grouped pairs and runtime. A failure rejects this
frozen candidate; a pass is only synthetic research evidence, not live
activation or a real-publisher precision estimate.

No row content, URL, family/event identifier, individual score, vector,
weight or group assignment is logged or saved. The runner denies network
and subprocess capabilities; errors are fixed codes. Packaged E5 assets
are already local. The holdout is deliberately synthetic, and title-plus-
lead E5 still differs from the live retained body-derived vector.

From repository root:

```powershell
node apps/local-service/experiments/topic-encoder/offline-pair-verifier-v5/run.js --dry-run
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/offline-pair-verifier-v5/core.test.js
```

The approved one-shot `--run` has been spent; do not repeat it for selection.

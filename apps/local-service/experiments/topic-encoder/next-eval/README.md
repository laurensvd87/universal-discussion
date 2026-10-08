# Topic projection evaluation, offline only

`run-sealed.js` verifies the frozen 30-document synthetic holdout digest and
the candidate artifact digest, then compares four **one-page vector** methods:
packaged E5 on body, packaged E5 on title+body lead, a fixed lexical/E5
fusion, and the trained 384D fusion. The model has already been selected on
the separate 68-document validation split; no holdout labels enter training.
Every strict cosine cutoff is chosen from validation negative pairs only.

`mutual.js` is a separate *experimental* dynamic-neighborhood decision rule.
It nominates only reciprocal nearest neighbors and requires their similarity
margin over each page's second choice to exceed a validation-selected
negative-candidate margin. It was devised **after** the first sealed holdout
result was seen, so its result on that holdout is diagnostic, not independent.
The pair score changes when other pages enter the catalog and a reciprocal
pair cannot by itself determine a stable multi-page Topic; it is not a live
grouping policy or authorization to migrate conversations.

`run-challenge.js` scores the pre-frozen model and margin rule once on a fresh
95-document synthetic challenge whose author did not see the model or prior
results. `run-cdec.js` compares the four vector methods with the CC BY 4.0 CDEC-WN Wikinews
research corpus; this optional check needs the fixed archive file placed in
the ignored `.work/` folder. The archive is **not** a dependency of the app or
normal experiment tests. The runner checks its SHA-256 and reads its members
directly in memory, so no extraction is needed. It reads only the
published train/test subtopic inventory, and outputs aggregates only. It is
not the separately approved R5 public-page pilot or an app data-source
integration. Attribute CDEC-WN to Pratapa et al. when sharing the findings.

Run from the repository root with Node 24 and existing packaged E5 assets:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/next-data/*.test.js apps/local-service/experiments/topic-encoder/next-challenge/*.test.js apps/local-service/experiments/topic-encoder/next-eval/*.test.js apps/local-service/experiments/topic-encoder/next-model/*.test.js
node apps/local-service/experiments/topic-encoder/next-eval/run-sealed.js
node apps/local-service/experiments/topic-encoder/next-eval/run-challenge.js
# Optional only after placing the pinned CC BY 4.0 CDEC-WN .tar.gz in .work/:
node apps/local-service/experiments/topic-encoder/next-eval/run-cdec.js
```

The runner denies network/subprocess access, prints only aggregate scores and
does not write the production database, raw text, vectors or model weights.
Results are in [RESULTS.md](RESULTS.md). The synthetic texts are invented;
neither assistant labels nor the limited real Wikinews storyline labels are
equivalent to independent, cross-publisher same-Topic gold.

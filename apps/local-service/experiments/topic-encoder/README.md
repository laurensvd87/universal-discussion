# Offline Topic-embedding experiments

These are **synthetic, shadow-only** tests of whether one page vector can
identify a precise discussion subject across different viewpoints. Nothing in
this directory is imported by the running service or browser extension. The
current app still uses its existing E5 vector and provisional Topic policy.

`data/train.js` contains 240 project-created English documents: 60 subjects,
four perspectives each, with same-entity/different-development hard negatives.
Whole families are split 192/48 between model training and validation.
`data/holdout-v2.js` contains 80 independently created English documents, 40
unseen subjects and two differing views per subject. `data/holdout-v3.js` has
104 independently authored documents across 52 further unseen subjects; it
includes less uniform bodies and some deliberately generic second headlines.
The preliminary 36-document holdout in `data/holdout.js` was exposed during
the first development cycle; do not use it for a later blind claim.
No real page, owner database, provider response or private material is in these
files. The `data/` path is globally ignored by the local service; **only these
explicit synthetic files** should be force-added to Git.

The two embedding approaches both reuse the existing hash-verified packaged E5
encoder. `model.js` learns a small residual rank-12 metric head from opposite-
viewpoint positives and hard negatives, with family-disjoint early stopping and
a wall-clock budget. `fused.js` is an experimental single-vector mixture of E5
and locally extracted hashed subject terms. Neither is a new base language
model trained from scratch. `hybrid.js` is an explanatory pair scorer, not a
vector encoder: it inspects both page titles and leads and cannot be used on
historical server Sources under the current URL/title/vector retention design.

From the repository root, with Node 24 and the already-packaged E5 assets:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-encoder/*.test.js
node apps/local-service/experiments/topic-encoder/run-v2.js
node apps/local-service/experiments/topic-encoder/run-v3.js
```

If the previously approved, Git-ignored six-Source R5 pilot and separate
assistant-content review are already present locally, `node
apps/local-service/experiments/topic-encoder/pilot-shadow.js` performs a
read-only aggregate cross-check. It does not acquire a new page or turn the
assistant judgments into human gold.

The runner checks fixed synthetic digests and all packaged model/runtime asset
hashes, denies network/subprocess access, keeps texts and vectors in memory,
chooses pair cutoffs only on validation, and prints aggregate results. It does
not download assets, call ChatGPT, write an artifact, touch SQLite or change
retained Sources. `run.js` preserves the original small holdout probe but is
development-only now that its results have been seen.

The independent v2/v3 results are [recorded here](RESULTS.md). A useful retrieval
rank is not a safe automatic same-Topic join. Further tests need real-page
provenance/rights and separate activation review under [ADR-063](../../../../decisions/ADR-063-topic-focused-embedding-shadow.md).

The follow-on [compact trained projection](next-model/README.md) and
[frozen evaluation](next-eval/RESULTS.md) are also shadow-only. A 384D
supervised lexical/E5 fusion was trained and independently tested against two
new synthetic sets and the CC BY 4.0 CDEC-WN Wikinews research dataset. It
did not beat raw E5 on unseen retrieval; an adaptive neighbor-margin candidate
made false joins. No model or Topic policy was activated. The downloaded
research archive is confined to ignored `.work/`, not included in Git or the
app.

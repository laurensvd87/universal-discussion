# Owned synthetic diagonal transfer v1 — frozen, not yet run on real data

Research-only protocol. Fit the existing 384-coordinate diagonal E5 adapter
exclusively on project-authored synthetic chunk A (108 reports); calibrate the
unchanged `double-support` admission rule exclusively on project-authored chunk
B (108 reports), separately for raw E5 and the adapter. C1–C3 and the sealed
v5 holdout are not read. Neither GlobeSumm nor Wikinews may fit parameters or
select a cutoff. The existing GlobeSumm 150-article validation is a **spent,
exploratory** transfer check, not an independent test. It must not inform a
revision of this protocol or a claim of product quality.

Exact authored input byte SHA-256: A
`6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B`,
B `2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908`.
Only the already approved GlobeSumm source file with 14,972,999 bytes and
SHA-256 `8c296a8d1b0f344ad477c2541acbf010f220d1695f63ebce35700bf5c4cf392d`
may be used for the private transfer check. The packaged E5 model must have
SHA-256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

Synthetic and real input use the same packaged E5 `title-lead` path: normalized
title, newline, and at most 384 normalized body characters. The 384-character
lead is applied before `topicInput`'s overall 4,096-character cap. This is the
earlier GlobeSumm experiment's input, not the live body-only capture input.
Adapter hyperparameters and static triplet mining are exactly those in
`real-diagonal-adapter-v1/core.js`. For A only, `family` is the negative
category; the 18 event IDs are positives/negatives. B is never used for fitting.
Different stages within one fictional family are hard negatives only under
ADR-064's principal-event PoC Topic target. This is not a universal judgment
that an evolving real-world story must occupy separate Topics.
The candidate graph is the existing mutual-top-five, two-common-neighbor
`double-support` rule with its max-negative-contrast calibration. If a method
has zero eligible synthetic negative candidates, report that weakness and use
the existing zero fallback; never tune on real validation.

Primary comparison is ADR-069's E5-relative result on identical validation
cases and inputs: correct same-event direct/grouped pairs and pages in pure
multi-page groups may improve partially, while false direct/transitive joins,
mixed-group exposure, and root-route churn must not worsen. Complete events
are diagnostic, not a required quota. Report cross-language and exact-input
duplicate-adjusted measures, noting that exact-input uniqueness is not
independent publisher proof. GlobeSumm lacks verified publisher and viewpoint
labels, so those slices remain unavailable. Both methods need their own
synthetic B cutoff. Do not compare against the previously published real-fit
adapter as if it used the same training/calibration data.

Private execution is deliberately gated by `--reviewed` and an exact SHA-256
inventory in `freeze.json`, verified before reading the private file. The flag
is the operator's assertion that independent review of the frozen inventory
has completed; it is not a technical substitute for that review. Changing any
listed code or packaged asset fails closed until an independently reviewed new
inventory is committed. The lead must arrange independent code/protocol review
before invoking it. No article text, title,
URL, labels, vectors, learned weights, or row-level digest are written or
printed. The report contains only counts, source hashes, and limitations.
No provider calls, downloads, service writes, or test-split embeddings occur.
The parser necessarily reads and normalizes the full GlobeSumm file to select
the already defined validation split; selected test and unselected rows are
never embedded or scored.

From repository root:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/runner.test.js
node apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/run.js --dry-run
# Only after independent review, with the existing approved private corpus:
node apps/local-service/experiments/topic-encoder/owned-diagonal-transfer-v1/run.js --reviewed --private-dir C:\private\corpus --input C:\private\corpus\news_only.json
```

The private path is an example, not a repository file. This experiment cannot
authorize retained product training, model shipment, Topic reassignment, or
live matcher changes. The real validation has been used repeatedly, and
synthetic publisher/style cues may not transfer to independent reports.
Without a live root ledger, root-route churn cannot be measured here. The
runner reports a narrower relative *coverage* observation and cannot declare
the full ADR-069 quality decision passed.

# Retained-representation GlobeSumm graph probe

This is an offline negative experiment under ADR-064/065/067. It uses only
the owner-approved private GlobeSumm JSONL outside Git. It changes no product
matcher, Source, Topic, discussion, extension, database, or model asset. The
CLI hash-checks the exact approved file and refuses paths inside the repo.
Network and subprocess capabilities are denied. Raw text, titles, URLs,
labels, individual vectors, and fitted weights are never printed or saved.

The first run used packaged E5 on the first 384 normalized body characters:
that is a **lead-only surrogate**, not the live extension's input. A second
run used up to 4,096 normalized body characters with the unchanged packaged
E5 model and its 512-token cap. That is closer to the live input length, but
the corpus adapter and actual browser page extraction are not identical.
Both runs use retained title cues. The probe examines
all pairs in each split, adding rarity-weighted title overlap, shared
vector-neighborhood evidence, and an explicit penalty when both titles give
different numbers. Number disagreement is a limited competing-development
cue; an absent or translated number offers no conflict evidence. Training
chooses from only 12 predeclared weight/cutoff policies, requiring zero false
whole-group joins on the 749-report train slice. Group seeding requires a
strong direct pair or a supported three-report triangle; expansion requires
direct support across groups. No fixed number of Source members caps a
Topic. The all-pairs implementation is research-only and is not a scalable
incremental service design.

The 150-report validation slice is checked once for each input length. The
longer run recovers only one same-event pair and no complete event, so the
promotion condition fails. The 293
previously selected test reports and 3,495 previously unselected reports
remain unembedded and unscored by this experiment. No fresh sample is defined.

From the repository root with Node 24 or later:

```powershell
node apps/local-service/experiments/topic-encoder/globesumm-retained-v1/core.test.js
node apps/local-service/experiments/topic-encoder/globesumm-retained-v1/run.js --dry-run
node apps/local-service/experiments/topic-encoder/globesumm-retained-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\news_only.json
node apps/local-service/experiments/topic-encoder/globesumm-retained-v1/run.js --private-dir C:\private\corpus --input C:\private\corpus\news_only.json --body-4096
```

The real input path must be an explicit absolute path to a regular file
under the named private directory, outside the repository. The runner emits
only aggregate counts and fixed diagnostic codes. The longer pass processes
chunks of at most 80 reports so each E5 session releases its tensors before
the next chunk; this is a compute bound, not a Topic member cap. Even aggregate real-corpus
results should remain local unless reviewed. GlobeSumm's dataset card marks
the dataset CC BY-SA 4.0, but underlying publisher article rights and product
training/release remain unreviewed. This experiment grants no rights or
activation approval. The corpus lacks reliable adjacent-event/viewpoint gold;
same-category negatives are only a coarse difficult-pair proxy.

See [RESULTS.md](RESULTS.md) for the measured negative result.

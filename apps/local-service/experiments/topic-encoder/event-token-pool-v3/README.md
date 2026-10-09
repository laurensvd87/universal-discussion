# Event-token-pool v3 — frozen event-level development protocol

The frozen development run is complete and failed its continuation screen;
see [RESULTS.md](RESULTS.md). The fresh v5 holdout remains unopened.

This is one offline, RAM-only token-attention experiment. It does not change
the live app, retain a new field, download a model, call a provider, or save
weights/vectors/token states. Do not run authored-corpus development until
the lead reviews this hash-pinned adapter **and** the corpus aggregate
manifest is committed. No balanced-corpus test, spent v3/v4 holdout, or fresh
v5 holdout may be opened for this task.

## Owner-provisional Topic boundary for this PoC

The owner accepted either an atomic event route or a broader overlapping
story route and directed this PoC to use the existing [ADR-064](../../../../../decisions/ADR-064-event-evidence-topic-graph.md)
**atomic event-level primary Topic**. Therefore `eventKey` is the provisional
identity target: same `eventKey` reports are positives, and different
`eventKey` reports are negatives for primary Topic admission, including
chronological stages of one B-family evolving story. B's approval, delay,
rollout, or outcome stages may still be surfaced as **Related discussions**;
that navigation relationship is not permission to merge their primary
discussion routes or infer overlap. This is a task-specific owner choice,
not a claim that event-level boundaries are universally correct or that
the B stages are semantically unrelated. The separate direct-relevance
probe is stopped; its non-transitive pair labels must not enter this
event-level training, calibration, or evaluation. No live routing changes.

## Frozen representation and objective

Use the already packaged multilingual E5 with exactly normalized title plus
the first 384 body characters under its `query:` path and 512-token cap.
This is the known offline title+lead surrogate, **not** the live app's
up-to-4,096-character body-prefix input. Copy first at most 64 non-special
content-token states before tensor disposal, normalize each 384D state,
and form one 384D unit event vector using the v1 shared attention query:
`softmax(8 * dot(w,h_i))`, then normalized weighted state sum. No
lexical/action parser or second inference asset is introduced. Token
states and the 384 parameters stay in process RAM until GC/exit; immediate
zeroization is not claimed.

Fit `w` from zero with exactly **40 full-batch Adam steps**, learning rate
`0.01`, L2 penalty `0.001`, gradient-norm cap `1`, and the v1 softplus
triplet objective with fixed margin `0.05`. At the start of **each** step,
compute current attention event vectors for fit articles. For every anchor,
mine three deterministic IDs under current vector cosine, with first-in-
input-order tie breaking:

- positive = lowest-scoring same-event report in another language;
- family negative = highest-scoring different-event report in the same
  family (adjacent-event hard negative);
- outside-family negative = highest-scoring report from another family.

Each anchor contributes two triplet gradients using that same positive:
`0.75 * family-negative loss + 0.25 * outside-family-negative loss`. Average
over anchors, add the fixed L2 gradient, clip and update once per step.
Mining is refreshed each step but **only** against the fit families;
calibration/development gold never enters mining or gradients. No
semi-hard cutoff, replay bank, random sampling, optimizer grid, or
post-result modification. Non-finite states/scores/gradient/weights, missing
positive/negative strata, or excessive weight norm fail closed.

## Frozen data protocol and admission

The independently authored `multilingual-authored-v2` chunk A plus B has
216 reports, 12 whole families and 36 developments. Sort family
keys by their SHA-256 digest with ASCII lexicographic comparison; the first
9 families (162 reports/27 developments) fit attention, the other 3
(54 reports/9 developments) calibrate only. The original chunk C failed
language-content QA and is **excluded**. Its independently audited,
hash-frozen replacement C1+C2+C3 is the development set: 108 reports,
6 disjoint families and 18 developments. Each development
has six reports covering five languages; the repeated language rotates.
The schema is exactly `id,family,eventKey,lang,viewpoint,title,body`.
The runner reads only A/B for fit/calibration and C1/C2/C3 for development.
It rejects non-files/symlinks and oversize files, verifies exact-byte SHA-256
**before parsing**, checks 6 reports/event and language/viewpoint structure,
and rejects split overlap before embedding. The frozen record hashes
are:

| Chunk | Exact-byte SHA-256 |
| --- | --- |
| A | `6B0F5199F8C4A5B31C3A10B9B2D46DDD98763287C57C5281C135B79CFB0AF81B` |
| B | `2762DA5CE908A2E67092958BEAF3F6CD4F56515AA29D61962AA7C3F870CA2908` |
| C1 | `20BAB9B116C6F32C2FB7058C3D822AF333503EC36CBCF9CBB7365E9F45BAC581` |
| C2 | `44AC29625DFBD86F7AF2C278EAB991E042D0E6E0FA64A92D95D3B1F7951BBF6F` |
| C3 | `659F2E9A27651B6577D2686F8B3849E56E6A36984471620980BCCA68B880F1FE` |

The sole gate is max different-event cosine across the 54 calibration
reports plus fixed `0.002`, abstaining if above 1. The only group policy is
the already frozen triangle-supported gated-edge component rule. Report
retrieval separately from retained pair edges and complete/mixed groups;
all output is fixed aggregate counts only. For comparison, a frozen v1
static-mined attention reference and raw pooled E5 may be run on the same
fit/calibration/development split, but their results cannot change the
dynamic miner or its cutoff. No gold family/event/viewpoint is passed to
E5 inference or held in the 384D representation.
If the static reference abstains, the strict-comparator continuation
criterion fails; absence of a usable comparator is not a win.

Development continuation screen, to be assessed once and **not** tuned:
0 false retained edges among 5,508 different-event pairs (including
0/648 within-family hard negatives), 0 mixed groups, at least 81/270
true retained edges, at least 63/252 cross-language true retained edges,
at least 4/18 complete developments, and retrieval@1 at least 87/108.
It must also beat the static-mined v1 comparator on at least one of true
edges or complete events without regressing either or retrieval@1. These
small, author-written data remain a development diagnostic; even passing
does not authorize an independent holdout or product activation.

The 64×384 float32 copied states require at most 98,304 bytes/article,
plus transient model output and JS overhead. A brute-force 162-report
dynamic-mining step is bounded by roughly 26,000 cosine comparisons plus
324 triplet gradients; 40 steps remain CPU-local. This neither proves
million-article indexing performance nor creates a fixed Topic member cap.

Safe commands, which open no corpus or model:

```powershell
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/event-token-pool-v3/core.test.js
node --test --test-isolation=none apps/local-service/experiments/topic-encoder/event-token-pool-v3/adapter.test.js
node apps/local-service/experiments/topic-encoder/event-token-pool-v3/run.js --dry-run
```

The reviewed lead may later run `run.js --development` once the aggregate
manifest is committed. It reports only aggregate retrieval, retained-edge
true/false counts including same-family hard false joins and cross-language
recall, whole-event component counts, train/calibration cutoffs, runtime,
and code/input/model hashes. It compares the frozen static-mined v1 query
and unchanged pooled E5 on the same split without tuning the dynamic
candidate. No raw record, ID, title, text, token state, vector, weight or
per-component assignment is printed or persisted. The complete 324-report
token-state RAM footprint is at most about 31.9 MB of raw float32 states,
before JS/runtime overhead; no browser retention is implied.

# Fresh GlobeSumm diagonal comparison protocol

Offline, RAM-only, one-shot research under ADR-065/069. Freeze and independently
review the manifest before opening the private corpus. This protocol reconstructs
the original deterministic 1,192-article/96-event `selectEventDisjoint` cohort
and the earlier budget-300 preliminary cohort (298 articles). It excludes the
union of both sets, every corresponding whole event, and any other event with
an exact normalized title/lead input key shared with either set. The 3,495-article/
274-event remainder of the first cohort alone is not wholly untouched. Whole
events are ordered by SHA-256 of `fresh-v1\\0` plus the event key; each is added
if it fits the 300-article budget. The ordering and budget are fixed before any
new embedding. The original selected 749 train articles are reused solely for
the exact 475 fit / 274 calibration split. The original 150 validation and 293
test articles and all earlier preliminary articles are never embedded or scored
by this runner. The fresh events are previously unembedded/scored within known
scripts, but corpus metadata was inspected earlier. This is an exploratory
new-event check within the same publisher corpus, not an independently sourced
holdout.

Reuse packaged E5 title plus normalized 384-character lead. Fit the unchanged
40-step diagonal adapter on the same clean 475 rows; calibrate its and raw-E5's
double-support thresholds separately on the same 274 rows. Then embed and score
the fresh selection once. No fresh labels tune weights or cutoffs. Report
denominators, direct true/false edges, grouped true/false pairs, articles in
pure non-singleton groups, articles exposed to mixed groups, cross-language
reach, duplicate-adjusted exact-input support where unambiguous, and complete
events as diagnostic. The relative screen requires nondecreasing pure-group
articles and true grouped pairs, a strict gain in either, and no increase in
direct false edges, false grouped pairs or mixed-group exposure versus the same
case title/lead raw E5. A win is exploratory, not product activation.

The runner verifies exact corpus byte size/hash, execution source and packaged
asset hashes before reading private input. The manifest excludes itself. Only
aggregate JSON/fixed error codes are emitted; no text, URLs, row/event IDs,
vectors or weights are written. Do not redirect output into Git. Publisher and
viewpoint labels are unavailable; exact-input keys are not publisher identity.
The live body-derived E5 and root migration remain outside this comparison.

First run `node --test --test-isolation=none apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/core.test.js`
and `node apps/local-service/experiments/topic-encoder/real-diagonal-fresh-v1/run.js --dry-run`.
Only after independent review, supply absolute paths to the approved private
directory and `news_only.json` using `--private-dir` and `--input` exactly once.

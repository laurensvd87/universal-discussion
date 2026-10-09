# Topic relation v1: local lexical evidence with E5

This is an offline, synthetic-only admission experiment under ADR-064/067. It
does not change the local service, Topic membership, saved discussions, or
retained data. It reads only the five hash-pinned v1/v2 train and familiar
validation JSONL files. Its runner contains no path to a holdout. No new model
asset, provider, network request, or LLM inference is involved.

The existing packaged multilingual E5 embeds each title plus the first 384
normalized body characters. Every pair receives six inspectable features:
E5 cosine; rarity-weighted shared title words; shared title-to-other-text
words; shared article words; plain title overlap; and a numerical conflict
indicator. Rarity comes only from the v1/v2 train rows. A six-feature ridge
logistic head is fitted on train pairs, balancing positive, adjacent-family
negative, and other negative classes. The score is a ranking value, not a
calibrated same-Topic probability. The final conservative cutoff is 0.10
above the maximum train-negative score, plus an E5 cosine floor of 0.78.

The lexical features inspect each corpus row's **full body**. The live service
retains URL, short title, and one vector, not full body text or these lexical
features. This first track is an offline information upper bound and cannot
be dropped into the current backend. A product version would need a
separately designed transient client-side calculation or approval for new
retained representation and its privacy, migration, and Trust review.

A second, separately scored ablation uses a body-only E5 vector and title
lexical features, matching the backend's retained representation subset. It
sets the body to empty **for pair features only**; the vector is embedded from
the full synthetic body in a separate packaged-E5 pass. These fictional
corpora have no URLs to test. Its conservative cutoff is frozen at
`6.197572640918079`, group floor equal to cutoff, cosine floor `0.78`,
based on the larger observed train/validation negative score plus 0.10. It
is a negative control, not an activation proposal.

Retrieval and admission are distinct. Top-three cosine retrieval is reported
only as a diagnostic. The hard gate checks the pair score and cosine; group
merging additionally requires all cross-group pairs to clear the floor and
each member to have an admitted cross-group edge. A failure abstains. There is
no fixed number of Sources per Topic. This small-corpus implementation still
computes every pair and is not a scalable incremental service design.

The method was developed on known v1/v2 train and validation only. The
selected rule is frozen in `run.js`: score cutoff
`6.1505557310739345`, group floor equal to cutoff, and cosine floor `0.78`.
The runner asserts that regenerated training and development selection match
that choice. It must not be retuned on a new holdout. The fitted weights are
recomputed deterministically from the pinned train bytes. Full source and
fixture hashes should be recorded before opening any new holdout.

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/topic-relation-v1/core.test.js
node apps/local-service/experiments/topic-encoder/topic-relation-v1/run.js
```

`node --test` may fail to spawn a subprocess in a restricted Windows sandbox;
running the test file directly executes the same `node:test` assertions.
The runner prints aggregate JSON only. See [RESULTS.md](RESULTS.md) for the
known-corpus results and limitations.

After the two rules and code were frozen, `evaluate-v6.js` performed one
aggregate-only pass over the independently audited v6 holdout. It hash-checks
the file before inference, fits both heads from v1/v2 train again, and applies
the exact frozen cutoffs. V6 is now spent and must not be used for tuning.

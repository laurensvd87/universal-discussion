# Title signal shadow, owner-local catalog

Run from the repository root:

`node apps/local-service/experiments/topic-encoder/title-signal-shadow-v1/run.js`

The runner reads the fixed SQLite snapshot with `readOnly` and `query_only`, loads the ignored owner-local diagonal adapter, and uses the already packaged E5 model to embed at most 256 retained public Source titles in memory. It compares the raw-E5 and diagonal-adapter alternate planners with the title cosine of grouped pairs. It never changes the database, stores a second vector, calls a provider, fetches a URL, or prints titles, URLs, page text, vectors or account data. Its output is aggregate counts and rounded scores for the owner-provided translated article pair and two known false-join classes. This is a development diagnostic, not independent Topic-quality evidence.

The title signal is a separate E5 inference per Source. A live implementation would have a CPU cost and would need a design for when and where that vector is computed, retained, or discarded; this experiment does not decide that architecture. Its simple word-pattern case selectors cover only the named local examples, not multilingual event classification.

See [RESULTS.md](RESULTS.md) for the measured snapshot and interpretation.

`node apps/local-service/experiments/topic-encoder/title-signal-shadow-v1/heldout.js`
runs the frozen 0.90 title-floor check on the committed synthetic v6 holdout and the previously selected 293-article GlobeSumm test set, when the hash-checked private corpus is present in the known local temporary directory. Both inputs are read only, all embeddings and article text stay in RAM, and only aggregate counts and timings print. The GlobeSumm test was already used in earlier project experiments, and the title floor was chosen after looking at the owner catalog; this check is exploratory rather than an independent final validation.

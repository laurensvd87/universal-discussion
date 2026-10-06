# Small offline learned embedding probe

This is a project-owned text-to-vector encoder, not a pairwise LLM scorer. It
hashes title/body words and character trigrams into 256 coordinates, computes
development-only IDF, and learns one bounded diagonal metric weight per
coordinate from same-subject/opposing-view pairs versus distinct-subject pairs
within each invented family. An unseen page maps to one unit vector without
needing another page, label or runtime provider. Cosine ranks neighbors.

The follow-up adds a separate project-owned 384-dimensional learned projection
over the already packaged multilingual E5 encoder. It learns bounded diagonal
weights from the same 20 synthetic development documents. It adds no asset or
network call and maps each E5 vector independently to one normalized vector.
It is a metric head, not a newly trained multilingual base encoder. The
unmodified E5 output is its direct comparison baseline.

Run from the repository root:

```sh
node --test --test-isolation=none apps/local-service/experiments/learned-embedding/model.test.js
node apps/local-service/experiments/learned-embedding/run.js
node --test --test-isolation=none apps/local-service/experiments/learned-embedding/e5-projection.test.js
node apps/local-service/experiments/learned-embedding/run-e5-projection.js
```

The runner imports the existing external-capability denial guard. It checks
the frozen 32-document synthetic corpus digest, trains on 20 documents in five
development families, and evaluates 12 documents in three held-out families.
No real or owner page, model download, provider request, stored vector,
production code or database is involved. Its JSON output contains only
invented IDs and aggregate ranks; it does not write a file. Both learned and
unweighted versions use the same tokenization and development-only IDF.
The E5 runner also verifies every packaged model/runtime/tokenizer file against
the existing manifest before inference. It emits synthetic ranking diagnostics
and measured local runtime; it neither saves the head nor stores a second vector.

This is a deliberately small feasibility check. It cannot replace the packaged
multilingual E5 model: its features have limited cross-language reach, 20
training examples are far too few, and the corpus has no independently rated
real pages. In particular, it makes no calibrated identity or automatic Topic
join decision. [Results](RESULTS.md) record the first measurement.
The E5 projection is the plausible multilingual path tested here, but its
negative held-out result does not support activation either.

Before a larger custom embedding model could be trained or activated, propose
a separately reviewed package identifying (1) the base architecture/assets
and license, local compute/package-size/latency budget, (2) a provenance and
rights-screened training set with explicit permission for text retention and
training, or a synthetic-only limit, (3) strict train/validation/test splits
by source, development and publisher so copies cannot leak, (4) local-only
data handling and deletion, with no provider egress, and (5) success/failure
criteria for same-subject opposing viewpoints, distinct developments,
multilingual pairs, bridge pages and no-match abstention. ADR-044/048's real
pilot labels are exploratory and cannot be converted into training gold or a
production threshold without a further owner/Trust decision.

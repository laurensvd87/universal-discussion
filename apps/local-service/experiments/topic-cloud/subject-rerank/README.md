# Frozen subject reranking probe

This is an isolated, synthetic-only probe using the unchanged 32-document
`topic-identity` corpus and its original family split. Rules in `scoring.js`
were fixed before body-vector inference or evaluation. Variants are body cosine,
and cosine plus 0.05 or 0.10 times title-token Jaccard, minus 0.08 or 0.16
for disjoint numeric/month signatures. No label, family or split enters scores.
Numbers, month names and negation survive tokenization. Disjoint month names
conflict even where a route number is shared. If one title omits the date, the
cue abstains; it cannot infer event identity from absent information.

The runner verifies every fixed packaged model/runtime/tokenizer asset through
the production manifest. It uses Node CPU WASM, the existing E5 query prefix,
truncation and pooling, and computes one body vector per invented document in
memory. It writes only aggregate rank counts and query IDs/ranks. It makes no
network request, stores no vectors or page text, and never touches owner data.
No production matcher is activated. No cutoff or semantic identity claim follows.

The measurement and post-measurement correction are recorded in [RESULTS.md](RESULTS.md).
The runner's current exclusive-create target is `results-negation-amended.json`;
the artifact already exists. Do not rerun it as a routine check.

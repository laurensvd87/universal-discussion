# Synthetic result: candidate retrieval, no successful automatic grouping rule

Measured 2026-09-29. Fixed corpus digest:
`0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950`.
The corpus, labels, family split, threshold grid and selection objective were
fixed before inference. The requested git checkpoint had not been made when the
first run completed; do not claim a pre-inference git commit. No labels, thresholds
or evaluated transforms were subsequently tuned. Six executable evaluator checks
pass under external-capability denial. Ninety-six invented input inferences ran
through the pinned packaged production ONNX graph, tokenizer and WASM runtime,
with production prefix truncation and masked-mean/L2 pooling. No vectors were emitted.

The original generated artifact is retained as `preliminary-space-results.json`.
Its title/lead transform uses a space separator; the proposed production helper
uses a newline and removes an exact repeated title prefix. This helper is now
preserved under `spikes/topic-resolution/experiments/topic-input/` as a dormant
proposal; the active production reader/input/grouping remain legacy. A subsequent
**tokenization-only** parity audit found identical proposal/experiment token IDs on all **32/32** corpus
documents despite different input strings on all 32. Model loads/inferences in
that audit: zero. Consequently the measured title/lead scores apply to the proposed
inputs for these exact corpus documents. None exercises exact heading repetition
or the full 4096-character boundary; this does not establish general transform parity.

Parity-audited preserved proposal helper SHA-256:
`4ef8b999402288c64dbdc7b01f10446305a1c62fbdd0f319b013ca184655f385`.
Preserved proposal page policy SHA-256:
`e7aec44fd2908c06eff0c12af5ca0f3029798640ea89dceae0dbe98cb087cc1d`.

| Transform | Development recall@1 | Held-out recall@1 | Held-out recall@5 | Held-out positive range | Held-out hard-negative range |
| --- | --- | --- | --- | --- | --- |
| Body prefix | 3/20 | 2/12 | 12/12 | 0.8896–0.9577 | 0.8598–0.9878 |
| Title + lead | 6/20 | 3/12 | 12/12 | 0.8876–0.9589 | 0.8519–0.9869 |
| Title only (diagnostic) | 8/20 | 8/12 | 12/12 | 0.8561–0.9521 | 0.7905–0.9662 |

At cosine 0.94, title + lead accepts 3/6 held-out positive pairs but also 5/60
negative pairs, all within the deliberately confusing families. Its held-out
positive median is 0.9467; hard-negative maximum is 0.9869. Distinct June/August
flood reports with similar positive framing outrank opposing coverage of one flood.
The rail closure/reopening cases also demonstrate high similarity between distinct
occurrences. Removing date distinctions or stance words would not resolve this.

No threshold in the frozen 0.85–0.98 grid gives zero development false-positive
pairs for body prefix or title + lead. Title-only selects 0.98 under the frozen
precision-first objective, but then joins **zero** positive pairs in held-out data.
No deployable cutoff was established.

Simulating the existing 0.94 threshold/0.04 margin with all-member compatibility
and closest competing-member rejection on held-out title + lead vectors yields:

| Arrival order | Provisional Topics | Correct joined pairs | False joined pairs | Missed positive pairs |
| --- | --- | --- | --- | --- |
| Forward | 9 | 2 | 1 | 4 |
| Reverse | 8 | 2 | 2 | 4 |
| Interleaved | 8 | 1 | 4 | 5 |

Competition cannot prevent an incorrect first join when no competing Topic yet
exists. All-member checks prevent neighbor chaining but do not establish event
identity or eliminate ingestion-order effects.

The useful first result is retrieval: every held-out positive partner remains in
the top five in this tiny pool. Title-only is an interesting diagnostic, not a
validated replacement or approval for storing a second vector. Production may
offer candidate suggestions and explicit Source correction; these results do not
support activating a revised automatic join rule or claiming viewpoint independence.

Limitations: 32 short invented documents, 16 subjects with two variants each,
three held-out families, tiny candidate pools, no independent language labels,
no realistic long-page extraction or no-match corpus, and Node CPU WASM rather
than actual browser capture lifecycle evidence. Pair observations reuse documents.
This adversarial experiment exposes failure modes; it does not estimate general
news accuracy or calibrate confidence. Existing links/comments were never accessed
or changed. Any richer event/issue verifier requires a separate concrete design
within the existing data/model approval boundaries.

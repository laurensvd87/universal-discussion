# First synthetic measurement, 2026-10-06

Frozen corpus digest:
`0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950`.
The author reports choosing the algorithm, 256-dimensional space, weight bound
and existing corpus split before measuring the first run; there is no
independent preregistration record. The runner emitted invented IDs/ranks only.
No real pilot labels or data were used.

| Split | Encoder | Same subject at rank 1 | At rank 3 | Distinct subject first within family |
| --- | --- | ---: | ---: | ---: |
| Development (20 queries) | Unweighted | 6 | 20 | 14 |
| Development (20 queries) | Learned | 6 | 20 | 14 |
| Held out (12 queries) | Unweighted | 5 | 11 | 6 |
| Held out (12 queries) | Learned | 5 | 11 | 6 |

Training saw 20 invented documents, 10 same-subject positive pairs and 20
same-family distinct-subject negative pairs. The learned diagonal weights
changed numerical embeddings but no rank metric here. The held-out result is
therefore negative: this small custom encoder gives no measured improvement
over its unweighted version. It should not be connected to the extension or
used to assign Topics. The existing E5/title-cue experiments remain separate;
their score spaces and inputs are different, so this table is not a fair
production-model comparison.

Focused checks: 3/3 socket-denied unit tests pass with Node's
`--test-isolation=none`; the guarded runner completes without a network,
subprocess, database or file write. The post-measurement third test pins this
negative result against accidental corpus or algorithm drift; it is not a new
held-out measurement.

## Packaged multilingual E5 plus learned projection

The follow-up used the same frozen corpus and split. It loaded the manifest-
verified local E5 small q8 model, existing tokenizer and Node CPU WASM runtime.
The single-vector input was the unchanged body-prefix text. Development-only
labels trained a bounded diagonal weight for each of 384 coordinates; held-out
families supplied no training labels. The head maps an E5 vector to one unit
vector. This is a learned metric head over a multilingual base, not an
independently trained multilingual language encoder.

| Split | Embedding | Same subject at rank 1 | At rank 3 | Distinct subject first within family |
| --- | --- | ---: | ---: | ---: |
| Development (20 queries) | Unmodified E5 | 3 | 20 | 17 |
| Development (20 queries) | E5 + learned head | 4 | 20 | 16 |
| Held out (12 queries) | Unmodified E5 | 2 | 12 | 10 |
| Held out (12 queries) | E5 + learned head | 2 | 12 | 10 |

This one fixed head changes development ranking by one query and changes no
held-out metric. In particular, it does not solve same-subject opposing-view
matching across unseen subjects. The German/Dutch invented examples are too
few to estimate multilingual quality. No threshold, Topic join or production
replacement follows.

Measured on this local Node 24.19.0 CPU WASM run: E5 session creation plus 32
short synthetic inferences took 2,491 ms; head training plus projecting 32
vectors took 4.1 ms. These are one-run wall times, not p95 or browser latency.
The head needs 384 float32 weights, 1,536 bytes before packaging. The already
packaged E5 `model.onnx` is 118,308,185 bytes and `tokenizer.json` is
17,082,730 bytes; the head does not replace or shrink them. E5 vectors remain
384-dimensional (1,536 float32 bytes each if retained). No additional retained
vector or model artifact was written by this experiment.

The additional socket-denied projection test passes 1/1 and the guarded
manifest-verified runner completed. Its output contains synthetic IDs, ranks,
aggregate counts, asset hashes and timing only. No real-page or owner data
was used.

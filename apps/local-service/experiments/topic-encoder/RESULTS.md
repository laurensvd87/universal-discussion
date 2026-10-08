# Topic-focused embedding shadow: negative model result

Measured 2026-10-08, local Node 24 CPU WASM, already-packaged and hash-verified
E5-small q8. All texts and labels are invented. No real page, provider, live
database, extension capture, model download or stored vector was involved.

Frozen training corpus digest (JSON SHA-256):
`a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1`.
It has 240 English documents / 60 precise subjects, split by whole subject
family into 192 training and 48 validation documents. Same-topic positive
pairs deliberately include differing views; nearby distinct developments are
hard negatives. The residual head and three V2 comparison rules were fixed
before V2 inference. After that negative result, the fused encoder and five
V3 comparisons were fixed before V3 inference; V3 is the independent check
for that second development cycle, not a second blind test of the same plan.

| Frozen unseen set | Approach | Same-Topic partner at rank 1 | Hard-pair AUC | Validation-chosen strict cutoff: correct pairs / false pairs |
| --- | --- | ---: | ---: | ---: |
| V2: 80 docs / 40 subjects | Raw E5 | 48/80 | 0.769 | 0/40 / 0 |
| V2 | Learned residual E5 head | 40/80 | 0.773 | 0/40 / 0 |
| V2 | Title + body-lead cue hybrid | 61/80 | 0.861 | 0/40 / 0 |
| V3: 104 docs / 52 subjects | Raw E5 | 76/104 | 0.751 | 5/52 / 3 |
| V3 | Learned residual E5 head | 63/104 | 0.673 | 3/52 / 2 |
| V3 | Fused E5 + local hashed-text vector | 46/104 | 0.637 | 0/52 / 0 |
| V3 | Title-only cue hybrid | 46/104 | 0.622 | 0/52 / 1 |
| V3 | Title + body-lead cue hybrid | 43/104 | 0.615 | 0/52 / 1 |

V2 SHA-256: `90e6530f68cd3517c5a7d5a294f651d3d21017f59644de3b85eaea96cac6d96e`.
V3 SHA-256: `382bcc715cebcbe37b80d86e79db5e09dcabc61c7526faf1e0abd6824af63d9a`.
Both were independently generated without reading the training corpus or model
outputs. The older 36-document set was exposed during development and is no
longer presented as a blind confirmation. All cutoffs above were chosen on the
48-document validation split to accept no distinct-topic pair there. A cutoff
with zero validation errors did **not** guarantee zero held-out false joins.
The hybrid score is not cosine and its cutoff is in a different scale.

The v2 text-cue improvement did not survive v3: its dependence on repeated
surface wording and comparison-time body leads makes it fragile. V3 deliberately
uses more variable bodies and some generic second headlines; this is a severe,
partly artificial stress case, not a population estimate. The residual head
reduced training/validation triplet loss but harmed nearest-neighbor retrieval
in both independent sets. The fused single vector has 896 dimensions (3,584
float32 bytes versus 1,536 for the existing 384D E5 vector) and likewise
regressed. It uses only local title/body processing before inference, but
activation would still change the client/server vector contract and require a
reviewed migration. The pairwise hybrid would additionally require historical
body text, which the service does not retain.

On the V3 run, 344 synthetic E5 inferences plus session creation took about
16.5 seconds; experimental training took about 7.2 seconds on this machine.
These are one-run Node timings, not browser p95. The residual head has 4,608
parameters (18 KiB float32) and a 30-second offline training budget. The
fused model adds no external asset or vocabulary; its reported ~0.41 ms
single-page feature step was a local microbenchmark, not an end-to-end browser
latency measurement.

Conclusion: **do not replace production E5, lower a join cutoff, merge Topics,
re-embed owner data, or retain a new vector.** Synthetic data can establish
mechanics and reveal failures; it cannot estimate real-site precision or
multilingual transfer. A next evaluation should use provenance-cleared real
pages and independent labels/annotations, preserving the separate owner/Trust
gate. Candidate retrieval and discussion surfacing can be explored without
asserting Topic identity, but the current learned models are not a quality win.

## Existing six-page public pilot: exploratory cross-check

The separately approved ADR-045/048 pilot's six frozen Source vectors and 15
assistant-content pair judgments were read without contacting any page or
provider and without touching the live database. Its reference actor is an
assistant, not a human gold reviewer; only **two** pairs were judged the same
atomic development. For those six Sources, nearest-neighbor nominations were
same development **2/6** under raw E5 and **1/6** under the learned head;
the others nominated a related but distinct development. The validation-
selected strict gates nominated no pair in any class. The current production
0.90 candidate floor selected one of the two same-development pairs and
three of four related-distinct pairs, but that floor is not a calibrated
identity decision. The aggregate-only [pilot shadow](pilot-shadow.js) prints
no titles, URLs, vectors or per-pair judgments. This tiny, topic-concentrated
check is consistent with the synthetic regression, not a general accuracy
estimate or reason to retune production.

# Compact topic projection (offline shadow)

`learned.js` is an experimental, single-page 384D encoder on top of the already
packaged, hash-verified multilingual E5. It combines the current E5 body vector
with local hashed title/lead features, then applies 768 learned diagonal weights
and L2 normalization. The weights were fitted with a cosine triplet objective:
opposing views of one precise development are positives; different developments
of the same actor, including no-match singleton C documents, are hard negatives.
This is a trained projection, **not** a language model trained from scratch.

`run.js` verifies the frozen new train/validation digests, trains on 192 earlier
plus 50 new invented documents, validates on 48 earlier plus 20 new documents,
and writes `model.generated.json`. It never reads the sealed new holdout, owner
database, browser history, provider output or network. The corpus itself lives
outside this directory. The only produced artifact is 15.7 KB JSON; the model's
768 float32 weights require 3,072 bytes at inference. One output vector requires
1,536 bytes float32, equal to the current E5 vector size. The text feature
extractor is English-first; future multilingual evaluation remains necessary.

Usage with the existing experimental E5 inference path:

```js
import model from './model.generated.json' with { type: 'json' };
import { encodeLearnedPage } from './learned.js';
const vector = encodeLearnedPage({ title, body }, e5BodyVector384, model);
```

The paired-query top-1 on the combined, whole-family-disjoint validation set
was **55/64**, versus raw E5 **50/64** and the rule-weighted 768D comparator
**50/64**. Four C singleton queries have no positive partner and are omitted
from that particular denominator while serving as negatives for paired queries
and triplet training. This is only synthetic validation. No threshold or safe
automatic Topic join is established, and the sealed independent holdout must be
scored separately without changing this model afterward. Previously exposed
V2/V3 diagnostics revealed that the rule-weighted comparator did not transfer
reliably; neither is independent evidence for this learned projection.
On the new validation slice alone, both raw E5 and the learned projection rank
the correct partner first for all 16 paired queries; the combined-set advantage
does not establish a gain on that new slice.

The independently scored, sealed 30-document holdout confirmed the limit.
The frozen learned model and raw E5 each ranked the correct partner first for
**24/24** matched queries; the rule-weighted comparator got **22/24**. At strict
cutoffs chosen exclusively on validation, the learned model accepted **0/12**
same-topic pairs, as did raw E5 body; both made zero false pair joins and
abstained on all **6/6** singleton no-match queries. Raw E5 using title+lead
accepted 1/12 with zero false joins. These cutoffs show no useful automatic
join yield; perfect singleton abstention follows from that conservatism. The
learned model therefore has no independently demonstrated advantage over raw
E5, and remains an inactive research artifact.

The base E5 assets were already installed; no PyTorch or new model download was
needed. On the current machine, encoding all 310 train/validation pages with E5
took about 13.5 s, while fitting the 768 parameters took about 1.6 s. Those are
batch timings, not browser per-page measurements. Production vectors, grouping
thresholds, retained data and extension assets remain unchanged.

Further frozen checks did not rescue the candidate. An independently authored
95-document challenge tied raw E5 at 76/76 matched-query rank 1, while a
licensed real Wikinews storyline corpus favored raw E5 on its full 176-article
gallery (168/176 versus this model's 165/176). The exploratory reciprocal-
neighbor margin rule made two false joins on the new challenge. Details,
digests, and scope limitations are in [the evaluation report](../next-eval/RESULTS.md).

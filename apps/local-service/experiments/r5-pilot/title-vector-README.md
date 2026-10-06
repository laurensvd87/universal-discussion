# Transient title-vector probe

This experiment uses the six frozen, approved public R5 Source records. It
validates their ignored inventory and frozen task against the same record bytes,
verifies the installed E5 manifest and every packaged asset, then embeds each
public title in memory with the existing `query:` prefix, token limits and
pooling. It makes no network request and writes no vector, title, URL or
per-run result file; this README records aggregate findings.
The stored body-prefix vectors are read but not changed. No rating file or
assistant judgment is opened.

The four predeclared source-vector blends use title weights 0, 0.25, 0.5 and 1,
normalize each blended vector, and compute pairwise cosine. They are diagnostics,
not a replacement matching policy; a fixed 0.90 cutoff is not calibrated in
these new spaces. Scores are printed only with frozen pair IDs and model asset
identifiers. Do not redirect diagnostic output to a tracked file.

Run from this directory:

```powershell
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none title-vector-core.test.js
node title-vector-run.js
```

On the six frozen Sources and 15 pairs, the count at or above 0.90 was 4 for
body-only, 6 at title weight 0.25, 7 at 0.5, and 1 for title-only. Mean pair
cosines were respectively 0.8784, 0.8973, 0.8984 and 0.8463. The blends
raised scores broadly, including pairs whose Topic identity is unresolved;
these counts therefore say nothing about precision or recall. Six pages across
two editorial themes are too few to choose a weight, revise a threshold, or
activate a second retained representation. Production routing and storage stay
unchanged.

## Frozen synthetic hard negatives

`title-vector-hardneg-run.js` uses the unchanged 32-document invented
`topic-identity` corpus (digest
`0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950`)
and its fixed development/held-out family split. It verifies the same packaged
E5 assets, makes 64 local inferences, and emits only family names and numeric
diagnostics. No original corpus, evaluator, artifact or production file is
written. The 0.90 count is a reference check, not a selected threshold.

Each family has two same-Topic pairs and four distinct-Topic hard negatives.
Cells below show `positives passing / hard negatives passing` at 0.90; `*`
means the family has score overlap (at least one hard negative scores at or
above a positive).

| Split / family | Body | Title 0.25 | Title 0.5 | Title only |
| --- | ---: | ---: | ---: | ---: |
| Development / bridge | 2/4* | 2/4* | 2/4* | 2/1* |
| Development / tablet | 1/2* | 1/2* | 2/2* | 1/2* |
| Development / tolls | 2/4* | 2/4 | 2/4 | 1/0 |
| Development / merger | 2/4* | 2/4* | 2/4* | 2/4* |
| Development / study | 2/4* | 2/4* | 2/4* | 0/2* |
| **Development total (10/20 possible)** | **9/18; 5 overlaps** | **9/18; 4 overlaps** | **10/18; 4 overlaps** | **6/9; 4 overlaps** |
| Held out / flood | 2/3* | 2/4* | 2/4* | 2/3* |
| Held out / energy | 1/1* | 2/2* | 2/1* | 1/0* |
| Held out / rail | 2/4* | 2/4* | 2/4 | 2/1* |
| **Held-out total (6/12 possible)** | **5/8; 3 overlaps** | **6/10; 3 overlaps** | **6/9; 2 overlaps** | **5/4; 3 overlaps** |

The two blended variants recover one held-out positive at 0.90 while accepting
one or two additional hard negatives. Score overlap remains in most families.
Thus the six-real-page score increase does not survive as a safe same-Topic
rule on these synthetic hard negatives. This is failure-mode evidence, not a
general accuracy estimate or a basis for tuning the predeclared weights.

```powershell
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none title-vector-hardneg.test.js
node title-vector-hardneg-run.js
```

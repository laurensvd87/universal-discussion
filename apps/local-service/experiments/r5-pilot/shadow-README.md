# R5 non-LLM candidate shadow

Run `node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js shadow-run.js`
from this directory. The command scans the fixed Git-ignored pilot inventory
(including any rejected records), then selects the six frozen Source records.
It reads each record once, verifies the inventory and frozen task against
those same bytes and Source digests, then
prints pair IDs and numeric diagnostics. It does not open the production DB,
read rating files, call a provider, or persist results. Do not redirect output
outside the ignored local workspace if later results include sensitive context.

`baselineSamePartition` runs the unchanged `adaptive-supported-partitions/v1`
planner as a fresh, six-Source batch with no existing links or manual pins.
It is not a replay of arrival order or the owner's current database.
`vectorCandidate` is its 0.90 pair floor before competing-neighbor decisions.
The shadow's 0.90 is pinned; execution fails if the production floor changes.

The shadow candidate rule is the union of the existing vector floor and title
token Jaccard at least 0.5 with at least two shared tokens. Only a short,
fixed list of English function words is removed; negations and numbers remain.
The independent graded retrieval channel also unions each Source's top three
vector neighbors, even below 0.90. `topKCandidate` is for candidate recall
inspection only; `topKBestRank` and `topKNominations` expose its ordinal strength.
It does not imply same Topic or change `shadowCandidate`.
Publication time is a diagnostic 72-hour band, never an exclusion or merge
rule. Day-only dates are represented as intervals to avoid inventing midnight
precision. These parameters were not tuned to pilot labels. Some pilot scores
were already visible before this design. A candidate means inspect the pair,
not share a Discussion.

Observed six-Source/15-pair pilot: four vector-floor pairs; zero batch planner
joins; four floor/lexical candidates; zero lexical-only additions; ten top-K
candidates, six below the floor. With only six Sources, top three
neighbors per Source makes a broad candidate set by construction. This tiny,
topic-concentrated sample cannot calibrate thresholds or establish recall or
false-join rates. The lexical rule's failure to add a candidate is a measured
limitation, not grounds to lower its threshold against these six pages.

Synthetic boundary checks:

```powershell
node --import ../../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none shadow-match.test.js
```

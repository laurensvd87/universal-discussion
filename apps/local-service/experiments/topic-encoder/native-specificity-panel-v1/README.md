# Specificity panel preflight (ADR177)

Source-only pure metadata validation, pending root and independent Trust source
review. This is not a label seal, native acquisition, quality result or production
activation. The real five metadata files must not be passed to this component
until that review authorizes the separate actual preflight.

`createSpecificityPanel(expectedPins)` accepts exactly five lowercase SHA256 pins:
`candidates`, `curation`, `trainCalReview`, `testReview`, `finalReview`. Its frozen
`validate(texts)` method accepts exactly five UTF8 JSON strings with the same keys.
The later driver must supply independently reviewed **literal FILE hashes**, not
derive expected pins from the strings it is about to validate. There is no file,
network, model, provider, browser, process, native or callback capability here.

All texts are bounded and authenticated before any JSON parsing. The bounded
parser rejects duplicate decoded keys, malformed UTF16, nonfinite numbers and
excessive structure. The preflight recomputes fixed168/split/role/node/family and
diversity constraints, checks rooted local topology, scopes TRAIN negatives,
joins independent reviews and reverses exactly three top-level lexical edits to
authenticate the original reviewed FILE identities without reserialization.

The detached recursively frozen result preserves ordered identities and proposed
gold. Unverified/disputed annotations have `assessmentGold:null`; disputed TRAIN
references explicitly have no verified-reference authority. Counts follow actual
dispositions rather than fabricating166 accepted labels. The two ADR176 cases
remain unverified, all168 rows and72 TEST denominators remain, and assigned
unassessed cases fail the gate. The six format declarations remain conditional;
TEST144 interaction and TEST170 cached expansion have distinct states. No rights,
native availability, full historical exclusion, entity independence or outside-all
truth is inferred. All readiness/assignment flags stay false.

Bounds:256KiB/source,1MiB aggregate, depth24,100000 aggregate values, arrays1024,
objects128 properties, strings16384 UTF16 units; output512KiB,168 rows,25 taxonomy
nodes, path depth8, identifiers160, URLs2048 and48 TRAIN reference records.

Invented metadata tests only (including full168 rows and hostile/boundary cases):

```powershell
node --max-old-space-size=128 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.test.js
```

The real producer/rights/resource protocol, actual panel preflight, capture,
paired E5, reference construction, CAL-only detail selection, locked72-case TEST
and canonical/owner/client integration remain separate unfinished gates.

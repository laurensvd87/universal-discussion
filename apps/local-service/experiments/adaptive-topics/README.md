# Adaptive Topic partition mechanics, invented vectors only

This fixture set freezes deliberately constructed unit vectors to exercise the
approved ADR-023 rule without an embedding model, listener, Chrome, owner data,
network access or extra persisted vectors. It includes a sparse opposing-viewpoint
pair, recurring-event geometry with independent two-sample subgroups, duplicate
flooding and an ambiguous manually pinned neighborhood. Labels are evaluation
metadata and never enter `planAdaptiveTopics`.
Canonical `JSON.stringify(FIXTURES)` SHA-256:
`777a67dd4c413be9bc758f304209343f8dbb1bd4f3cbcf321970116ea4de0ffc`.

From the repository root:

```sh
node apps/local-service/experiments/adaptive-topics/evaluate.js
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/test/adaptive-topics.test.js
```

The rule has fixed .90 floor, .94 sticky tightened boundary, .04 closest competing
member guard and .995 duplicate discount. It uses all-member cross similarities.
Two cohesive subgroups need two nonduplicate representatives each and a .04
separation before an existing group splits. A resulting `retainTight` boolean
must be supplied again for bounded hysteresis when support is later removed.
An existing provisional group with an internal pair below .90 is partitioned by
complete link even without a two-by-two split, and internally incoherent groups
cannot expand. Manual pins are reported as a required Topic ID in each partition;
automatic expansion of a pinned partition is forbidden. No IDs or database writes
are made by the planner.

The duplicate-flooding case intentionally retains four false joined pairs in a
previously wrong group. Copies cannot manufacture independent split support, but
that means this conservative rule will not repair every old error. The synthetic
opposing-viewpoint positive merely verifies a geometric .91 sparse merge; E5 can
place real opposing articles farther apart.

These vectors are chosen to make the stated structural cases possible, not sampled
from packaged E5. The prior real E5 synthetic evidence in
`../topic-identity/RESULTS.md` shows opinion/event overlap and cannot establish
semantic correctness of this partition rule. No threshold was fitted to those
scores. The owner-approved local 0.11.0 activation has integrated migration,
transaction, retention, stale-command and browser review recorded in
`../../../../plans/STATUS.md`. That review validates wiring/lifecycle, not semantic
quality, and does not authorize a production release or wider dataset.

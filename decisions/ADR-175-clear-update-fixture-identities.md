# ADR175 Clear update fixture identities

Date: 2026-10-20. Status: root and independent Trust accepted for source-only
implementation. Native execution remains separately gated.

## Correct the test setup without changing lifecycle policy

ADR174's one actual owned PostgreSQL run passed19 cases, including committed
admission/update/reply while actual legacy apply remained held, the native slot
snapshot race and fourteen declared lifecycle orderings. It failed
clear-before-update with P2302;26 cases were unexecuted. All eight clients closed,
the exact scratch OID was dropped, and the owned server/Job exited normally.
Its132 source files, freeze and output are closed immutable.

The clear-update fixture constructs both its admission and update suffix as
`clear-update-true` (or false). Run.input/update prefix both with `native-op-`,
so the update reuses an already committed admission identity with different
command material. The existing queue correctly rejects that setup with P2302
before the clear operation can be exercised. Do not weaken operation identity,
erasure, revision, replay or transaction rules to accommodate this fixture.

Use the already tested newUpdate helper's distinct `-base` and `-change`
identities for these two update cases. Extract the actual clear-case preparation
into one inert exported helper used by the native case and guarded tests. Keep
enqueue/post fixtures, clear ordering, post-clear refusal checks and final
absence/intents assertions unchanged.

## Narrow immutable successor

Create new hierarchy-scoped-native-v3 check.js/test.js/README and
scoped-native-isolated-v3 cluster.js/cluster.test.js/supervise.py/
supervise.test.py/README, with a new fixed data/adr175 driver. Root owns check,
driver, READMEs, this decision and metadata/evidence; Versions owns the cluster
pair and Matcher the guardian pair. Derive from174, never edit or invoke its old
entrypoint/guardian or reuse its stopped directory/output.

Retarget only new175/v3 paths and metadata/run-directory namespaces. Preserve
port55433, exact scratch name, all46 case names, code/binary/source gates,
strict host-address/finite-refusal behavior, role privileges, SQL protocols,
eight-client/resource/deadline/publication/cleanup contracts and the unchanged
pure v1 controller library. Canonical001–009 and ADR165 SQL remain byte-exact.
Use fresh adr175- directories under a separate fixed v3 D-drive parent; never
connect to active55432 or use live credentials/HBA/crawler actions.

## Tests and execution gates

Guarded tests must invoke the actual preparation helper with an invented
operation registry that rejects identity reuse. Demonstrate the old colliding
setup fails, both corrected update orderings create distinct base/change
operations with the original Source/prior receipt, and enqueue/post preparation
is unchanged. Assert the full collaborator sequence, exact original base.job and
base.receipt references, and unchanged bodyHash(9) update. Validate literal
kind/boolean inputs before any capability call.
These are fixture tests, not additional native SQL proof.

Compare every new runtime mechanically with174 after only declared namespace,
library and fixture-preparation changes. Preserve all earlier tests. Complete
root/Trust source acceptance and actual inventory checks precede one metadata
preparation; both actual frozen audits precede a separate ONE-native decision.
No automatic retry or production/model/public-data authority follows.

The original hierarchy-quality, producer, owner-control, discussion-preservation
and end-to-end integration requirements remain unfinished.

# ADR155 Exact owned console baseline and normal drain

Date: 2026-10-20. Status: implemented and independently source-reviewed.
One metadata preparation is accepted; actual execution requires the resulting
208-file freeze audit and a separate one-run decision.

## Evidence and purpose

ADR153's one Node-only diagnostic recorded an extra same-Job process whose live
image-path hash matches `C:/Windows/System32/conhost.exe`, alongside the pinned
Node image. The old Node-only predicate rejected it and emergency cleanup passed.
That proves these two image identities in that run, not ancestry, a helper safety
attestation or the cause of ADR151. Keep all201 sources and output unchanged.

Define a new prospective local diagnostic that admits only an exact startup
baseline: the original handle-confirmed Node, optionally one handle-confirmed
process at the fixed system conhost path. This is an explicit trusted-host/image
path assumption, not a name-only whitelist, binary/signature attestation, OS
sandbox or account/provider authority. Unknown processes still fail. No browser,
page, model, provider, application or database is involved.

## Exact baseline rules

During the bounded bootstrap phase, inspect fresh members of the same owned Job
using the reviewed handle/PID/creation/image checks. Node identity must equal the
original Popen PID, exact creation FILETIME and fixed installed image path hash.
At most one optional console identity is allowed: exact known path hash and
encoding, actual own-Job confirmation, positive PID and exact creation string.
A second console identity, replacement or any other member fails, even with the
same basename. Do not retain or follow command lines, environments or raw paths.
Remember the optional console identity from its first confirmed observation,
including if it disappears before READY. Never reset the slot or accept a later
different console as the first helper. Historical identity may remain in the
sealed baseline, but every current live record must itself be handle-confirmed;
gone records are never evidence of live membership.

After the child finishes the frozen CODE inventory, it publishes a finite ready
marker and waits. Before any continuation, the guardian seals the baseline from
fresh confirmed records and sends a bounded acknowledgment binding its hash.
READY, acknowledgment and completion bind the new freeze FILE hash, complete
208-key source-map hash, original Node PID and exact creation FILETIME string,
and sealed baseline hash. READY precedes baseline sealing, so its baseline field
is an explicit pending value; the acknowledgment binds the exact READY hash and
new sealed baseline, and completion echoes that one outstanding pair. The
guardian supplies the actual handle-observed creation identity; the child echoes
it without claiming its own independent Win32 observation.
After sealing, every live member must match the original baseline PID, creation
and image identity. Optional console exit is allowed after fresh same-Job absence;
replacement or late addition is not. Node must remain live until its expected
normal completion. No fixed sleep, observed process count or JSON boolean alone
can substitute for live membership/handle checks.

The child verifies the acknowledgment, rechecks its known source identity and
reports completion, then exits. Node absence is accepted only after its actual
Popen normal exit and exact completion proof, not an empty census or timeout.
Actual final Job drain must be normal and empty.
Emergency termination is failure; only the new own Job or its exact Popen child
may be terminated. Passing this diagnostic permits no browser execution by itself.
A later browser guardian must still verify callbacks/physical operations drain
and exact baseline membership before acknowledging browser-descendant absence.

## Implementation boundary

Use new namespace `native-console-baseline-dev-v1` under the experimental harness,
with five files: `baseline.py`, `run.py`, `node.mjs`, `test.mjs`, `README.md`.
Root owns this decision; matcher owns those five files after independent design
acceptance. The pure baseline validator has no native or canonical authority.
Actual guardian input comes only from fresh own-Job census, not a CLI/file claim.

Reuse the exact frozen ADR153 helper CODE instead of copying another guardian.
Authenticate its fixed freeze FILE and fixed helper source key before executing
the verified helper bytes in a private module whose name is not `__main__`.
Never call the old `run` or `main`, create bytecode caches in the old namespace,
or read old output. Known helper definitions perform native setup only when the
new guardian explicitly calls them. The Node child may import the reviewed inert
builtins-only inventory module, never its main. The new closure is208 fixed
source/metadata keys: old201 plus new5, this decision and fixed ADR153 freeze.
Do not follow JSON-supplied paths or read old model/content artifacts.

Keep hidden direct launch, exact pinned Node image, scrubbed environment,
256MiB Node heap,1536MiB own-Job limit,1GiB host reserve and C768MiB/D512MiB
reserves. Default entry points are inert. Ready15s, acknowledgment5s, child25s,
guardian30s active/40s wall, census2s cooperative/cleanup5s. Evidence/log files
are at most64KiB each,256KiB total,256 entries and32 retained process rows.
Local native API calls remain cooperatively bounded, not forcibly interruptible.

Pure regressions cover wrong path with the right name, changed PID/creation,
replacement console, third member, false/gone/unverifiable records, exact string
FILETIME, source pin-before-use, acknowledgment binding and normal versus
emergency drain. Root and Trust review source before metadata preparation; audit
the actual208-file freeze before separately authorizing one Node-only DEV.
No historical failure is replayed or converted into success.

## Source checks

Root and Trust each pass five guarded Node tests, with the expected child-process
skip covered by executing the identical pure Python AST/injected-helper suite
separately. Both201-to-208 source assemblies use invented CODE maps and fixed
read spies. Fake clocks reject READY first observed late and a read crossing its
deadline; the guardian checks again before sealing and acknowledgment. Review
also corrected the completion-publication/normal-exit race, preserves the first
console identity across disappearance and checks exact identities throughout
normal final drain. These checks permit preparation only, not a browser or model.

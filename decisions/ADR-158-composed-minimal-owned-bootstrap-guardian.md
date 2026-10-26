# ADR158 Composed minimal owned bootstrap guardian

Date: 2026-10-20. Status: implemented and independently reviewed. Root authorizes
ONE metadata-only preparation; actual execution requires both actual freeze audits
and a separate root decision.

## Purpose and scope

Integrate ADR157's reviewed growing census into a small prospective Node-only
diagnostic. ADR155's underlying census error is unknown; this is not a replay or
an explanation of its failure. Keep all closed208 sources/output unchanged.
No browser, public navigation, content, E5, provider, application or database.

Use new namespace
`spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/`
with four files: `run.py`, `node.mjs`, `test.mjs`, `README.md`. Matcher owns those
four after independent acceptance; root owns this decision and phase gates.
The goal remains real fast hierarchical matching and application integration;
this removes an execution-test obstacle, not a semantic quality gate.

## Actual execution dependency closure

Use the same explicit ordered13-key CODE/metadata list in the Python and Node
programs: the four new files, this decision, frozen ADR153 `run.py` and
`freeze.json`, frozen ADR155 `baseline.py` and `freeze.json`, ADR157's three
component files and its decision. Both lists are CODE literals, not JSON paths.
No package walk, Playwright import, old source inventory, model/artifact read or
old output/profile/cache access is necessary for this Node-only execution.
Do not read the other metadata-listed source keys just because they are present.
Unexecuted old helper functions may reference old namespaces but are never called.

Authenticate the fixed ADR153 freeze FILE
`2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028`
and its fixed `run.py` source key
`5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27`
before compiling/executing those exact verified bytes in a private module with
the original `__file__` and a non-main name. Its globals stay unchanged. Use only
reviewed generic Win32/resource/bounded-read helpers; never old `run`, `main`,
`source_snapshot`, `output_bounds` or count-only drain.

Likewise authenticate ADR155 freeze FILE
`487231c5608b16610e04d0905ea6cd01b84af64004386af66e8c619db517ee43`
and its fixed `baseline.py` key
`03cc1268b8772a8ae2b46c6af24de3fdad74b6abcb459825c7f9d5ec4be73527`
before executing those exact pure bytes privately. Reuse identity/hash and
READY/ACK/completion validators only, not the old guardian or entry point.
ADR157's census bytes are authenticated against the new13-key freeze before
private execution. No bytecode cache, redirected old globals or source rewriting.

## Incremental identity policy and handshake

The growing census validates each confirmed or gone row immediately through a
small explicit incremental policy. Original Node identity comes from the actual
opened Popen handle and must match its exact PID, creation FILETIME string and
pinned installed image. The optional console slot is consumed by the first
confirmed fixed-system-path identity, even if it disappears before READY.
Unknown, second, replacement and post-seal new consoles fail. A gone unknown
member fails, not a successful empty snapshot. The path assumption is trusted-host
identity policy, not a binary/signature attestation, ancestry proof or OS sandbox.

The incremental policy uses the unchanged pure identity/serialization validators;
it does not invent current live rows to register a historical identity. A complete
census separately checks that each final live PID has a current confirmed row.
Original Node absence requires actual exit0 and validated completion. Policy
registration and final membership checks are distinct and receive regressions.

Before continuation, the child inventories only the explicit13 keys and publishes
READY with baseline pending. The guardian samples exact fresh identities and seals
the retained original/optional-console baseline. ACK binds exact READY bytes,
new freeze FILE and ordered source-map hashes, original Node PID/creation and the
sealed baseline hash. Child verifies ACK, rechecks all13 bytes and publishes
completion for that one outstanding pair before normal exit. Parent validates
completion, including if publication/exit happens during a census. An empty Job
or observation timeout alone is never success. Keep exclusive atomic publication,
canonical compact UTF8 JSON and exact string FILETIME across both languages.

Final normal drain continues full census/policy checks until empty. No emergency
termination may produce success. Preserve primary finite census/policy error,
separate cleanup code and bounded partial rows before/after cleanup. Later browser
integration must separately verify actual callback/physical-operation drain and
exact baseline-only membership before any browser-descendants-absent ACK; a pass
here grants no browser execution by itself.

## Resources and phase gates

Same fixed installed Node path, hidden direct Popen launch, scrubbed environment,
owned D-drive TEMP,256MiB Node heap and1536MiB own-Job cap. Host reserve1GiB,
C768MiB/D512MiB; no service/crawler/Windows Update changes. Ready15s/ACK5s,
child25s from actual launch, guardian30s active/40s wall, cleanup5s. All deadlines
use monotonic clocks and include observation/read crossing their bounds.
The census keeps its single cooperative2s/8-PID/9-round/32-row bounds; actual
baseline policy permits only the original Node and one optional fixed console.
Files/logs at most64KiB each, logs64KiB combined, output256KiB/256entries.
Retain bounded failed evidence; never delete or retry a closed execution.

Default entry points are inert. Source review and invented tests precede ONE
metadata preparation; root and independent reviewer then audit the actual13-key
freeze and absence of output. A separate root decision may authorize ONE owned
Node-only DEV. No automatic follow-on phase, collection or model initialization.

Required tests: exact13 lists and injected inventories, pin-before-exec and
same-buffer/private-module checks, no old-inventory calls or JSON-path traversal,
incremental first-console persistence/growth/unknown/gone/replacement/seal checks,
cross-language hash/identity binding, READY/ACK late-read deadlines, publication/
normal-exit race, source drift, false/zero closes, primary-plus-cleanup evidence
and normal versus emergency drain. Tests perform no native/process operation;
the identical pure Python suite may run separately when the offline guard skips
its child-process wrapper. Actual source audits read only this declared closure.

## Source checks

Root and independent Trust review pass four guarded checks and the identical
separately executed pure Python suite; the guarded subprocess wrapper is skipped
by the offline capability guard. Tests include growing membership, immutable
identity policy, exact handshake, exit/publication races and primary/cleanup codes.
An expired active budget cannot initialize native capabilities or launch Node.
If Popen crosses the deadline, the retained child is assigned to the owned Job
before deadline rejection, with no handshake continuation. Assignment failure
remains fatal and requires truthful emergency cleanup.

The four reviewed source hashes are run.py
`f79957e5acfb7bc856d051015fe4db5ec9cd7dd74951799cbb95c43612cd02d4`,
node.mjs `7b37f03426d586a7241a710f068ab54a97f0ddacbcd562ec6c2c70301315c076`,
test.mjs `70e6e214df8ab3f4e366e49872dacb92f47a602d70f5c1b8775f9d1428b7578d`,
README.md `75d380e3f84e9146588bddf4dfe77ede79f5e997386d371142c37d6c37a343c2`.
Preparation creates only the exclusive13-source freeze metadata. Once prepared,
these13 source bytes, including this decision, must remain immutable. A passing
Node-only diagnostic would remove a test-infrastructure obstacle; real native
capture, semantic validation and application integration remain separate work.

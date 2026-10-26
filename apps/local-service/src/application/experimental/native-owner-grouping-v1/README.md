# Pure native owner grouping (ADR196)

Unregistered synchronous composition over actual ADR190 preparation. Import does
no IO, capture, model loading, encoding, fitting, persistence or registration.
This is source-only experimental grouping data; semantic quality and authenticated
canonical integration remain unfinished. No discussion migration or feed is added.

`compileNativeOwnerPreparation({schema:'native-owner-preparation/v1',candidate})`
calls the actual preparation compiler once and reads its existing frozen identity
through `describeNativeScopedPreparation`. It detaches topology from that SAME
successfully validated candidate, including every native root outside the local
detail scope. Topology has finite original16-root/128-detail/depth8 constraints
and a conservative144-node union bound. At least one detail root overlaps native
roots, so the actual largest valid union is143. Numerical limits are unchanged.

`prepareNativeOwnerObservation(context,observation)` delegates exact ADR190 input
preparation/classification once, returning its actual opaque job. A private map
associates that job with an empty context token. The token never links back to
compiled state. Native case IDs/nonces remain declared observation identities,
not canonical Source IDs/versions; no authenticity or rights grant follows.

`compileNativeOwnerGrouping(context,{revision,defaultMaxDepth,overrides})` creates
an opaque policy handle. Revision and node IDs are well-formed primitive
identifiers of1..160 UTF16 units without controls/format characters or boundary
whitespace. Depths are integers1..8. Overrides are at most144 dense exact
`{nodeId,maxDepth}` records, unique known nodes with maxDepth at least node depth.
Copied overrides sort lexically by node ID. Unknown personal/authority fields,
proxies, accessors, wrong prototypes, coercion hooks and sparse arrays reject.

`describeNativeOwnerGrouping(handle)` returns frozen identity data: schema,
semanticTransferHash (the ACTUAL described compiler transferHash), topologyHash,
ownerGroupingHash, groupIdentityHash, ownerGrouping and experimental/false
productionValidated/assignmentAuthority/canonicalAuthority/queueAuthority flags.
Topology hash commits only the canonical sorted ID/parent map under
`native-owner-topology/v1`. Owner hash commits canonical revision/default-depth/
overrides. Group hash commits the identity schema and all three hashes. These
are numerical-program/grouping identities, not published registry identities.

`groupNativeOwnerObservation(groupingHandle,preparedJob)` projects only an actual
privately tagged job from the SAME context, even when another context compiles
an identical transfer. Both actual compiler/decision transfer hashes must match.
Deepest matching override on the FULL supported path wins; selection is only a
prefix. Abstention stays unresolved, and conflict/root-only outcomes cannot gain
descendants. Projection reason can be owner-depth-cut while the full original
semantic reason, decision, witness and native identity remain unchanged.

`describeNativeOwnerGroupedObservation(job)` returns only frozen data:
`{schema:'native-owner-grouped-observation/v1',preparedObservation,
groupingIdentity,projection}`. Projection has status, reason, supportedPath,
selectedPath, deepestSupportedNodeId and primaryNodeId; empty paths have null
node IDs. Status is the original candidate/unresolved value. Original registry
mapping remains null and all preparation authority/validation flags remain false.
Prepared/grouped jobs retain no text, vector arrays, full URL-bearing native
witness, context, classifier or callbacks. Grouping handles retain detached
policy/identity data and token only, so regrouping does not retain numerical state.

Change settings by compiling another grouping policy on the existing context and
projecting the SAME prepared job. This does not recompile the numerical program,
prepare, classify or encode again. No identity becomes a canonical/queue grant.

Focused invented-geometry checks, sequentially with the external-capability guard:

```text
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/src/application/experimental/native-scoped-preparation-v1/preparation.test.js
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/src/application/experimental/native-owner-grouping-v1/grouping.test.js
```

These prove composition consistency, not real semantic precision, native capture
compatibility, serving latency or activation. The prior ADR190 receipt remains
historical; renewed Root/Trust acceptance covers the accessor and this component.

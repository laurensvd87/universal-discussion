# Native root + local detail transfer (experimental)

Pure ADR154 numerical composition. No files, fitting, artifact loading, E5,
capture, runtime registration, canonical writes or authority. Tests use invented
geometric coefficients/references only, not real semantic validation.

Compile exactly:

```js
compileNativeRootLocalDetailTransfer({
  schema: 'native-root-local-detail-transfer/v1',
  rootCandidate, // unchanged compileNativeRootRankCandidate DTO
  detail: {artifact, inputDefinition, supportedRootIds}
});
```

The opaque handle privately owns both trusted compiled scorers and detail fusion.
`describeNativeRootLocalDetailTransfer(handle)` returns their detached frozen
composition identity. `prepareNativeRootLocalDetailInput(handle, metadata)` merely
delegates native metadata preparation without detail work. Classification takes
exactly the unchanged native-root input DTO, never caller detail paths, scores or
another vector pair. Both finite unit arrays are privately copied with exact
binary64/signed-zero preservation before either scorer runs.

A unique accepted root is mandatory. Root abstention or a root outside the detail
subset performs zero detail fusion/scoring. For a supported root, separate detail
weights act on the same raw pair. Detail's encoder must match root; its paired
representation must match the unchanged local artifact. Only accepted same-root
detail extends the path. Local STOP/negative/group/MAX-view/LCA rules are unchanged.
Conflicting, unresolved or zero-fusion detail retains the independent root;
malformed inputs and capacity failures throw, never become fallback evidence.

## Honest numerical transfer namespace

The original detail artifact is never rewritten or relabelled. Its construction
must differ from the actual native target builder. The private local query uses
the original numerical policy namespace and synthetic `numeric-detail-<digest>` /
`numeric-policy-<digest>` IDs. A query binding includes composition/root transfer,
native Source-input/root-witness hashes, original artifact/representation and exact
derived-vector bit hash. This is **not** a native Source/version/builder declaration
or a training-source attestation. Actual native witness and target construction
are returned unchanged, separately from the explicitly internal numeric query.

The final `semanticWitnessHash` has a new versioned composition domain. It binds
root witness, actual native Source-input identity, original detail artifact and
representation, exact derived bits, actual local outcome (including accepted
paths/STOP/LCA) and final path/reason. The root-only hash remains separate; it is
never reused as the deeper decision's witness. All hashes bind supplied data,
not authentic Chrome activity, rights, freshness, text-to-vector provenance or
canonical authority. No-refit/no-retune flags describe this adapter's behavior,
not independent evidence of the artifacts' training history or quality.

## Bounds and non-goals

Detail roots must exactly match the declared nonempty subset of approved native
roots. Approved root IDs cannot masquerade as detail children. Caps: 16 roots,
128 detail nodes, depth8 and512 references, original local work preflight at most
four million units. Combined numeric caps are528 dots /202,752 coordinate
products,64 rank comparisons and6,144 logical fusion coordinate visits. Work
counts exclude some validation/copy/hash/native-Math work and all encoding,
capture, queue and database latency. No fast-application benchmark is claimed.

Both producer transfer and detail quality remain unvalidated. Independent real
child/STOP/sibling/OOD calibration and locked validation, actual producer/rights
admission, canonical integration and UI are separate unfinished gates. This module
grants no production or assignment authority.

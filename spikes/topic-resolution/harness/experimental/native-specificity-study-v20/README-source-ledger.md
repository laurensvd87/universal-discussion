# Pure source and preparation input ledger for ADR216

This fresh v20 namespace preserves the ADR179 semantic contract and ADR180/181/184/186
contracts. Its literal inventory contains128 CODE keys:60 successor-owned paths,
64 unchanged shared keys, three shared journey-v4 keys and ADR216. ADR216 replaces
only the ADR212 document key and replaces the three journey-v3 keys with journey-v4.
The accepted ADR215 collector and ADR214 owner bodies bind to fresh local classes;
their standalone diagnostic wrappers and decisions are not runtime imports, CODE
keys or additional producer aliases. Funded diagnostics preserve exact first
originals and semantic contracts. The
official actual-phase tool permission remains external to this source ledger.
No runtime or producer-recipe
dependency uses the removed document. The old compatibility policy remains CODE
for baseline tests, but the actual immutable ADR197 policy replaces its key/value
in both the29 construction keys and producer aliases; its hash binds the new recipe.
Neither journey-v1, journey-v2 nor journey-v3 is retained as an alternate runtime path.
The journey-v4 construction key and both producer-alias sides replace v3 within
the same29 aliases. All original
metadata/artifact/encoder/package pins stay unchanged. The115 package files bring
the source-key total to243, below256. The142 base catalog entries retain all14
non-CODE pins; the base-ledger maximum remains144. PREPARE/TRAIN-CAL add two fixed
controls (144 actual), TEST adds six (148 actual). The inherited IO catalog
cardinality stays148 inclusive/149 refused; runtime budgets stay unchanged.
There are25 literal test entries, including the immutable ADR197 policy test.
The frozen v1-v19 studies and all four startup diagnostics, failed attempts, outputs and profiles remain separate
and immutable; no partial observation is admitted or adopted by this helper.
Actual successor resource checks must count all twenty-four fixed workspaces against the original
aggregate ceilings. This pure ledger neither performs that physical census nor
grants a preparation or TRAIN/CAL retry.

`createSpecificitySourceLedger({catalog, expectedCatalogHash, expectedSourceHashes,
readEntry, walkPackage, guard})` is default-inert. It has no filesystem, package
loader, model, network, process or default IO capability. No actual preparation,
asset-byte authentication, source acceptance, freeze or study permission follows.

The trusted Root supplies a deeply frozen reviewed CODE catalog, a separately
fixed hash of that catalog, and independent hashes for exactly its CODE entries.
Actual catalog paths must never come from JSON or an operator-selected path.
Invented catalogs in tests carry invented identities; they do not authenticate
the real panel, installed package or original artifact files.

Catalog schema `native-specificity-source-catalog/v1` has exactly these fields:

- `entries`: unique `{key,path,kind,maximumBytes,sha256}` records. Paths are
  repository-relative literal slash paths with no traversal. Kinds are `code`,
  `metadata`, `artifact`, `asset-manifest`, `package-baseline`, `lockfile`.
  CODE has null FILE pins and uses `expectedSourceHashes`. Other entries have
  FILE pins, except an asset-manifest may have a null FILE pin when its actual
  SHA is authenticated through the independent composite encoder identity.
- `metadata`: exactly candidates, curation, trainCalReview, testReview,
  finalReview, each pointing to one metadata entry key.
- `artifacts`: exactly freezeBytes, supervisorBytes, selectionReceiptBytes,
  selectionBytes, modelBytes, policyBytes, inputDefinitionBytes entry keys.
- `assetManifestKey`; `package`: exactly rootKey, prefix, baselineKey,
  lockfileKey, version, integrity, files, bytes. The lockfile may be an already
  authenticated CODE entry. Package prefix is `node_modules/playwright-core/`,
  version1.64.1, fixed reviewed integrity, exactly115 files and at most16MiB.
- `producerSourceAliases`: exact29 recipe-source keys to CODE entry keys;
  `oldSourceAliases`: original proof aliases to CODE entry keys;
  `protocolSourceKey`, `embeddingContractSourceKey`; `bindings` containing
  panelIdentity and encoderHash.

`readEntry(frozenEntry)` returns a Buffer or structurally safe native Promise of
one. `walkPackage(rootKey)` returns the complete bounded array of `{path,bytes}`
records; each path is the logical fixed-prefix package key, never a JSON path
to follow. Real trusted IO must independently enforce no-reparse, ordinary-file,
stable-identity and complete-directory traversal contracts. This pure helper
cannot prove those properties from returned bytes.
Byte copies use typed-array intrinsics, not caller properties or Buffer coercion;
opaque extra Buffer properties are ignored without executing them. Transport
wrappers never assimilate an ordinary returned Buffer/array as a thenable.

`inspect()` is one-shot. It authenticates all consumed CODE/FILE bytes before
any JSON parse, including the asset composite pin. It compares the complete
package layout/hashes to the authenticated baseline and checks version/lock
integrity. It invokes the unchanged ADR177 five-input validator, derives the
full168-case manifest and29-source producer recipe, and delegates the seven-byte
artifact-only reuse proof to the unchanged implementation. It never consumes old
candidate labels, raw inputs, evaluation outputs or any of the nine asset files.

The frozen context contains checked maps, the panel/manifest/profile, root reuse
receipt/candidate, encoder binding and nine asset pins. No Buffer or old-fit byte
payload is returned. Root model parameters are reused model material, not query
vectors. `actualAssetBytesAuthenticated` remains false. Root's production catalog
must independently pin panel ba797…e608, encoder763323…a9cd3, baseline FILE908ed…1bb,
the maintained package's115 files/13,656,167 bytes and all reviewed FILE/SOURCE
values; this helper does not replace that literal-catalog review.

`recheck(context)` requires the exact same-instance inspect context and rereads
every consumed CODE/package/metadata/artifact/manifest/baseline/lock byte. It
compares the complete reconstructed context identity. It does not publish files,
make an exclusive atomic filesystem guarantee or authorize subsequent actions.

Limits are128 CODE files,4MiB/file,32MiB CODE total,115 package files/16MiB and256
combined source keys; five metadata inputs262144 bytes each/1MiB total; the
original seven artifact caps802816 aggregate; manifest16KiB; baseline64KiB;
lockfile256KiB; catalog128KiB and returned context2MiB. Aggregate remaining byte
budgets are checked before private byte copies. Each callback is fenced before
dispatch and after actual settlement, plus a final publication guard. The
synchronous trusted guard owns the original absolute deadline/resource checks;
no successful callback renews it and no default clock/scheduler is installed.

One sticky fault prevents further work. Reentry and duplicate inspect fail closed.
`snapshot()` exposes state, failed, pendingOriginals and unsafeOperationRefused.
Original safe native Promises stay charged until actual settlement after a
failure. Proxy/subclass/own-constructor/own-then/accessor-bearing promises are
refused without hooks; the trusted external owner still owes physical and
rejection tracking for refused unsafe originals. No timeout counts as settlement.

Tests use only invented metadata, package buffers and manually authored proof
bytes. The metadata fixture generator is copied from the ADR177 source test;
the real validator and proof/compiler arithmetic are not cloned. Three shared
producer-profile tests register through its invented fixture helper import and
must be counted separately from ledger-specific checks. Actual source/package/
asset/metadata preparation and native/guardian integration require fresh review
and separate authorization for this successor.
The focused entry currently registers17 ledger-specific checks and3 shared
producer-profile checks; none invoke actual IO or validate the real panel.

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v20/source-ledger.test.mjs
```

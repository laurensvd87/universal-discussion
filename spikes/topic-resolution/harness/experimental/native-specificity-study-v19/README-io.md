# Default-inert filesystem adapter

ADR201 preserves ADR200's static IO catalog cardinality of148 inclusive:142
authenticated base entries and the same six fixed TEST controls. PREPARE and
TRAIN/CAL each use144. Entry149, duplicate paths/keys, an unauthenticated catalog
or an unlisted read key is refused before filesystem effects. The base source
ledger still permits144 and CODE128/sourceKeys256; this adds no TEST permission
and changes none of the IO, memory, disk, process or deadline limits below.

`createSpecificityIo(config, trustedFs?)` imports only Node builtins and performs
no filesystem/native/process action at import or construction. Actual method
invocation requires the separately reviewed Root execution/preparation grant.
Tests inject an invented in-memory filesystem; no actual project file, package,
asset, metadata, temporary directory, credential or native primitive is accessed.

The exact trusted Root config is:

```text
{ repoRoot, workspaceRoot, catalog, expectedCatalogHash,
  workspaceLayout, expectedWorkspaceLayoutHash, sourceAssetRoot,
  inspectNoReparse, guard, cleanupGuard }
```

Roots are exact canonical absolute Windows paths, uppercase drive letter, same
drive, with workspace a strict descendant of repoRoot. The catalog and workspace
layout are bounded descriptor-safe copies authenticated against separate Root
CODE pins before any callback. The catalog is the same literal passed to the
source ledger; this adapter does not replace that ledger's full schema/content
authentication. Layout is `{directories:[relative...],files:[{path,maximumBytes}]}`;
every parent is explicitly listed and case aliases/traversal/alternate drives/
Windows special names are refused. Only exact listed directories/files may be
created. A publication's same-parent `.pending` path is reserved automatically.
No paths from evidence JSON are followed. Root owns the literal catalog, layout,
workspace allocation and actual source/freeze authentication.

Methods:

- `readEntry(frozenCatalogEntry)` reads exactly one catalog path, at most its
  fixed cap (at most4MiB), returning a private Buffer copy.
- `walkPackage(exactCatalogRootKey)` streams the fixed package subtree, at most
  depth8,128 children/directory,8192 visited nodes, exactly115 files and the
  catalog's exact byte count, at most16MiB. It returns logical fixed-prefix
  `{path,bytes}` rows in canonical order. Source-ledger validates baseline hashes.
- `createWorkspace()` creates only the exact fresh workspace, nonrecursive;
  `createDirectory(listedRelative)` creates one exact fresh listed directory.
  Existing paths are never adopted or overwritten.
- `readWorkspaceFile(listedRelative)` reads a listed bounded ordinary file.
- `readPublishedIfPresent(exactAckName)` additionally requires a layout-listed
  top-level name: startup `ack.json`, terminal `finish.ack.json`, batch01..24 `batch-NN.start.ack.json` or
  `batch-NN.drain.ack.json`, `cohort.drain.ack.json`, or model-fitting/assessment/
  checks `.ack.json`. Only final-file lstat ENOENT returns null. Existing root
  and all ancestors receive before/after Node ordinary/symlink/realpath/identity
  checks; missing ancestors/root, EACCES, ENOTDIR, unsafe type or identity change
  is fatal. Directory timestamp changes from concurrent ACK publication are
  permitted only with the same directory object identity. Null is metadata-only,
  no byte/open/native-proof request, no absence/no-reparse authority and no lease
  renewal. Once final existence is observed, the first identity is retained and
  the complete ordinary/opened/native-proof bounded read applies; disappearance
  or replacement is fatal, never a null fallback. ACK decoding/authentication
  and actual parent origin still belong to the independent reviewed wire.
- `publishExclusive({path,bytes,beforePublish})` opens the derived `.pending`
  path with `wx`, writes bounded chunks, syncs, awaits close and rechecks bytes.
  The fresh `beforePublish` guard follows all pending-file stat/native proof
  awaits immediately before the exclusive hardlink. Pending and final identity
  and exact bytes are checked afterward. Both names are retained. Existing
  final/partial pending paths fail; no overwrite, deletion or retry follows.
  Fresh writes retain the final opened-handle identity across actual close and
  require the post-close path to be that same object, intended size and single
  link before emitting its after-proof. Same-byte replacements are not adopted.
- `stageExtension({directory,stage,expectedStageIdentity,beforePublish})`
  validates the reviewed stage.js seven-file DTO and external identity, creates
  a fresh listed directory plus `chromium/core`, checks the exact empty layout,
  writes all seven files with `wx`, then checks complete layout and bytes. The
  callback is immediately before releasing the stage handle, after that IO.
  Returns `{path,stageIdentity,recheck()}`; no browser or native authority follows.
  `recheck()` verifies the same exact layout/bytes again. Partial stages remain.
- `countWorkspace({directory:null|listedDirectory,scope:'all'|'batch'})` streams
  every retained entry, including zero-byte files and directory nodes; it never
  builds a344064-entry array. Per batch512MiB/8192 entries, complete workspace
 8GiB/344064 entries, depth32 and8192 children/directory are enforced. No contents
  are read and no profiles deleted. Observed concurrent mutations fail closed;
  this sampled census is not an atomic filesystem snapshot.
- `streamAssets(assetPins)` first validates all nine exact immutable manifest
  name/byte/hash bindings, fixed model/tokenizer identities and total<=256MiB.
  `sourceAssetRoot` must equal literal
  `spikes/topic-resolution/browser/embedding/.assets`. Root must pass only pins
  from its authenticated held source context, not selected JSON. Files are
  hashed sequentially through one reusable1MiB buffer; no model/asset import or
 118MiB allocation occurs. It returns only hashes/counts, never asset buffers.
- `snapshot()` exposes failed/busy/created, pendingOriginals/openHandles,
  closeUncertain and unsafeOperationRefused, not authority or original handles.

## Native no-reparse boundary is required and still unproved

Every ordinary operation checks each Node-visible ancestor using bigint lstat,
exact realpath and endstat. Reads also compare the opened file handle's initial/
final Node identity and metadata to the path. Files are sized before allocation;
identity includes independent Node dev/ino/birthtimeNs, not a claim that inode
equals a Windows file index. Directory enumeration uses `opendir.read()` one
entry at a time; its native opened-directory proof belongs to the trusted seam.

Node lstat/realpath alone does NOT establish absence of every Windows reparse
type. `inspectNoReparse(absolutePath, context)` is mandatory; absent/invalid proof
fails closed. The trusted Root seam must check every ancestor and the opened
native object's attributes/identity using its independently reviewed parent
primitive. A final GetFileAttributesW integer alone does not meet that contract.
Root's authenticated pipe/shim must match and authenticate its real parent
response before returning this exact projection:

```text
context = {schema:'native-specificity-io-proof-context/v1', pathKey,
 operationNonce,edge,parentPathKey,nodeFileIdentityHash}
proof = {schema:'native-specificity-fs-proof/v1',pathKey,operationNonce,edge,
 ancestorsChecked:true,openedIdentityChecked:true,attributes,
 identity:{volumeSerial,fileIndex,creationFiletime,size,fileType},
 atomic:false,requestHash,receiptHash}
```

Native identity numeric fields are decimal strings; fileType is file/directory.
No reparse bit is permitted. Node and parent-native identities are checked
independently and never equated. Root shim separately adds phase, source FILE
identity, sequence and prior-chain authentication to its actual request; the
Node **file** identity hash must not be confused with a process Node identity.
These JSON-shaped test/projection fields cannot authenticate their own origin.

Path keys are exact catalog keys, package `node_modules/playwright-core/...`,
`asset:<one literal filename>`, `workspace:<validated relative>`, reserved
`workspace:` for its root, and `workspace-parent`. Before a create, the proof
opens the existing parent key, never a fictional missing file; after it opens
the new child with parentPathKey equal to the before key. Before hardlinking,
the existing `.pending` file is inspected; after, the final alias must have the
same native and Node object identities. Read before/after native identities
must match. Only before/after proof metadata for the current operation is held.

All checks are sampled unless a future reviewed primitive actually holds
deny-delete paths throughout. The adapter does not claim atomic kernel
handle-relative containment against adversarial swap-and-restore, a Windows
primitive proof, authenticated parent origin or actual Job/resource enforcement.
The actual pipe, native ancestor/handle primitive, allowed-key mapping and source
authentication remain separate Root/Matcher gates. Per-entry proof sampling can
consume the parent's finite65536-message budget before reaching the maximum
workspace entry count; actual preparation must preflight this or review a bounded
batch-proof protocol, not omit descendant checks or infer spare budget.

## Physical settlement and tests

The trusted synchronous `guard` owns the original work deadline and resource
lease. Every IO/proof callback is fenced before dispatch and after actual
settlement; it cannot renew a lease. Only private owned-handle closure uses the
separate cleanupGuard; no public caller may select a cleanup lane. Each handle
gets one awaited close attempt. A failed/unsettled close never becomes claimed
cleanup success. No internal timeout frees an original physical promise or slot.
An actual successful open is registered privately before the post-settlement
work guard. If that guard fails (including late fulfillment after a work fault),
the newly owned handle is still closed once through the private cleanup lane.
One sticky fault prevents new work and publication while safe originals remain
tracked until actual settlement. Unsafe proxy/subclass/constructor/then/accessor
promises are refused without invoking hooks; their external owner still owes
physical/rejection accounting. Opened handles that fail before a method result
is handed off remain the injected/default provider's ownership obligation.

The tests cover invented package/source reads, ancestor/case/identity/size races,
wx publication and partial failures, stage layout, streamed retained counters,
late physical writes/closes, guard/cleanup behavior and unsafe hooks. The virtual
118308185-byte zero stream intentionally fails the fixed actual model SHA after
bounded hashing; no success of the real nine-asset set is claimed. The actual
filesystem/native no-reparse primitive, full asset-byte success, parent channel,
normal actual preparation and real study remain unexecuted and unproved.

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v19/io.test.mjs
```

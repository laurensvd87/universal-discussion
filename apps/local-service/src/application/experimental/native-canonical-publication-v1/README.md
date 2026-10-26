# Native canonical publication facade (unregistered SOURCE only)

ADR219 composes the actual ADR190 preparation, ADR196 private same-context owner
grouping and ADR207 canonical metadata mapper. Nothing imports this component
into a service, route, queue or registry. The real accepted registry is EMPTY;
native study quality remains unmeasured. Invented source tests are not acceptance.

The sole export is `createNativeCanonicalPublicationFacade(serverDeps?)`. Omission
or null gives EMPTY. A nonempty server composition is exactly
`{anchor,readHead,readRecord,readBundle,guard}`, with fixed
`anchor:{publicationId,recordFileSha256}` and non-proxy synchronous trusted
functions. The frozen API is `{prepare,describe,release,close}`. There is no refresh
or retry. Calls take no paths, trust flags, candidates or external prepared jobs.

`prepare({publicationId,observation,ownerGrouping,mapping})` consumes the exact
ordinary DTOs of ADR190, ADR196 and ADR207 and returns an opaque private job.
`describe(job)` returns fresh deeply frozen metadata; `release(job)` deletes its
private metadata and returns capacity once. The limit is 32 OUTSTANDING jobs,
not lifetime calls; GC gives no credit. `close()` is idempotent, drops all private
job/context/port references, and cancels inflight issuance. Reentry into the other
methods from a trusted callback irreversibly invalidates even if caught.

Protected bytes are detached by intrinsic typed-array copying (no iterator,
species or provider property getters), FILE-authenticated before strict UTF8 and
bounded JSON parsing. Record limit256KiB; bundle16MiB. The prepass rejects BOM,
invalid Unicode, duplicate decoded keys, depth>16, >1M lexical tokens, >32 object
keys, >512 array items, >4096 UTF16 string units, >64-character number tokens and
nonfinite numbers. Record is compact JSON; the actual candidate bundle retains
original property order and numeric -0. Shared/resizable buffers are refused.

The head is bound to the complete accepted incarnation/revision tuple and anchor.
Each fence is guard/readHead/guard, with guard exactly true. Reads, numerical
computation and issuance are fenced. Port failures (including falsy throws),
async/thenable results, malformed protected artifacts, identity mismatches or
head changes sticky-close the facade. It never awaits/assimilates async results
and does not claim physical settlement. Providers remain responsible for their
own rejected promises and physical work; this is not a sandbox.

Unknown IDs and malformed outer requests call no ports and do not poison the
cache. Nested ordinary observation/settings/mapping failures and the16KiB exact
description limit are request-only. A failed cold call discards its tentative
context; an established warm context remains. Successful warm calls reuse one
actual numerical compilation and the authenticated record/bundle; they still
check actual190 identity and current head. All fourteen protected native domains
are checked, including both root transfer/encoder equality joins. Canonical
publication's five similarly named hashes remain DECLARED and UNVERIFIED.

The description's exact order is schema, publicationBinding, nativeIdentity,
mapping, recordBindingHash, evidenceScope and five false authority/validation
flags. `recordBindingHash` is SHA256 of JSON.stringify of precisely the first four
fields in that order. `mapping` is the actual detached207 description, including
its null registry hash, `publicationIdentityChecked:false`, other false flags,
declared Source/publication labels, full semantic path and owner prefix. This is
an unregistered record-binding commitment, never a registry/canonical decision.
No raw URL, text, pair, full witness, candidate or prepared/grouped job survives
in retained job metadata. The cache retains compiled numerical context and
authenticated record/maps, not bundle bytes. Bounds are logical, not a V8 heap
guarantee. Topology stays full143 actual/144 conservative nodes and depth8.

Head brackets provide only an issuance snapshot; descriptions are not currency
certificates. Future protected issuance must audit successful TRAIN/CAL, selection,
held-out TEST and independent quality evidence. Future transactional canonical
admission must recheck actual publication, principal, Source incarnation/prior,
native proof and rights. No registry issuance, authentication, enqueue, SQL,
discussion rewrite, crawler, runtime activation or production quality follows.

Run invented source tests sequentially with a64MiB heap:

```powershell
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 apps/local-service/src/application/experimental/native-canonical-publication-v1/publication.test.js
```

Timing diagnostics separate cold prepare, warm prepare and describe; they are
invented pure-source measurements, not capture, E5, UI or serving latency claims.

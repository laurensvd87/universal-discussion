# ADR163 Versioned inputs and stable discussion bindings

Date: 2026-10-20. Status: accepted for isolated source-only implementation after
independent Trust design review.
Source-only isolated implementation is the next gate; no owner database action.

## Required behavior

A changed page can acquire a new current hierarchical decision without moving
any existing discussion. Bind each new root atomically to the exact input version
and semantic decision current when it was posted. Preserve canonical Source,
Topic, discussion and post destinations. Topic nodes remain semantic projections,
not new canonical posting destinations or account/native authority.

The existing admission prototype cannot safely update pages: its input has one
Source primary key, its witness checks the current canonical body/version, and
its Source trigger rejects all rewrites. Adding version tables alone does not
change those hooks. `sourceStamp` also excludes title, so a title-only update must
be detected independently of that stamp.

## Isolated implementation boundary

Use four new files under
`apps/local-service/portable/canonical-v4/experimental/hierarchy-fast-input-versions-v1/`:
`schema.sql`, `repository.js`, `test.js`, `README.md`. The hierarchy_versions agent
owns these four after root/Trust design acceptance. Root owns this decision and
the integration gate.
Default imports are inert. Initialization accepts only an explicitly supplied
fresh in-memory PGlite canonical fixture, with no dataDir or native server.

Install a separate experimental namespace and its own guarded hooks after the
unchanged canonical001-009 fixture migrations. Do not install the old admission
or queue prototypes in that engine and do not replace their functions. Reuse
their reviewed mechanics by explicit source comparison or pure validators only.
Use a distinct experimental source-policy/receipt capability, never a fake Ridge
policy or an implicit v1-compatible update contract. Applied migrations, current
runtime/client/crawler and all closed experiment sources remain untouched.

This slice demonstrates synchronous owner-only new admission, addressed update,
root binding, reclassification, feed invalidation and erasure. The existing
new-source queue does not support it. A later reviewed update queue with exact
actor/operation identity, original authority deadline, cancellation, lease and
post-mutation expiry checks is required before worker/API activation. Owner-only
SQL evidence is not authentication, producer attestation or ML correctness.

## Storage and addressed update

Use immutable input_versions keyed by actual Source FK and resulting positive
Source write-version. Retain generation, exact title/extractor, source stamp,
body/title input identities, builder/encoder/representation/document identities,
both384-dimensional binary64 arrays and exact array_send wire hashes. Preserve
signed zero without renormalization. Store no captured body prose. Historical
vectors must exist as immutable evidence; a hash alone is not their replacement.

An immutable decision belongs to one input version and exact artifact/policy;
nullable node is honest abstention. One mutable current pointer has composite FKs
preventing cross-Source input/decision substitution. Root bindings have actual
root/Source/input/decision/Topic/discussion FKs and immutable snapshots. The initial
artifact may retain the existing root-only fixture; this proves version mechanics,
not child taxonomy quality or final product scope.
Its fixed builder/encoder/representation identity remains mandatory. Incompatible
builder-only changes reject without mutation or renewal; accepting a new artifact
requires a later reviewed artifact-version lifecycle, not an invented match.

Only genuinely new Sources may enter this prototype. Existing legacy Ridge or
v1 Sources cannot be adopted, backfilled or reconstructed from invented paired
inputs. New admission checks absent URL/generation/absence watermark, allocated
IDs, cross-policy queued URLs and operation reservations under the existing brief
growth advisory namespace(914092008,1), without Ridge/catalog matching.

An addressed update requires exact Source ID, generation, expected Source write-
version and prior current-input/decision/witness identity. Lock canonical receipts
before Source and preserve shared lifecycle lock ordering; check actual canonical
payload/title/extractor/body/link/membership/stamp/receipt mirrors, not caller
copies. Preserve the URL, Source/container IDs and singleton membership. Validate
the new supplied paired material against the fixed artifact before mutation.

In one transaction append new input/decision, update canonical Source payload,
title/extractor/normalized body/operation receipt/stamp and Source write-version,
then switch the current pointer. A private one-command intent can authorize the
exact guarded Source rewrite; no caller-settable GUC or general trigger bypass.
Root IDs/authors/bodies/destinations and immutable version bindings must remain
unchanged. When the Source stamp changes, preserve canonical005's in-place anchor
lifecycle: pin affected Source-anchored roots to their SAME canonical Topic and
advance affected canonical root/discussion write versions. Do not leave a stale
Source anchor and claim compatibility. This anchor maintenance is not semantic
reassignment or root movement and must not rewrite the immutable input binding.
Prove actual canonical read/reply remains valid after the update. The
command never calls ingest_apply, ingest_ridge_scan or creates a fixed reference.

Use a whole-command update digest including expected prior identities. Exact
completed replay returns its original receipt without making an old version
current again. Changed material under an operation ID conflicts. An accepted
input may return a renewed receipt without a new version only when ALL immutable
material matches: title/extractor/builder/encoder/representation/document/input
identities and exact body/title array_send bits, not sourceStamp or vectors alone;
it cannot replace a decision or mutate historical evidence. Reclassification
appends a new decision for the current input and switches only its decision
pointer. A stale input/decision witness cannot create a new root.
Historical receipts are not current-root proofs. Replay after a later update or
decision cannot restore current authority; replay after forget cannot recreate
the Source, current pointer or erased evidence.

## Roots, erasure and verification

Compose existing canonical prepare/complete command checks and root insertion
with a protected deferred root intent and immutable binding in one transaction.
No orphan binding or command receipt on failure. Direct legacy human/generated
root insertion in new-policy containers remains blocked; generated sharing needs
its own reviewed wrapper later. Replies retain their existing canonical routes.
Historical binding reads follow immutable FKs and do not demand that their input
still equals the current page. Semantic feeds grant presentation only.

Source forget removes every input version/vector/decision/current pointer/root
binding/receipt/intent and future queued proof, with affected feed-token advance.
Keep canonical posts and their destinations under existing lifecycle rules.
Account/root withdrawal, confirmed Topic deletion and clear-learned-data must
not be blocked by experimental FKs or gain any additional destructive authority.
If replay tombstones remain, they contain no Source URL/input/credential material
and cannot revive erased authority.

### Required retirement correction

Root's additional fresh-memory probe found a gap after the initial19 passing
tests: forget an admitted Source, then reuse the SAME representation/operation
with a newer expected revision and new proposed allocation IDs. Admission created
a new Source. Because admission deliberately ignores those proposed fields in its
replay identity, old-argument rejection alone did not establish erasure safety.
The initial19-test source checkpoint is not a final release.

Root and Trust accept a minimal immutable retirement table keyed by stored input
generation and operation ID, with a finite admission/update/renewal kind only.
Omit a digest if rejection does not require it; changed material under a retired
ID must reject too. No Source FK, URL, material/vector, root/destination, receipt
or credential may survive in retirement rows. A BEFORE DELETE Source hook mints
retirements from all prototype receipts/operations, including renewals, before
FK cascades. Derive generation from immutable input evidence, not the mutable
current runtime generation. The hook takes no growth or lane lock.

Admission/update reject same-generation retired IDs under their existing command
fences before replay/allocation. Legacy insertion/reactivation rejects retired
NEW generation/operation IDs too, while terminal cancellation/scrubbing remains
valid. Retirements survive Source forget, Topic deletion and clear; existing
generation fences reject old-generation commands. This does not prove a full
generation-reset/wipe integration or native races. Fresh deliberate observations
need a distinct operation ID; they are not resurrections of a retired operation.

Add regressions for newer-revision/new-allocation replay after forget, changed
material with retired ID, all admission/update/renewal IDs, legacy different-URL
reuse, a distinct new operation, Topic-delete/clear, deletion rollback, generation
fences and exact privacy/privilege shape. Re-run complete root/Trust source gates
before accepting this corrected implementation.

Root and independent Trust must inspect source and run isolated tests covering:
post under A, update to B, post again and actual canonical read/reply; title/body/
document-only changes and incompatible-builder rejection without renewal; exact
binary64/signed-zero history; unchanged representation; stale prior version and
cross-Source substitution; A-to-B-to-C then replay-B without rewind or current-
root authority; reclassification without root
movement; no-Ridge throwing stub; direct human/generated/legacy bypass failures;
atomic injected rollback; forget/withdraw/Topic deletion/clear scrubbing; exact
legacy-record preservation; fixed definer paths and no PUBLIC/app table grants.
Sequential PGlite probes cannot establish native lock-race safety or throughput.

Full native producer root/child/STOP/sibling/outside quality, trusted account and
paired admission, bounded queue dispatch, additive production migration/recovery,
owner controls, policy-aware client/catalog/reply/Insight handling, parent feeds,
actual browser UI and measured end-to-end latency remain required before live
activation. This versioning slice does not replace or complete those requirements.

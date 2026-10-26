# ADR-121: Complete canonical metadata for Discover enrichment

Date: 2026-10-15
Status: Implemented, independently reviewed, verified and active locally.

## Failure and decision

The owner supplied a Discover screenshot for the saved Kapsalon YouTube page:
"No related pages in the library yet." Related retrieval itself had results.
The PostgreSQL enrichment bundle returned a catalog scoped to the current Topic
but omitted canonical metadata for cross-Topic Related results. The strict
browser `readEnrichment` requires exact matching Source metadata and rejected
the whole bundle. The page projector independently requires those catalog rows.
The live HTTP response reproduced the failure at the actual client parser.
Earlier retrieval-only verification did not exercise this composition boundary.

Keep the client validation intact. Extend only the optional enrichment catalog
inside its existing repeatable-read read-only transaction. Collect explicit
Source IDs from Related and alternate membership, plus prior/alternate Topic
IDs. Hydrate exact canonical rows with normalized Source/link/membership/receipt
and Topic/reference mirror verification. Reuse the original recursive
fixed-reference/membership closure; retain ordinal ordering, 500 Source/Topic
closure bounds and response byte limits. Do not expand every related Topic's
member list, synthesize catalog rows from Related DTOs, weaken document/context
proofs or grant write/provider authority from optional metadata.

If optional closure integrity, capacity or final bundle size fails, discard the
optional components with existing fixed errors and return the intact base
catalog/discussion. Corrupt base metadata still fails normally. Unrequested
alternate sections stay absent. Topic membership, Related0.88/0.80 policy,
posting, Insight requests and raw/authenticated deadlines remain unchanged.

## Verification

Full portable suite104/104, focused browser contract/Discover/controller139/139,
and canonical read suite12/12 pass. A new regression starts with genuinely
separate Topics, changes only synthetic embeddings, runs PostgreSQL service
enrichment through the real browser `readEnrichment` and `projectRelatedPages`,
and verifies both strong results and the single lower-floor result. Exact
Source/title/URL/primary and all membership Topic descriptors are present;
no unrelated member-list expansion or private fields appear. Missing optional
Source and corrupt Topic mirrors preserve the ready base discussion. Additional
real normalized synthetic rows verify exactly500 Topics succeeds and501 yields
optional `capacity` with the original base catalog/discussion. Header and
membership preservation are checked before deliberate synthetic corruption.
Existing forged/missing metadata, navigation, account and version checks remain.
Independent read-only review found no blocking issue.

Read-only owner-page proof after activation uses exact saved URL selection and
authenticated enrichment, then the real strict client parser and page projector:
9 Related results, 13 catalog Sources, zero missing Source rows, 9 projected
pages including the requested Kapsalon recipe. Both unrequested and enabled
overlapping-Topic projections pass (7,959/8,209ms; revision16,453). No actual owner
profile reload or browser rendering is claimed. The panel should be closed and
reopened to replace its previous failed optional state; no extension reload is
required by this backend-only correction.

Concurrent mixed reads100/100 HTTP200 in513ms, saved discussion48ms with root
and reply, provider status connected without inference. PostgreSQL lock waiters,
blockers, deadlocks and idle transactions remain zero; pairing hash unchanged.

## Activation

Only the reviewed read-facade file was overlaid into the checked runtime. Previous
code and manifest are preserved in ignored `data/runtime-backup-adr121-20261015`.
Seal `14edc1576243fe8d0c94785ebf0ef297b1492dba7a3f488e3e206929b5e4b15f`
contains1,355files/15,229,361bytes; preflight and13 dormant module imports pass.
HTTP service-only restart changed43852->29924. Crawler30008 (start10:17:50),
worker22884 and dashboard6644 retained their start times; crawler count12,819
completed at revision16,453. Service stderr is empty. No crawler stop/reset,
provider call, page capture, post, data migration or owner-data rewrite occurred.
Existing crawler/user activity remains independent. Exhaustive optional lookup
still costs about8s here; this is not a performance or hosted-scale claim.

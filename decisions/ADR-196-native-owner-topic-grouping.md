# ADR196 Owner grouping over native semantic membership

Date: 2026-10-23. Root and independent Trust accept this source-only design.
Root and independent Trust also accept the complete implementation below.
No database, browser, model-inference,
publication or runtime activation follows.

## Purpose

Keep the deepest supported semantic path independently from the owner-selected
discussion grouping. For example, Games → Video Games → GTA may remain the
supported membership while the owner initially groups discussion under Games.
Changing grouping must not encode text, recompile the numerical classifier or
classify an observation again. Owner settings may vary by subtree; no personal
override is added. Actual quality and authenticated canonical integration remain
separate unfinished requirements.

## Existing preparation identity

ADR190 already compiles the actual native root/local-detail classifier once and
stores its existing frozen compiler identity. Add only
`describeNativeScopedPreparation(handle)`: exactly one authentic private handle
returns that same already-frozen identity, without compiling or classifying.
Forged, proxied and extra-argument calls reject without hooks. No classifier
capability, artifact mutation, raw input, new identity or authority is exposed.

Only the existing unfrozen, unregistered preparation.js, preparation.test.js and
README.md may change for this accessor. Renew their full source/test acceptance;
the original ADR190 receipt stays historical. No consumed study list references
this application preparation component. All consumed v1-v12 and current v13
study code/maps/output remain outside this change.

## New pure composition

Create exactly grouping.js, grouping.test.js and README.md under
apps/local-service/src/application/experimental/native-owner-grouping-v1.
All six exports are synchronous and default-inert:

1. `compileNativeOwnerPreparation({schema:'native-owner-preparation/v1',candidate})`
   calls the actual ADR190 compiler once, obtains its actual described identity,
   and descriptor-copies topology from the SAME successfully validated candidate's
   rootCandidate.rootModel.nodes and detail.artifact.nodes. Union every root,
   including roots outside detail scope; duplicate roots must agree. Validate
   detached unique IDs/parents, rooted acyclic depth at most8 and at most144 total
   nodes (original16 roots plus128 detail bound; no numerical limit changes).
   Store a private context token, not a new canonical identity.
   The bound144 is conservative: at least one detail root overlaps a native
   root, so a real valid union has at most143 unique nodes.
2. `prepareNativeOwnerObservation(context, observation)` delegates the unchanged
   ADR190 observation preparation once and privately tags its authentic opaque
   job with the context token. Retain no raw input or closure over it.
3. `compileNativeOwnerGrouping(context, ownerGrouping)` accepts exactly revision,
   defaultMaxDepth and overrides. Depths are integers1..8; at most144 unique known
   override nodes; each maxDepth is at least that node's depth, matching the
   established owner policy semantics. Sort copied overrides by node ID. Capture
   the actual transfer identity and detached topology, never a caller hash.
   Revision is a bounded primitive identifier, never a numeric/coerced revision.
   Overrides are dense exact {nodeId,maxDepth} data records.
4. `groupNativeOwnerObservation(groupingHandle, preparedJob)` accepts only an
   authentic privately tagged ADR190 job from the same context, with matching
   actual compiler and decision transfer hashes. Walk the FULL supported path;
   deepest matching override wins. Select only its prefix. Unresolved stays
   unresolved; a root-only/conflicting outcome cannot acquire descendants or
   switch branches. This operation neither prepares nor scores again.
5. `describeNativeOwnerGrouping(handle)` returns frozen detached identity data.
6. `describeNativeOwnerGroupedObservation(job)` returns only the frozen grouped
   description. Never accept an equivalent JSON object as a handle or job.

Apply descriptor-safe exact records, dense bounded arrays, primitive well-formed
identifiers and finite depths throughout. Reject extra authority/personal fields,
accessors, proxies, promises, sparse arrays, wrong prototypes and coercion hooks
without running them. Compilation and settings updates retain only private
detached model/topology/policy state. A tagged prepared job holds only its token;
the token must not retain its compiled classifier or context.

## Identity and description

The topology hash identifies only a canonical sorted ID/parent map. The owner
grouping hash identifies only canonical revision/default-depth/override settings.
Bind grouping identity to the actual existing semantic transferHash, topology
hash and owner grouping hash. Do not invent a second semantic witness or pretend
these are published five-hash registry identities. Owner revisions or cuts change
the grouping identity but not the actual semantic decision or native identity.

A grouped job stores ONLY frozen data: schema, the complete actual ADR190
preparedObservation, groupingIdentity and projection. Projection includes status,
reason, supportedPath, selectedPath, deepestSupportedNodeId and primaryNodeId.
Its reason may be owner-depth-cut; the actual semantic reason/witness remains
unchanged inside preparedObservation.decision. Retain no raw text, vectors,
URL-bearing full native witness, input, context, classifier, policy handle or
capability through the grouped job. All existing nativeAttested/canonicalAuthority/
queueAuthority/productionValidated flags remain false; registryMapping stays null.
This is grouping data, not an ancestor-feed query or discussion migration.
Projection status remains the original candidate/unresolved status. An empty
supported path has selectedPath:[] and both deepestSupportedNodeId and primaryNodeId
null; owner settings cannot turn it into a candidate.

Owner setting changes compile only a new grouping policy on the existing context
and project existing tagged observations. No numerical recompilation, encoding,
classification, fitting, registry publication, persistence or asynchronous work.
Authentication/admin controls, canonical Source identities, artifact publication,
queue issuance/lifecycle, ancestor discussion feeds and actual UI tests remain
separately reviewed integration work.

## Tests and ownership

Native-grouping agent owns only the three new files and the three explicitly
unfrozen ADR190 accessor files. Root owns this decision, integration and receipts.
Trust reviews the complete implementation and tests independently. No imports
from database, repository, queue, filesystem, network, provider or browser in
runtime code; imports perform no IO or registration. Do not alter numerical
owners, schemas, frozen studies, live services, crawler or discussion data.

Use invented geometries with the actual pure numerical owners. Cover complete
path and deepest overrides; broad and specific groups on the same prepared job;
all native roots outside detail scope; abstention and conflict preservation;
exact semantic/witness/native identity across owner revisions; sorted-rule
identity; cross-context/forged jobs; caller mutation; unsafe inputs and retained
data boundaries. Exercise144-node/override bounds, depth/cycle/parent rejection,
new accessor identity equality/deep freezing and exact export/import contracts.
Focused tests run sequentially with64MiB heaps and the external-capability denial
guard. These tests prove composition consistency, not real semantic precision,
native capture compatibility, serving latency, concurrency or live activation.
Reject cross-context jobs even when both numerical transfers are identical.
Post-compile caller candidate mutation cannot change classifier or topology.

## Completed source checks

The six-file implementation passes complete Root and independent Trust review.
The original eight preparation tests remain, with the new read-only accessor
case; renewed preparation passes9/9. Grouping passes12/12, including the real
143-node union, all15 native roots outside detail scope, supported depth8,
deepest overrides and identical-transfer cross-context rejection. No144-node
native candidate is fabricated and original numerical limits stay unchanged.

Sequential external-capability-denied64MiB runs pass with zero failures/skips:
Root110.7415ms preparation and115.5065ms grouping; independent105.1392ms and
115.71ms. These are invented-geometry test timings, not serving latency. Six
source-file secret scans have zero findings and six scanner self-tests pass.
Exact source pins and scope are saved in
apps/local-service/data/native-owner-grouping-adr196-source-review-20261023.json.
The original ADR190 receipt remains historical. No runtime imports/registration,
actual quality artifact adoption or authenticated canonical integration occurs.

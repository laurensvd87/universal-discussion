# ADR177 Specificity panel preflight

Date: 2026-10-21. Status: root and independent Trust accepted for source-only
implementation with the concrete bounds and identity rules below.
This is source-only implementation, not a collection or model execution grant.

## Bind the complete panel before the native hierarchy study

Implement a pure metadata preflight for the fixed168-group ADR159 panel, including
ADR176's final review. This is the first executable slice of the full real-input
hierarchy study, not a replacement for capture, quality or production integration.
Existing root ranking, local detail composition, CAL fitting and full-path
assessment are reused unchanged in the later study.

Versions owns only panel.js, panel.test.js and README.md under
`apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/`.
Root owns this decision and later receipts. No IO, native/browser/network/model/
artifact/provider calls, process launch, runtime registration or writes are allowed
by this component. Keep all older frozen sources, metadata and outputs unchanged.

## Pure input and authentication boundary

One factory takes exactly five expected SHA256 values keyed candidates, curation,
trainCalReview, testReview and finalReview. Its validation call takes exactly five
UTF8 JSON strings under those same keys. Validate plain descriptors, string types,
per-source256KiB and aggregate1MiB limits before hashing/parsing. Authenticate
EVERY string against the expected digest before parsing any JSON or following
source references. Reject proxies, getters, extensions, malformed strings and
unexpected keys without coercion. The component performs no path access.
Use node:util.types.isProxy before reflecting on object arguments. Reject duplicate
decoded JSON keys, unpaired UTF16, nonfinite numbers and excessive structure:
depth24,100000 total values,1024 array entries,128 object properties and16384
UTF16 units per string. These bounds cover source metadata, not native input.

Expected pins are trusted configuration, not evidence from the strings themselves.
Invented tests may supply their own invented pins. The actual later root driver
must supply separately reviewed literal FILE hashes, never hashes computed from
the same untrusted input on demand. A matching hash binds supplied metadata;
it does not establish human truth, native rights, freshness or runtime authority.

Parse only the authenticated bounded metadata. Validate relevant schemas, proposed/
unsealed/no-model/no-native/no-rights/no-assignment flags and complete review joins.
Curation goldScope is exactly the existing object with id equal to the declared
scope, fullHouse63DeepestTruthClaim:false and unknownChildrenStopAtRepresentedParent:true;
it is not a primitive string or a permissive dual-format field.
Review hash references must reconcile the declared three-field bookkeeping
transition rather than trusting a boolean about it. Bind both original reviewed
hashes and exact current source hashes; verify current cases/countReport digests.
Subsection digests are SHA256 of UTF8 JSON.stringify(parsedValue), no newline.
Reconstruct original reviewed FILE digests by reversing exactly one lexical
occurrence of each declared field edit, preserving all other bytes/formatting:
candidate top status, curation top status and curation top selected. Do not
JSON-reserialize whole sources or accept only an asserted reversal boolean.
Do not replay searches, inspect old captured inputs/results or infer full historical
exclusion coverage from the available declaration.

## Cohort and truth checks

Preserve original case order, all168 unique IDs/URLs/groups,48/48/72 splits and
73 declared publisher families with no cross-split family. Check all declared
role, leaf and parent quotas and leaf language/origin diversity by recomputation,
not countReport assertions. Validate public URLs using the existing pure URL
policy. Preserve the sole documented TEST170 support alias and its conditional
cached-format evidence; no silent normalization or new alias exception.
Use inspectPageUrl from spikes/topic-resolution/browser/core/page-content-policy.js.
Taxonomy IDs/parent edges, quotas and six challenge-class IDs are fixed reviewed
code constants, not facts inferred from caller declarations. The12-node forest
includes three existing roots, so its union with16 roots has25 distinct nodes.

Use exactly the16 current root IDs plus the12-node local forest described by
ADR159, not full63-node deepest truth. Complete paths must be rooted and contiguous;
prefixes do not manufacture child negatives. Scope TRAIN confounder OUTSIDE
annotations to their stated detail root only. MEMBER and direct STOP references
must agree with their accepted scoped labels; no duplicated group votes.
For scoped confounders, metadata nodeId can identify the excluded detail root
rather than the positive gold endpoint. Preserve it and validate the OUTSIDE
annotation independently; do not relabel positive gold to that excluded root.
Require nodeId to equal one of those two meanings, never an unrelated third node.

Join all96 TRAIN/CAL reviews by exact ID, split, URL, group, family, gold and
reference annotation. Join all72 TEST dispositions and ADR176's exact two cases.
Curator verification does not substitute for independent review. Derive166
supported and two unverified statuses from those joins; fail contradictory or
missing/foreign/duplicate review rows. Unverified or disputed proposed labels
must never become assessment gold. Preserve proposedGold separately and return
assessmentGold:null for either state, as ADR176 requires.
Projection labelStatus is verified, unverified or disputed. Derive counts from
actual dispositions; do not force166 by overwriting a dispute. Invented tests
may represent a noncontradictory dispute, which retains null assessmentGold;
an actual preflight of the current pinned files must yield166 verified/two
unverified. Contradictory identities/review bindings remain contract errors.

Keep all six challenge classes and distinct conditional format evidence. Rights
and native availability remain not-observed, independently of label status.
Retain the explicit incomplete historical-exclusion and entity/family-independence
limitations. No outside-all-roots or six-current-dynamic-format claim follows.
Nonchallenge formatState is not-a-challenge. Other states are
declared-format-native-unobserved, fact-panels-read-more-native-interaction-unverified
for TEST144, and cached-expansion-only-current-format-unverified for TEST170.
Bind each state's actual finite review judgment, without echoing its rationale.

## Detached identity and checks

Return a bounded detached frozen projection: ordered case/group/split/role/URL/
language/family identities, proposedGold, assessmentGold, label status, TRAIN
reference annotation and conditional format state; recomputed counts; source
digests; fixed taxonomy/evaluation semantics and a deterministic panel identity.
The hash binds ordered projections and all five expected/actual source pins.
It is not an activated seal: fullyReviewedGoldReady, nativeReady, modelReady,
productionValidated and assignmentAuthority remain false. Do not echo metadata
rationales, old operation ledgers or arbitrary nested input into the projection.
Limit encoded output to512KiB, rows168, path depth8, identifiers160 UTF16 units,
URLs2048 and TRAIN references48. Preserve fixed ADR176 assessment-policy fields:
all original denominators retained; unverified/disputed proposed gold never
assessed; assigned-unassessed fails the gate; unknown assignments remain in the
all-accepted denominator; no all72 accuracy or observed-native-format claim.

Tests use invented metadata only. Cover the full168 maximum, each quota and
diversity/family/split breach, all review-join disagreements, wrong/oversize pins
before parsing, hostile descriptors/strings, gold topology, scoped negatives,
STOP versus prefix, alias exceptions, conditional formats, both unverified cases,
mutation isolation, deterministic hash/order binding and cap+1 rejection.
Root and Trust read complete source and run guarded tests before any actual
metadata preflight. An actual preflight later reads only the five literal
approved metadata files and creates no seal, capture or model permission.
Root owns the inert fixed operator data/adr177-specificity-panel-preflight-20261021.mjs
for that action. Its literal source/dependency/five-metadata FILE pins and bounded
read-only path set require independent review before the explicit --check call.

The full producer/public-main-response protocol, four-case batch identities,
cumulative resource limits, TRAIN/CAL capture, paired E5, reference construction,
one CAL selection, audited selection freeze and locked72-case TEST remain next.

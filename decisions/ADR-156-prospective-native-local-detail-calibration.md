# ADR156 Prospective native local detail calibration

Date: 2026-10-20. Status: implemented and independently reviewed as a pure
calibration component. No actual data collection, fitting or model execution.

## Purpose and boundary

The ADR154 independent-root/local-detail composition needs fresh calibrated local
rules before a real specificity study. Add a pure, bounded CAL fitter at
`apps/local-service/experiments/topic-encoder/native-local-detail-calibration-v1/`
with `fit.js`, `fit.test.js` and `README.md`. Root owns this decision; fixture owns
those three files only after independent design acceptance. No IO, collection,
encoding, provider request, saved-artifact loading or runtime registration.
All closed fitters, models, input cohorts and results remain unchanged.

The proposed168-group study in the front of E5_HIERARCHICAL_MATCHING_PLAN is not
authorized by this component. Actual URLs, labels, producer/resource protocol,
capture, fitting and locked TEST execution remain later separate gates. Existing
16-root model/cuts stay fixed; the local fitter does not rescue rejected roots.

## Closed input and provenance

The one input is `{schema:'native-local-detail-calibration/v1',rootCandidate,
detailTemplate:{artifact,inputDefinition,supportedRootIds},trainingCaseIds,
trainingGroupIds,cases}`. Reuse the unchanged native-root compile/classify,
paired-input fusion and local-evidence compile/score/classify owners. Do not use
the old loose development fitter as a trusted API or clone the local decoder.

Each case has exactly `{id,groupId,language,gold,observation}`. Gold has the ADR152
complete/prefix/outside rooted-path semantics. Observation is exactly
`{status:'available',nativeInput}` or `{status:'unavailable'}`. Native input is the
unchanged native-root input DTO. Its Source ID equals the case ID. No supplied
feature scores, paths or root decisions may replace trusted internal scoring.
Reject proxies, accessors, extra fields, sparse arrays and inconsistent groups.
Copy supplied data privately before scoring; preserve exact binary64/signed zero.

Validate the full gold taxonomy using approved root IDs plus the local forest;
other approved roots remain valid broad gold paths. A prefix is not a full parent
STOP annotation. Unknown children remain parent-positive; known other-root
confounders are not outside all roots. All views in one CAL group have identical
gold kind/path. CAL case/group IDs are disjoint from declared TRAIN IDs/groups
and original template reference groups. Declared TRAIN groups must exactly match
template reference groups; TRAIN case IDs are declared provenance, not an actual
capture ledger attestation. Metadata cannot prove independent editorial origin.
This is explicitly the union-only gold scope, not the full63-node candidate house
taxonomy. A known house child absent from that union is rejected as foreign gold,
not silently relabelled as a complete parent STOP. A later full-house evaluation
needs separate taxonomy metadata or a separately reviewed input extension.

Hash the actual template/artifact/representation/input construction, fixed grid,
CAL gold/groups and each available native Source/rights witness and exact vector
bits into a feature-calibration identity. Do not return raw query vectors, URLs,
page text or local synthetic query IDs as native identities. The original
reference-construction namespace stays unchanged; final calibration version is
separate from it. No fake training-producer claim or rewritten native witness.
The calibration hash binds each ordered case-to-group/gold/native-input
association, not merely unordered sets of otherwise unrelated hashes.

## Raw detail fitting and final root gating

Score raw detail evidence for every available, nonzero-fused CAL pair, regardless
of independent root acceptance. Use the actual same raw pair, original local
artifact namespace and explicitly synthetic numerical query identities bound to
the CAL provenance, as in ADR154. This is calibration-only branch evidence, not
an assertion that production would execute detail after root rejection. Record
root acceptance independently. Root-skipped cases never become fabricated
negative detail features. Unavailable input and zero fusion remain in original
denominators and cannot provide positive evidence or semantic rejection credit.

For complete truth, a node on the gold path is positive and other nodes are
negative. For prefix truth, known prefix nodes are positive, strict descendants
are unknown and disjoint branches are negative. Genuine outside-all-roots truth
is negative for every node. Recompute member and direct STOP eligibility from
the trusted scorer's positive/stop group similarities, negative similarity and
incompatible-positive rival. Do not use seed-cut support/accepted booleans.
Use exact existing strict positive-over-negative and inclusive rival semantics.
The strongest eight groups suffice for minimum support two.

The fixed270-cut grid is similarity .70 through .98 in .02 increments, rival
margin `[0,.005,.01,.02,.03,.05]`, negative margin `[0,.01,.03]`, support always2.
For each cut, any accepted known-false view makes its group wrong; accepted
unknown views remain unchecked, never positives. Count a positive group only
when every view is available/nonzero and accepts member evidence with known
positive truth. Require at least three such groups and zero known-wrong groups,
including wrongful direct STOP acceptance. Unavailable partial groups never
increase support. Direct STOP uses the same positive node truth; coarsening a
known child to its parent is not a wrong semantic assignment.
Keep unchecked groups in the all-accepted denominator and report them explicitly.
Zero known-wrong groups cannot be displayed as validated precision one when some
accepted groups have unknown truth.

Choose deterministically by most all-view positive groups, then most complete
parent-endpoint STOP groups, then fewest STOP-on-known-descendant groups, then
higher similarity, rival margin and negative margin. If no cut qualifies, disable
that node with a valid strict sentinel. Track direct STOP endpoint support
separately: three positive node groups do not establish three STOP groups.
Unknown-prefix acceptance stays visible in audit; it is not counted as correct.

After selecting all rules once, compile the new local artifact and use unchanged
ADR154 for the whole-path CAL decisions and ADR152 for reporting. Root gating,
direct STOP, conflicting paths and common-ancestor decoding are not reimplemented.
This final audit does not trigger another policy search. No TEST data enters
selection, no root retuning and no independently validated quality claim.

## Bounds and checks

At most12 local nodes,48 declared TRAIN groups/512 unique TRAIN case IDs and512
references,48 CAL groups and96 unique CAL case IDs/views, depth8, identifiers160
UTF16 units and language tags32 units. Every bounded array rejects extra properties
and accessors. Root candidate retains its existing16-root limits. Refuse excessive
work before scoring/grid execution: at most16 million charged grid/group units
and128 million scoped aggregate trusted scoring/fit units, including raw feature
scoring and final composition audit. Two passes across96 cases with at most16
root heads and512 references bound coordinate products to38,928,384; account for
fusion separately. The implementation must prove its conservative preflight,
test its maximum and reject cap+1 before scoring. Report scoped work separately
from other validation, copying, hashing and all encoding work.
The fitter must not introduce an unbounded search or another model dependency.

Output contains the new local artifact/policy identity, actual input/grid/CAL
hashes, per-node and STOP group audits, availability, root-gate counts and final
whole-path CAL assessment. Raw calibration inputs are not echoed. Preserve
experimental/developmentOnly true, independentValidation/productionValidated/
assignmentAuthority false; hashes bind supplied evidence, not native activity.

Invented geometric tests cover prefix-unknown versus complete STOP, grouped-view
conservatism and leakage, unavailable/zero fusion, exact trusted feature/cut
equivalence, independent root gating without negative fabrication, all-disabled
fallback, deterministic ties, LCA through the actual decoder, exact capacities,
hostile schemas and binding changes including signed zero. Root and independent
Trust review source/tests before any real data or fitting phase.

## Checks

Root and Trust each pass all11 invented geometric tests under external-capability
denial and128MiB heap. A joint root run with ADR152 and ADR154 passes34 tests with
no skips. The exact96-view/48-group/512-reference/16-root-head case reaches the
38,928,384 coordinate and1,179,648 logical fusion bounds; its conservative grid
preflight is13,234,560 units, below16 million. Excess size and work are refused.
All three actual local compile calls are charged; root compilation and some
validation/copy/hash/serialization work remain outside that scoped count.

Source review fixed observation-proxy checks before union-tag descriptor access.
Group truth is cached once per node/group, charged separately, without changing
cut selection. These tests establish fitting/reporting mechanics, not actual E5
quality, native capture or application latency. Exact source hashes and scope:
`apps/local-service/data/native-local-detail-calibration-review-20261020.json`.

# Prospective native local-detail CAL fitter

Pure ADR156 component. No IO, saved artifact loading, encoding, provider/native
actions or runtime registration. Tests fit invented geometric data only. Actual
collection, labels, root/artifact reuse, fitting and locked TEST need later approval.

`fitNativeLocalDetailCalibration` takes exactly:

```js
{
  schema: 'native-local-detail-calibration/v1',
  rootCandidate, // unchanged native root compile DTO, never retuned here
  detailTemplate: {artifact, inputDefinition, supportedRootIds},
  trainingCaseIds, trainingGroupIds,
  cases: [{id, groupId, language, gold, observation}]
}
```

Gold is `{kind:'complete'|'prefix'|'outside',path}` with ADR152 semantics.
Observation is exactly `{status:'unavailable'}` or
`{status:'available',nativeInput}`. Native input is the unchanged native-root
classify DTO, including its Source-input hash and both raw384D unit arrays.
Source ID must equal case ID. The trusted native owner verifies its associations;
the fitter privately copies arrays with exact binary64/signed-zero preservation.
No caller feature, decision, score or alternate path is accepted.

## Gold scope and provenance

Gold paths are validated **only against the union of approved native root IDs
and the supplied local forest**. This API has no full63-node house taxonomy.
A house-taxonomy `board-games` path absent that union is rejected; it is never
silently relabelled as a complete Games STOP. A later full-house study needs
separate evaluation metadata or a separately reviewed taxonomy-input design.
Known other roots remain valid broad gold paths, not outside-all-roots negatives.

Complete truth is positive at its path nodes and negative elsewhere. Prefix
truth is positive at known nodes, unknown at strict descendants, and negative in
disjoint branches. A prefix is not a complete parent STOP annotation. Outside is
negative everywhere only when the supplied gold genuinely means outside all
declared roots; this component cannot independently establish that fact.

IDs are unique per CAL view, group kind/path is identical across views, CAL IDs
and groups cannot overlap declared TRAIN or original reference IDs/groups.
Declared TRAIN groups must exactly match template reference groups. TRAIN case
IDs are supplied provenance, not a capture-ledger attestation. Metadata cannot
prove independent editorial origin, actual native activity, rights or freshness.

The feature-calibration identity binds ordered case→group→gold→observation
associations, actual native Source/rights/witness and binary64 vector hashes,
template artifact/representation/reference namespace, root transfer, detail
fusion, TRAIN declarations and fixed grid. Raw CAL vectors, URLs and numerical
query IDs are not returned. The returned calibrated artifact DOES retain its
privately copied TRAIN reference vectors; they are not CAL query persistence.

## Selection and audit

Every available nonzero pair receives raw detail scoring, even when root rejects
it. Original reference-construction namespace and synthetic numeric IDs identify
this CAL-only policy evaluation; native Source witnesses are never relabelled.
Unavailable/zero-fusion views supply no positive evidence and no semantic rejection.
Root-gate counts are separate; no skipped-root row becomes a fake negative.

The270 fixed cuts are similarity .70–.98 step.02, rival margins
0/.005/.01/.02/.03/.05 and negative margins0/.01/.03. Support is always two.
Both member and direct STOP predicates are recomputed from trusted local scorer
group similarities, strict positive-over-negative and inclusive rival rules.
Seed support/accepted booleans are ignored; the local path/LCA decoder is not cloned.

Any accepted known-false group view rejects a cut. Unknown accepted views remain
unchecked, not positives. Positive support requires every group view available,
nonzero and accepting with known-positive truth. At least three such groups and
zero known-wrong groups are required. Ranking maximizes positive support, then
complete-endpoint STOP groups, minimizes STOP-on-known-descendant groups, then
prefers higher similarity/rival/negative cuts. Safe parent coarsening of a known
child is not a semantic error. Direct endpoint STOP support is reported separately:
three positive node groups do not imply three direct STOP groups.

Audits show all accepted and unchecked group denominators, a conservative
fully-supported fraction and `validatedPrecision:null`; zero observed known errors
never becomes a validation claim. If no cut qualifies, the node is disabled with
the strict valid sentinel. After one selection, the final artifact is compiled
through unchanged ADR154 and assessed through ADR152. Its CAL resubstitution audit
does not trigger more searching or count as independent validation. The assessor's
forbidden CAL list is empty intentionally because it is auditing CAL, not TEST.

## Explicit finite work

Caps:12 nodes,48 TRAIN groups,512 unique TRAIN case IDs/references,48 CAL groups,
96 CAL views, depth8, identifiers160 and language tags32 UTF16 units. Exact plain
records/dense arrays reject proxies, accessors and extras. Work is preflighted
before query scoring or grid execution. A271 factor covers270 candidates plus
disabled-rule audit, not another searched cut. Grid/group work ≤16M; aggregate
scoped work ≤128M includes raw/final scoring, fusion, three actual local compile
calls and final assessment. It excludes root compile and some descriptor/copy,
hashing and serialization work; it is not a CPU-time bound.

Two passes across96 views ×(16 roots+512 references)×384 coordinates bound dot
products to38,928,384. Logical fusion visits are separately bounded1,179,648.
The exact maximum is exercised by synthetic tests; cap+1 and excessive preflight
are errors, not partial fitting. No production, confidence, population-quality or
assignment authority follows from this component or its hashes.

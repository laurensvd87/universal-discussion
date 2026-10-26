# Complete hierarchy path assessment (experimental)

Pure ADR152 metadata reporting, not classification, calibration, split attestation
or a release gate. No files, models, captures or runtime authority are consulted.

`assessCompleteHierarchyPredictions` takes exactly one plain data object:

```js
{
  nodes: [{id, parentId}],
  cases: [{id, groupId, language, gold: {kind, path}}],
  predictions: [{id, status, selectedPath}],
  trainingGroupIds: [],
  calibrationGroupIds: []
}
```

Kinds are `complete`, `prefix`, `outside`. Complete/prefix paths must contain every
ancestor from a known root and be nonempty; outside has an empty path. Complete
means the gold endpoint is the deepest justified node. Prefix says only that the
known prefix is supported, never that its unannotated descendants are wrong.
Prediction status is `assigned`, `unresolved` or `unavailable`; only assigned has
a nonempty path. Predictions must match case IDs and order exactly. No extra
fields, scores, text, vectors, proxies, accessors or unusual prototypes are allowed.

Complete assignments distinguish exact deepest, safe broader, wrong root,
wrong sibling/cousin and overspecific descendants. Prefix endpoint assignment is
known-prefix-supported, not exact deepest; its strict descendants are unchecked.
Outside assignment is false acceptance. Available outside abstention is semantic
rejection; unavailable is not. All original cases remain in every denominator.

Case reporting includes all below-root accepted decisions, determinate-safe,
wrong and unchecked counts. Precision excludes unchecked decisions but reports
their count and the determinate denominator beside it. Useful coverage counts
known-safe assignments over all cases, not outside rejection or availability.
Zero-denominator rates are null. Root correctness is separate from full-path
correctness: a wrong child can still have a correct root.

Groups must have identical kind/path across every view. Any wrong/unchecked view
is reported conservatively; all-views-safe requires every view available and
known safe. Known-topic abstention gets no positive safe-assignment credit, while
available outside abstention is safe semantic rejection. A group containing an
unavailable view cannot get all-views-safe credit. Below-root all-views-safe also
requires every view assigned below root. Per-language group totals may overlap
and are non-additive. Root slices partition groups by their identical gold root,
including the outside/null slice, so their group totals are additive. Slice case counts use those views; slice group counts
retain the conservative whole-group verdict across all languages, computed once.
Group IDs are declarations, not proof of independence.

Evaluation groups must not overlap either declared training or calibration group
list; duplicate forbidden group IDs (including TRAIN/CAL intersection) are refused.
Caps: 512 nodes/cases/groups, depth8, 2048 TRAIN plus2048 CAL group IDs, identifiers
160 UTF16 units and language tags32. The conservative membership-work preflight
can refuse simultaneous maximal inputs before path traversal; actual scoped
operations and the 65,536 cap are returned. Hashing/copying/serialization costs
are not claimed to be included. Output is detached and deeply frozen.

Only invented-data tests belong here. Real child/STOP/sibling/outside curation,
producer validation and a prospectively frozen evaluation require later approval.
No population precision, confidence probability, production or assignment claim
is emitted.

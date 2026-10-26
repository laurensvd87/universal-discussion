# Hierarchical E5 assignment: first implementation and measured gate

Date: 2026-10-19. Status: offline candidate only; **not activated**.

The exact exemplar matcher, development fitter, independent split assessor and
bounded local-model experiment are implemented. The first locked test fails the
proposed release gate. Existing page assignments, discussion destinations and the
live PostgreSQL runtime are unchanged. This is not the completed hierarchy cutover.

## What is implemented

- Explicit parent-child taxonomy; validated, privately copied 384D unit vectors.
- Multiple independent exemplar groups per node. Descendant examples support
  ancestors; a parent centroid is never a mandatory gate for a supported child.
- Separate positive, stop-at-parent and outside-branch evidence. Unsupported
  children fall back only to an independently supported ancestor, otherwise unresolved.
- Exact bounded scoring, sibling/cousin ambiguity handling, disabled sparse nodes,
  deterministic decisions and exact Source/model/evidence/calibration witnesses.
- Per-node fixed-grid development fitting, group-level assessment, multilingual
  and depth/branch slices, abstention and uncertainty. Scores are not probabilities.
- A frozen synthetic experiment using the existing query-prefix body encoder and
  pinned Ridge challenger, without recapturing pages or making provider requests.

API locations:

- `src/domain/hierarchical-e5-matcher.js`: frozen v1 reference and feature scorer.
- `src/domain/hierarchical-e5-evaluation.js`: frozen v1 development fitter/assessor.
- `src/domain/hierarchical-e5-single-path.js`: separately versioned v2 geometric
  correction, not part of the frozen experiment or its measured E5 quality result.

These modules are not imported by startup, canonical ingestion, HTTP or the client.
No return value supplies canonical posting or AI authority.

## Frozen protocol and actual result

There are 144 independently authored short synthetic inputs: 36 each for prototype,
development, calibration and locked test; English/German/Dutch; 11 taxonomy nodes.
Prototype rows alone supply examples. Development alone fits thresholds and selects
the representation. Calibration assesses without refitting. Only the selected
representation is assessed on the locked test. Existing closed cohorts and the
earlier 84-text clustering experiment were not reused.

Development selected raw E5: 32/32 accepted decisions were safe and 26/36 deepest
outcomes correct, versus pinned Ridge's 27/27 safe and 16/36 deepest. This is an
explicit shadow comparison, not a raw-E5 fallback in the live application.

Locked test, selected raw E5:

| Measure | Observed result |
| --- | --- |
| Assigned | 32/36 |
| Accepted node lies on the gold path | 31/32 (96.875%) |
| Exact deepest outcome, including correct outside rejection | 23/36 |
| Safe broader fallback | 11 |
| Specific leaf assignments correct | 11/12 (91.67%) |
| Independent leaf-decision groups | 12 |
| Leaf precision 95% Wilson interval | 64.61%-98.51% |
| Wrong top-level branches | 0/36 observed, not a population guarantee |
| Classifier median / p95 / max | 0.231 / 0.892 / 0.978 ms |

The one incorrect accepted node is a general video-games example assigned too
specifically to GTA. Other examples often stop too broadly. Three outside examples
are correctly unresolved; two additional capture-quality cases are represented
explicitly in the corpus. These numbers do not establish real-web accuracy.

**Release decision: fail.** The observed 98% specific precision target, the
minimum independent support count of 150 and the 98% confidence-interval lower
bound all fail. Even 150 perfect independent decisions would not meet that
two-sided Wilson lower bound. Zero observed broad errors on 36 examples does not
establish a population error rate of at most 1%. Useful coverage, web representativeness
and actual end-to-end latency still need their own evidence.

Timing includes classifier input validation, excludes compilation, embedding,
queueing and database work, and covers this small hierarchy only. Encoding and
Ridge transforms for 144 texts took 6,029ms **after model initialization**; this is
not cold model startup or browser page-readiness latency. The Windows supervisor
sampled child RSS at 1,059,213,312 bytes and private commit at 1,229,041,664 bytes;
exit0, no resource violation. Sampling every50ms is not an absolute peak guarantee.

## Root ambiguity review and separate v2 correction

An independent geometric review found a v1 limitation outside the frozen test:
two roots with identical descendant evidence can reject both root margins yet
accept their individual leaves. V1 can then choose a primary by lexical tie-break
or emit both with `multiPath:true`. Do not interpret that as independent confidence.

The v2 single-path wrapper requires the selected root's descendant-union evidence
to beat competing roots by a strict positive configured margin. It rejects the
tie as `ambiguous-root-branches`. This is not a parent-centroid gate and still
permits supported child ancestry when a parent's absolute rule is disabled/unmet.
It deliberately does not offer multiple-path assignment; true multi-topic acceptance
needs a separate calibrated policy, not mutual root exclusion.

V2 passes eight new axis-vector contract tests. It has **not** been fitted or
assessed on a new E5 cohort; the v1 final test was not reused or reclassified.
No v1 quality number above describes v2. The original 13 frozen source files,
artifact, report and vectors remain exact.
Inherited feature flags remain v1 diagnostic signals; only final v2 `status`,
`paths` and `primaryNodeId` describe its decision, never `features.accepted` alone.

Final integrated checks:53/53 focused tests with external capabilities denied;
independent review accepted the scope and failed-gate disposition. The backend
secret scanner checked898files with0findings. Public11-hash and local13-hash
stored-byte verification pass; no frozen final classification was repeated.

## Verification without rerunning inference or final classification

From the repository root:

```powershell
node apps/local-service/experiments/topic-encoder/hierarchical-e5-v1/verify.js --verify
node apps/local-service/experiments/topic-encoder/hierarchical-e5-v1/verify.js --verify-local
```

The first checks 11 public source hashes, the protocol, freeze selfhash and stored
report/receipt links. It does not read local coefficients, model assets or vectors.
The second additionally checks the two local source hashes and stored vector and
candidate packets; it requires those ignored artifacts. Neither command calls the
encoder/classifier, fits thresholds, touches the database or replays the final test.
This verifies local stored-byte linkage, not a signed attestation or independent
reproduction of accuracy. Default invocation is inert.

Freeze identity: `b9765d72fd3a3f1ce6f87b03d29a3a012bdb0240ecae08a8bbadd1fb18336ff5`.
The full public report is [measured-results.json](measured-results.json); observed
resource measurements are in [execution-receipt.json](execution-receipt.json).

The original execution sequence was `run.js --freeze`, `supervise.py --encode`,
then `run.js --evaluate`. **Do not rerun it.** Persistent exclusive started markers
and exclusive output writes intentionally reject repeat or uncertain execution.
Do not remove markers or edit closed inputs to make another run possible. Any
next experiment needs a new version, predeclared method and fresh locked holdout.

## Resource and completion boundaries

V1 validates at most512 nodes,4096 examples,8 ancestry levels and384 coordinates.
Its2million scoring-work budget covers coordinate products and stated scoring
loops, not compilation/validation or every bounded postprocessing operation.
The fitter separately caps grid-rule comparisons at2million; aggregate exemplar
scoring across development rows is additional work. Neither is a whole-fit CPU or
wall-clock guarantee. This actual experiment is small and was supervised.

No PostgreSQL migration, persisted hierarchy, background assignment queue,
canonical mapping, parent feed, new browser UI or live scan replacement has been
activated. Owner admin appointment remains deferred. Existing topic containers
are not renamed or discarded, and saved discussions/posts are not moved.

Next permitted engineering step: predeclare the next method (such as small heads
on frozen E5 features), collect sufficiently diverse independent labels and a
fresh holdout, fit/calibrate without final-test feedback, and assess quality and
coverage honestly. The current evidence is insufficient to distinguish inadequate
labels from inadequate vector separability. Do not declare E5 incapable from this
small screen or compensate by forcing broad merges. Persistence/backfill/cutover
remain gated by the plans and a concrete reviewed migration package.

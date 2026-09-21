# Offline owner-review workflow contract

Status: Implemented for a project-created six-pair dry run; the real P1.2
collection and owner checkpoint have not started.

Version: `story-review-workflow/1.0.0`

## Purpose and stop boundary

This workflow turns bounded TSV source and pair inventories into a local,
blinded owner-review queue without requiring anyone to construct corpus JSON.
It records one `same-topic`, `different-topic`, or `uncertain` relationship at
a time while preserving the core model:

`Content -> Semantic Topic -> Discussion`

The workflow ends at a primary-review checkpoint. It cannot export a labeled
corpus, assign gold clusters, perform secondary review or adjudication, freeze
a tuning/held-out split, run an evaluator, or choose an automatic-join gate.
Those are later increments. The actual owner checkpoint is reached only after
the license-safe collection is large and complete enough to present; the six
checked-in synthetic pairs exercise tooling and are not that task.

## Input files

`review:prepare` consumes three UTF-8 TSV files. Each is bounded to 1 MiB,
requires an exact ordered header, a final LF or consistently used CRLF, and no
BOM, blank row, bare carriage return, mixed newline style, invalid UTF-8, or
C0/DEL control character. TSV quoting and multiline cells are not supported.
Unknown, missing, empty, or extra columns fail closed.

The config file has header `key<TAB>value` and these keys in order:

1. `workflowVersion`
2. `taskId`
3. `createdAt`
4. `datasetVersion`
5. `topicDefinitionVersion`
6. `topicDefinition`
7. `contentClass`
8. `language`
9. `primaryReviewerId`
10. `secondaryReviewerId`
11. `adjudicatorReviewerId`
12. `orderingSeed`
13. `secondarySelectionSeed`
14. `provenanceReviewStatus`
15. `provenanceReviewerId`
16. `provenanceReviewedAt`

The three reviewer identifiers must be distinct. Provenance status is
`accepted` with a different caller-declared reviewer and canonical time, or
`pending` with literal `null` in both reviewer and time cells. A pending task
can be prepared and inspected but cannot enter owner review.

The Source header is:

```text
id  url  title  factSummary  publishedAt  provenanceKind  provenanceOrigin  rightsBasis  repositoryUseApproved  containsPersonalData  containsCopiedArticleText
```

The displayed spaces above stand for tabs. Source IDs use opaque
`source-NNN` identifiers. URLs must already satisfy the offline public HTTP(S)
normalizer. The scope is the frozen corpus subset: English
`editorial-article` metadata, title at most 256 code units, fact summary and
topic definition at most 512 code units, and canonical ISO timestamps.

Provenance fields deliberately match `labeled-story-corpus/1.0.0` rather than
creating a broader draft format. Project-created synthetic records require a
reserved example hostname, literal `null` origin, `project-created` rights,
no personal data, and no copied article text. Non-synthetic origin values must
be normalized public HTTP(S) URLs. Accepted review additionally requires every
Source to declare repository use approved and no personal data.
Every publication time must be at or before task creation. An accepted
provenance review must be at or after all reviewed Source publication times
and at or before task creation. These remain caller-supplied timestamps, not
external attestations.

The pair header is:

```text
id  sourceAId  sourceBId  caseType
```

Pair IDs use opaque `review-item-NNN` identifiers and cannot encode the hidden
case class. Endpoints must exist, be distinct and lexically ordered, every
Source must be used, and unordered source pairs cannot repeat. The internal
case type is retained for later corpus checks but never appears in the owner
view. No label, cluster, decision, fingerprint, or raw article field is
accepted by these TSV schemas.

## Immutable prepared task

Preparation sorts the inert Source and pair inventories, then commits:

- a deterministic SHA-256-ranked primary order using a declared seed;
- a separate pre-label secondary-review sample of
  `ceil(pair count * 0.20)`, using a different declared seed;
- the topic definition, reviewers, provenance declaration, and offline scope;
- `corpusMaterialized:false`, `splitFrozen:false`, `heldOut:false`,
  `evaluationPerformed:false`, and `gateEligible:false`; and
- a canonical JSON SHA-256 task digest over all of the above.

Changing metadata, pair membership, a seed, ordering, review plan, scope, or
reviewer creates a different task digest. Reload reconstructs the derived
order and review sample and rejects any mismatch. Preparation uses exclusive
creation and refuses to replace an existing workspace.

The task file contains case and provenance internals because later stages need
them. Blinding is an interface property, not cryptographic secrecy from a
person with local filesystem or repository access.

## Owner presentation

The presentation object is an exact allowlist containing only:

- opaque review-item ID and queue position;
- task digest;
- topic-definition version and text;
- normalized URL, title, fact summary, and publication time for each side;
- the three relationship choices; and
- one instruction to decide the relationship only.

It excludes Source IDs, case type, cluster ID, fingerprints, provenance and
rights data, reviewer identifiers, ordering/selection seeds, secondary-sample
membership, prior answers, rationales, and expected labels. Terminal output is
JSON and escapes C0 JSON controls, DEL/C1 controls, Arabic letter mark, and
bidirectional formatting/isolation characters. HTML, prompt-like text, and
page instructions remain untrusted display data. They are never executed or
interpreted as instructions by this workflow, which makes no provider or agent
tool call; an operator remains responsible for where terminal output is sent.

## Append-only decision ledger

The software creates `story-review-ledger/1.0.0` event records in committed
queue order. The owner supplies only a relationship choice. The workflow adds:

- the committed primary reviewer ID with assurance
  `caller-declared`;
- a fixed bounded rationale derived from the choice;
- a canonical local time with assurance
  `local-system-clock-unattested`;
- task digest, sequence, prior-event digest, and event digest; and
- event contract version and primary role.

Each append internally binds the session digest that was current when the item
was presented. Duplicate, out-of-order, stale, backdated, rebound, reordered,
modified, or gap-producing event changes fail validation. `uncertain` is
retained in history and counted as answered, but it is not a binary gold
decision and cannot enter the frozen corpus.

On disk, fully written and synchronized pending content is published to the
fixed sequence filename with an exclusive same-volume hard link. Concurrent
sessions can produce at most one committed file for a sequence. Reload accepts
only a gap-free sequence of regular files, verifies the complete digest chain,
and reports but ignores UUID-named pending files left before publication. It
rejects symlinked state, malformed/truncated JSON, unexpected files, oversized
state, task mutation, and event tampering. A filesystem without local hard-link
support fails closed rather than weakening no-overwrite behavior.

The append-only property is enforced by this software and its exclusive file
operations. Unkeyed digests prove internal consistency, not authenticity, and
are not protection against a local administrator deliberately replacing or
deleting the workspace. Inconsistent edits and gaps are rejected, but a fully
recomputed alternative history or valid suffix truncation can validate and can
cause items to be presented again. Detecting that replacement requires
comparison with an independently retained last-session digest or receipt; the
workflow creates no automatic/general anchor. The completed six-pair dry run's
final session digest is now recorded in version-controlled project evidence,
which provides a manual comparison point for that run only.

## Commands

From `spikes/topic-resolution/`:

```sh
npm run review:prepare
npm run review:status
npm run review:owner
```

The default input is the inventoried six-pair synthetic dry run, and local
state is written below ignored `review/work/`. `prepare` prints a safe summary
and stops; it does not enter labeling. `owner` displays one item and persists
each answer before showing the next. For a single non-interactive smoke answer,
use `npm run review -- owner --label same-topic` (or either other full label).
`status` prints digests, counts, pending opaque IDs, readiness blockers, scope,
and assurance only—never Source metadata or rationales.

Custom TSV and workspace paths are accepted only by `prepare`; subsequent
owner/status commands take the prepared workspace path. There is no reset,
overwrite, finalize, export, split, or evaluation command.

## Checkpoint and non-claims

`story-review-checkpoint/1.0.0` distinguishes answered, unanswered, binary,
and uncertain counts and reports the preselected secondary-review count. It
reports the 200-pair threshold and six required case classes separately; pair
count alone never claims the collection is ready. It
always leaves secondary review, adjudication, and corpus materialization open,
and always reports held-out, split-frozen, evaluated, automatic-join, and gate
evidence as false.

Reviewer identity is not authenticated, timestamps are not externally
attested, provenance is a reviewed declaration rather than runtime proof, and
local task possession is not access control. The workflow performs no network,
DNS, subprocess, browser, provider, credential, or AI operation. It does not
authorize collection of real/public metadata; provenance/privacy/licensing
review must precede any such checked-in or presented task.

The next design/generated-preflight increment may specify blinded secondary
review, independent adjudication, gold-cluster consistency, and explicit
materializing of the already frozen `labeled-story-corpus/1.0.0` shape. A real
task first needs digested acquisition-plan/provenance artifacts and a
precommitted ranked coverage reserve; v1's exact 20% selection is not
sufficient under attrition. Actual secondary decisions or corpus
materialization wait for the prepared owner task and primary ledger. Every
later stage must preserve all events, re-review or exclude every `uncertain`,
resolve or exclude every disagreement without coercion, and stop again before
any tuning/held-out split freeze or evaluation. See
`../../../plans/P1_2_COLLECTION_AND_COMPLETION.md`. The first generated-only
immutable plan/inventory/task chain and completed-primary bridge are specified
in `REVIEW_COMPLETION_CONTRACT.md`. That separate pure contract can exercise
only an ordered first synthetic secondary pass over initial coverage; it adds
no v1 CLI command, real independent review, reserve activation, rereview,
adjudication, corpus, or completion capability.

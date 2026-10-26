# ADR152 Complete hierarchy path and outside evaluation

Date: 2026-10-20. Status: implemented and independently reviewed as a pure
evaluation component. No capture, fitting, model execution or activation.

## Decision

Add a separate pure assessor for the actual hierarchical requirement: choose the
most specific justified node while retaining a supported parent when detail is
uncertain. Existing root-only success cannot establish child accuracy or rejection
of subjects outside the candidate taxonomy. Keep all closed studies immutable.

Implement `apps/local-service/experiments/topic-encoder/hierarchical-e5-complete-path-assessment-v1/`
with an assessor, invented-data tests and a short usage reference. It must not read
files, capture pages, embed text, fit policies, import saved outputs or register a
runtime route. It evaluates supplied decisions, not classifier probabilities or
canonical authority. No actual quality claim follows from synthetic checks.

## Gold and decision semantics

Validate an explicit bounded acyclic taxonomy and one ordered complete prediction
per case. Gold has three distinct kinds: a fully annotated deepest path, a known
positive path prefix with unannotated descendants, or an explicit subject outside
all candidate roots. Generic parent pages and unsupported children require full
annotations at the appropriate parent; do not invent child negatives from a prefix.

Each case carries a unique case ID, independent entity/editorial group ID and
language. Reject overlap with explicitly supplied training/calibration group IDs.
Translations and copied views in one group never become independent votes. Reject
inconsistent truth for a group. Metadata claims do not attest actual split provenance.

Assigned predictions contain one valid rooted path. Unresolved and unavailable
predictions contain no path. Missing, duplicate, reordered or extra predictions
are errors; unavailable inputs remain in the original denominator. Invalid paths,
capacity errors and malformed records must not become broad fallback decisions.
All paths contain every ancestor from a root. Closed plain-data schemas reject
proxies, accessors, extra fields and raw content, vectors or probability scores.

For complete truth, distinguish exact deepest selection, safe broader ancestor,
wrong root, wrong sibling and unjustified specialization past the gold endpoint.
For prefix truth, score known root/path disagreements, but mark descendants beyond
the known prefix unscored rather than correct or incorrect. Explicit outside cases
distinguish false acceptance from abstention; unavailable outside inputs are not
evidence of successful semantic rejection.
Selection exactly at a positive-prefix endpoint is known-prefix-supported, not
exact deepest. A deeper descendant of a fully annotated parent is overspecific;
a divergence inside one root is a wrong sibling or cousin, not safe broadening.

Report all accepted decisions below root, including unscored ones. Precision uses
only determinate cases and is accompanied by its denominator and unscored count;
it must not conceal unchecked specificity. Report raw case counts, conservative
independent-group counts, per-language and per-root counts, input availability,
useful coverage and outside false acceptance. Preserve full case/group denominators.
No population precision, 98-percent or one-percent guarantee, automatic release
flag or confidence-probability claim is permitted.

Group truth must have identical normalized kind/path across its views. Any wrong
view makes the group wrong; an unchecked view prevents all-views-safe credit.
Report any-assigned, any-wrong, any-unchecked, all-views-safe and availability
groups explicitly. Per-language group totals may overlap and are non-additive.
Outside false acceptance includes both all-gold and available-input denominators.
Zero denominators produce null rates. Useful coverage, specificity and input
availability remain distinct quantities.

Finite caps:512 taxonomy nodes, depth8,512 cases and groups,2048 declared TRAIN
group IDs plus2048 CAL IDs, identifiers160 well-formed UTF16 units and languages32.
Preflight at most65,536 path/group membership operations; bounded iterative walks,
no recursive unbounded traversal. Capacity failures are explicit contract errors.

## Following semantic work

After this assessor is reviewed, define a fresh prospective child/STOP/sibling/OOD
cohort under the actual producer. Candidate refinement is independent root ranking
followed by same-root local exemplar evidence and common-ancestor decoding, not a
second root rescue, another neural model or a catalog-wide page scan. Separate
training and target input identities explicitly; do not relabel native witnesses
as training-builder evidence. Real input collection, calibration and locked-test
execution need a later reviewed protocol. This decision grants none of them.

Root owns this decision and integration. The fixture agent owns only the three
new component files. Trust reviews semantics, bounds and uncertainty reporting
before implementation. Existing application, PostgreSQL, discussions, pairing,
model artifacts and running crawler remain unchanged.

## Checks

Root and Trust each pass all11 invented-data tests under the external-capability
guard and128MiB Node heap. A separate root-authored exhaustive209-case matrix
across nine valid paths, all three gold kinds and all prediction statuses agrees
with an independent common-prefix oracle. Its7,426 scoped work units stay below
the20,354 preflight bound and65,536 cap. These are reporting-logic tests, not
classifier runs or actual child/OOD quality evidence. Exact three-source hashes
and review bounds are saved in
`apps/local-service/data/complete-hierarchy-path-assessment-review-20261020.json`.

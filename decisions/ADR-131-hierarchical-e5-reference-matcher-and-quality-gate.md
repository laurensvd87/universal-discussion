# ADR-131: Hierarchical E5 reference matcher and frozen quality gate

Date: 2026-10-19

Status: offline implementation reviewed; first measured quality gate FAIL;
no canonical hierarchy activation or migration.

## Context and decision

The owner requests implementation of the hierarchy and its hardest front-of-plan
component: matching an existing E5 page vector to the deepest justified semantic
topic, while rejecting uncertain specialization. The implementation plan requires
evidence before persistent hierarchy integration or replacement of canonical matching.

Implement an exact deterministic multi-exemplar reference, an independent-group
development fitter and locked-split assessor. Keep these modules unwired from the
live service. Existing canonical Ridge matching and overlapping memberships remain
authoritative. This ADR does not reinterpret cosine as confidence, reuse Related's
thresholds, adopt UMAP/HDBSCAN or silently fall back to raw E5 in production.

The matcher validates an explicit acyclic taxonomy, private copied normalized
384D vectors, independent evidence groups, STOP and OUTSIDE cases, representation
hashes and exact Source/taxonomy/evidence/calibration versions. Strong children
inherit approved ancestry without a hard parent-centroid gate. Sparse nodes disable;
capacity errors are explicit errors, never evidence-based broad fallback.

Node/example/depth/vector and scoring budgets are finite. The exact scoring2million
work budget is not total compilation/validation time. The fitter's separate2million
grid-comparison cap does not include aggregate exemplar scoring across samples.
The actual small local-model experiment also has a Windows RSS/private-commit,
host-headroom and wall-time supervisor; it runs one encoder thread. These are not
unlimited catalog or host-throughput claims.

## New frozen experiment and result

Create144 independently authored synthetic inputs over11 nodes, balanced across
prototype/development/calibration/test and English/German/Dutch. No owner page,
private text, old84-text screen or closed cohort is training/tuning input. Reuse
the exact existing query-prefix bounded-body E5 encoder; compare pinned Ridge and
raw E5 explicitly in shadow. No provider request, page recapture or canonical write.

Freeze all13 input/source hashes before encoding. Prototype rows supply evidence;
development fits80 candidate rules/node and selects the representation. Calibration
assesses only; the locked test assesses the already selected representation once.
Exclusive persistent started markers precede work; exclusive outputs reject replay.

Freeze identity:
`b9765d72fd3a3f1ce6f87b03d29a3a012bdb0240ecae08a8bbadd1fb18336ff5`.

Development selected raw E5. Locked36-row test:32 assigned,31 safe on gold path,
23 exact deepest outcomes including correct outside rejection,11 safe broader
fallbacks,11/12 specific leaf decisions correct,0 observed wrong broad branches.
Leaf group95% Wilson interval .6461200889-.9851349056. Specific precision,
independent supporting count and interval lower-bound release checks fail.
Zero wrong broad branches is an observation, not a <=1% population guarantee.

Classifier p95 .8921ms for this11-node artifact, excluding compilation, encoding,
queue and database. Encoding loop plus Ridge transforms6029.2221ms after model
startup. Supervisor exit0/no violation; sampled peak RSS1059213312bytes and private
commit1229041664bytes, not absolute peak bounds. Do not claim fast whole-page
readiness, real-web quality or capacity beyond the measured bounds.

Full results, API locations and verification commands:
[experiment README](../apps/local-service/experiments/topic-encoder/hierarchical-e5-v1/README.md).

## Independent review correction without retuning the closed experiment

Review found a geometric v1 cross-root ambiguity: locally accepted descendant
leaves can bypass tied root margins and produce arbitrary primary/multiple paths.
Preserve the original frozen code/result rather than repairing its test retrospectively.

Add a separately versioned `hierarchical-e5-single-path/v2` wrapper. It checks root
descendant-union contrast before returning a single path, rejecting tied competing
branches. Child ancestry still does not require parent centroid/absolute acceptance.
V2 deliberately offers no multi-path API; independent multi-topic calibration remains
unimplemented. It is verified by fresh axis geometry, not by replaying the v1 E5
test. It has no E5 accuracy/calibration or activation claim.

Read-only verification checks public stored hashes and result/receipt linkage;
an explicit local mode checks coefficients/manifest/vector/candidate hashes too.
No model load, fitting, final-test reclassification or database access. Receipt
hashes are local integrity records, not signed attestation. Default tools are inert.

## Tests, review and disposition

53 focused checks pass with external capabilities denied:19 frozen reference,
7 fitter/assessor,12 new evaluator boundaries,8 v2 root-contrast,2 corpus integrity,
5 stored-evidence verification. These cover accessors/proxies, norm validation,
representation mismatch, mutation isolation, independent groups, exact capacity
edges, outside ties, conservative family errors and honest precision intervals.
Independent review checked frozen hashes, selection order and exclusive locks,
and identified the root limitation and budget scope above. Root integrated and
reran the focused suite. No whole-service regression or live UI hierarchy claim
follows from these offline checks.
Final independent documentation/verifier review accepts the disposition;5/5 verifier
tests pass, public11/local13 source hashes match, secret scan898files/0findings and
scoped whitespace checks are clean. No frozen inference/final classification rerun.

Do not activate this candidate. Before storage/backfill/actual assignment cutover,
predeclare the next method and a new holdout, fit/calibrate independently, obtain
adequate labels and pass quality/coverage/latency gates. The small failed screen
does not prove E5 vectors fundamentally incapable. No forced merging or threshold
relaxation is an acceptable substitute for the missing evidence.

## Separate crawler continuity event

During implementation the existing crawler43664 was found already exited, not
stopped by an agent. Its content-free fatal diagnostic reports auxiliary frontier
SQLite `SQLITE_NOMEM` (code7) after attempted6999/staged6590/ingested6599. This does
not establish PostgreSQL lock contention, disk-full cause or the original allocation
failure's cause. Its exit preceded the synthetic E5 run.

After seal verification, an idle canonical queue and no duplicate crawler check,
resume the unchanged saved-state operator as crawler26616 at20:42:52 Europe/Berlin.
No reset/rebase/policy change or arbitrary old-job replay. Durable crawler completions
advanced22818->22883; revision26503->26568; resumed terminal ingested65 and fetching
new pages. Existing API19868/worker36616/dashboard6644 start times and schema9 seal
`a1d301bc315ed497832b9aba60ecfeb79aa1b28f43678b91e6f1155c3f09909d` remain unchanged.
Keep resumed crawler running. Logs are the existing local `data/postgres-crawler-adr131-resume`
stdout/stderr pair. No hierarchy code was loaded into the checked runtime.
Final read-only seal preflight remains verified1367files/15387727bytes; PostgreSQL
available at revision26593, crawler complete22908 and terminal90ingested/newfetches,
no canonical crawler pending/leased/failed jobs, stderr empty. Contributions96 unchanged.

The owner's C: capacity question was investigated read-only; no cleanup/deletion,
pagefile setting, credential/pairing/account or owner-admin change was performed.

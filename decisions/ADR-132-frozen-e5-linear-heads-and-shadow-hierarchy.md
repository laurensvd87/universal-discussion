# ADR-132: Frozen E5 linear heads and isolated shadow hierarchy

Date: 2026-10-19. Status: offline method/storage/restriction candidate and native
mechanics verified. Quality release not accepted; not activated.

The owner explicitly asks to continue implementation and find a workable solution
after ADR131's failed first screen. Do not equate that failure with E5 being unable
to classify hierarchies; do not weaken the final quality or canonical authority gate.
Continue the next predeclared method and independently test storage mechanics while
keeping the live runtime and discussions unchanged.

## Experiment B

Train compact regularized linear membership heads on the existing384D E5 vectors.
One shared centered Gram/Cholesky factor serves all node targets; descendants label
their approved ancestors positive. Generic parents, siblings and outside examples
are negative for inappropriate child heads. The model retains affine coefficients,
scope/version hashes and identifier provenance hashes, not training texts/vectors.
Hashes are not anonymization, rights, publisher independence or canonical authority.

The fixed query-prefix representation is supported for classification features by
the [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small). Linear
kernel Ridge has an equivalent compact affine representation; see the primary
[scikit-learn guide](https://scikit-learn.org/stable/modules/kernel_ridge.html)
and [implementation](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/linear_model/_ridge.py).
Our finite native-JavaScript implementation is tested against an independent analytic
affine solution; it does not install scikit-learn or call an external classifier.

Use a fresh384-document authored synthetic corpus:128training,64development,
96calibration and96lockedtest;15nodes, English/German/Dutch. Explicit central-subject
scopes include GTA/Koalas/Kapsalon, parent stopping, unknown children, acronym and
incidental-mention confounders and missing-input cases. This is feasibility evidence,
not independent real-web release validation. No old closed cohort is retuned or replayed.

Predeclare two representations (pinned Ridge and raw E5) and four regularization
values. Development class-balanced membership squared error alone selects the
model. Independently calibrate the selected model's node thresholds and margins
on the calibration split; preserve exact model and policy bytes before final testing.
Fit/model hashes and all four splits' ID/group intersections are checked. A policy
binds the full model artifact, including representation/settings, not coefficients alone.

Whole-path acceptance handles sibling/root ambiguity, supported ancestor fallback
and outside rejection, with no nearest-leaf forcing or score-to-probability claim.
Independent multi-path classification remains outside this single-path method.
Final evaluation measures coverage, specific precision/intervals, wrong broad,
wrong sibling, over-specific and needless broad outcomes separately. Actual
end-to-end browser/queue/database latency is not classifier arithmetic timing.

One-shot persistent exclusive phase markers and outputs prevent accidental replay.
Freeze15 exact input/source hashes before inference. Compact densevector transport
fits the same8MiB reader; a pre-inference test prevents whitespace-induced overflow.
Per-training100million counted arithmetic units and a preflight aggregate128million
bound cover the eight-model search; wall/memory costs have separate supervision.
Supervision covers encoding, fitting and testing separately: one encoder thread,
1536MiB child RSS/privatecommit,1024MiB available physical/commit reserve,768MiB
C: disk reserve and180seconds wall per child. It can kill only its own child,
never API/worker/dashboard/crawler. Sampled memory is not an absolute peak guarantee.

## Isolated storage mechanics

Implement an explicitly opt-in `hierarchy_shadow` schema and adapter under
`portable/canonical-v4/experimental/`, NOT a numbered or registered migration.
Disposable in-memory PGlite tests initialize it. A native scratch rehearsal is
separately explicit and may not reuse an existing test database. No owner database, service
entrypoint, worker, client route, authority or active schema version changes.

Immutable hierarchy revisions and ancestor closure support indexed parent paths.
Caller-supplied Source mirrors are explicitly untrusted shadow witnesses, not
proof of canonical Source existence, generation, visibility or posting rights.
Monotonic witness versions reject changed-input, delete/recreate and A-B-A stale
jobs. Conditional decisions require the exact Source witness and model/policy/tree.
Existing canonical root/destination references remain distinct from semantic IDs;
parent feeds return deduplicated IDs, never copied message bodies or write rights.

The first explicit bind captures an immutable semantic revision/node. Later page
reclassification cannot move existing roots. Binding requires the prepared revision,
node and exact Source input/incarnation under the same shadow-state lock; stale
work cannot silently bind to a newly assigned topic. Each Source-root link retains
its immutable original input/incarnation proof. Forgetting that Source erases its
proof; a shared root can survive another Source link without retaining the erased
Source ID/hash in the registry. Rebinding to another semantic node/revision is
rejected; explicit reviewed historical migration remains unimplemented.

Deletion and revocation remove dependent current projections; root references are
garbage-collected when no binding remains. Historical taxonomy metadata is immutable,
not historical Source captures. Real model example revocation still requires actual
dependency tracking and retraining before any eventual canonical integration.

Scoped per-node feed versions fence pagination against root/link/erasure changes,
not unrelated crawler writes or current page reclassification. Prototype mutations use
a short shadow-state lock for correctness; this is not a production write-throughput
design or thousands-of-writes claim. Native Postgres concurrent-client/role proofs,
canonical bridge, fair worker queue, real deletion dependencies and reviewed migration
remain required before activation. PGlite mechanics alone do not establish them.

## Measured method B

Freeze `2218edc138e512cf827a0ccdfd971e58ca213f860795be027832fe3c2aed4d7e`
binds all15sources. All three supervised phases completed without a sampled budget
violation. RawE5/lambda.01 won on development only. Locked96test:90assigned/89safe,
36/36leafcorrect, **59/60 non-root decisions safe** including internal nodes,
one over-specific internal node,18safe broader fallbacks,77deepest outcomes correct.
Leaf Wilson95% lower .9036 and broad-error upper .0385 fail the release intervals;
representative real-web validation is absent. This is not a controlled improvement
comparison with ADR131's different cohort. No retuning or replay is allowed.

Classifierp95 .2984ms covers15nodes and validation only, not embedding/compilation/
queue/DB. Encoder initialization1556.6ms +384-text loop14649.9ms; supervised child
31.31s. Eight fits charged37,802,352 arithmetic units. Sampled encoding RSS
1,029,402,624/privatecommit1,093,963,776bytes; not an absolute peak guarantee.
See [README/results/receipt](../apps/local-service/experiments/topic-encoder/hierarchical-e5-linear-v1/README.md).
Public13/local15stored-source hash verification and metric arithmetic do not rerun
classification or provide independent accuracy evidence.

## Input diagnostic and actual limitation

Read-only keyword-selected browser Sources yielded3existingbodyvectors, not a
sample of the entire crawler catalog. “kapsalon barbecue - YouTube” predicted
Video games (wrong root), KIP KAPSALON video Cooking, Leuke Recepten recipe Kapsalon.
Captured body text was not inspected: missing/noisy input is a hypothesis, not a
proven extractor failure. No assignments or stored embeddings were changed.

A separate supervised retained-title-only transfer probe exited0 safely, but its
child stdout did not reach the tool. Its outcomes remain unobserved; original
marker/history is preserved. A deliberately versioned V2 repeat over the same
three public titles saved bounded metadata and observed Kapsalon for all three
title-only predictions versus Video games/Cooking/Kapsalon body predictions.
Unchanged exact B artifacts, no retuning/reclassification of its locked cohort;
these repeated cases are not independent new quality evidence. V2 sampled
RSS913,362,944/privatecommit943,177,728bytes/32.922s; resource metadata in README.
Transfer is still uncalibrated, not a successful live repair.

A separately versioned consensus restriction is implemented: both views assigned
on the same Source/version/representation, return their deepest common ancestor,
or abstain when unresolved/different roots. The output must be a prefix of the
original body path, never a title-driven promotion to a child or another branch.
Ten fresh geometric tests include all36axis pairs; no E5/locked cohort evaluation.
This can prevent a conflicting title from reinforcing a wrong body branch, but
cannot claim higher precision, calibrated agreement or repaired capture. Its own
guard/policy publication hash is tested through shadow storage, not reused as the
base classifier policy. No production activation follows.

Next matching method needs a versioned paired-input contract, explicit
missing/conflicting/clickbait title cases, fresh groups and separate calibration;
do not silently replace body vectors or turn a title match into posting authority.

## Storage checks and live boundary

38new matcher/corpus/assessment/packet checks,6stored-verifier checks,10restriction
checks,14isolated storage checks,2native-default/diagnostic checks and5actual
classifier-to-shadow integration checks pass. Independent Trust accepts strict
binding/erasure/feed mechanics; these still grant no canonical/native authority.
Native rehearsal first created a random scratch DB, was refused by existing HBA
on connection (28000), then removed its own exact instance. A second attempt using
the already-allowed reserved name refused because it exists; nothing was reused
or dropped. HBA/roles remain unchanged.

A separate private PostgreSQL17.11 process then ran the native proof successfully.
Fresh checked D: directory, RAM-only test password, unique127-only port, low configured
memory and strict SQL/PID/start-time ownership precede any synthetic DDL. No existing
cluster connection is used in this mode. PostgreSQL17 does not treat `--pwfile=-`
as stdin ([source](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/bin/initdb/initdb.c));
an initial attempt failed before data initialization and was retained as evidence.
Correct bootstrap uses localreject/hostSCRAM and strictly offline single-user
password SQL over a private pipe, with explicit SCRAM and exit-on-error before TCP
startup ([single-user documentation](https://www.postgresql.org/docs/17/app-postgres.html)).
No trust listener, plaintext credential file or existing account/config change.

Actual native result: exact writer observed blocked, coherent parent reader19.55ms
while it remained blocked, writer accepted after rollback release; incarnation,
prepared-binding, feed/publication race, stable historical roots and revocation
proofs pass. Whole helper14.523s; testpostmaster34496/port55248 smart-stopped after
pool closure, separately confirmed absent/PIDfilegone. Generated test data is
retained on D: in the ignored owned run. See [receipt](../apps/local-service/portable/canonical-v4/experimental/hierarchy-shadow/native-execution-receipt.json).
This proves synthetic native mechanics, not actual app latency, canonical bridge,
least-privilege role integration or production write scalability. Resource check
is preflight physical/C/D headroom plus low PG settings, not continuous E5-style
RSS/commit monitoring or an absolute process cap.

After explicit owner approval, only regenerable Windows Update Download cache
children were removed, all descendant paths checked including reparse/long paths,
servicing checked and originally running update services restored. Actual recovered
space5,361,537,024bytes, freeafter5,868,142,592bytes. The recent preceding disk loss
was explained by pagefile growth2692->3476MiB, not new update downloads. No pagefile
settings, personal files, Installer cache, credentials or project data changed.

Live schema9/seal `a1d301bc315ed497832b9aba60ecfeb79aa1b28f43678b91e6f1155c3f09909d`
and service processes are unchanged. Crawler26616 continues. No provider/post/
account/admin action. Canonical bridge/backfill/cutover, fair worker lifecycle,
representative quality and actual hierarchy UI remain unfinished, not activated.

Finallive status revision26978/crawlercomplete23283/contributions96; no pending,
leased or failed crawlerjob at that snapshot, then465ingested/newfetches in terminal.
API19868/worker36616/dashboard6644/crawler26616 retain start times; Cfree5,824,008,192B.
An optional100-request unauthenticated health wave returned401 throughout, not200
or an app-read load pass. Auto-review denied the proposed authenticatedwave because
it would read the pairing-recovery credential. No token was read and no alternate
credential path tried; explicit owner permission would be needed for that optional
check. No auth rules were relaxed. Owner-role status connections stay unverifiable.

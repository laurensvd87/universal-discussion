# ADR-226: Private full-data PostgreSQL restore rehearsal

Date: 2026-10-27

Status: Source design accepted by Lead, Platform, Maintained and independent
review. Bounded source implementation authorized below. No actual-run grant.

## Purpose and fixed input

Restore the complete authenticated production backup, verify the stored data and
database boundaries, and prove normal retirement before considering live cutover.
Use the already created779151859-byte dump and its protected owner receipt;
neither a smaller dataset nor synthetic rows substitute for this rehearsal.
The receipt pins19 table fingerprints at canonical revision56880 and schema9.
The observed live database occupies1837659827 bytes. Archive authentication has
passed; restored SQL correctness has not.

The fixed archive, receipt, header and plaintext dump hashes are separate data
inputs. Authenticate and hold the archive read-only until the original child
and all database work have retired; verify closure before accepted publication;
keep its779MB outside the320MiB code catalog. No selectable filename, host,
database, command, connection URL or credential enters through a client request.
The private entry binds the already reviewed fixed receipt and archive hashes.

Fixed receipt: `apps/local-service/data/postgres-hierarchy-backup-receipt-20261027.json`,
SHA256 `7783f57371f1284c39892bcafae89b22c1976e4136897cecca65d4a6a211933e`.
Fixed archive leaf: `postgres-canonical-2026-10-27T05-31-32-647Z-62729438-e09b-428d-b39e-9bdbe7f40677.murmingle-pgbackup`;
encrypted SHA256 `e8026bc09c4ad53049d44bb5870cc28928ea0427ebd0d14a647a8bb1128ad831`.
Header SHA256 `7104647562484ed211de0c105991751e4b46cd90fa3d470d3ff606f68e26cbb3`;
dump SHA256 `e8fce39659962bb4c8d5ee2087a606406141df3c54f2154742809501fec8ae9e`.

## Maintained lifecycle, private scope

Extend the existing maintained driver, run binding and cluster lifecycle with
one closed `private-restore` mode and one fixed entry. Preserve the default
semantic mode, its ledger, paths and limits. Do not copy a controller or create
another experiment version. Private run/control/PG files live under a fresh
nonce directory beneath the protected backup directory. Verify effective ACLs
allow only the current owner and SYSTEM before creating PG files or credentials.
Do not change the existing production backup protection helper or either live
operator/seal. Add a narrowly scoped read-only private-storage verifier instead.
The fixed private run root is
`apps/local-service/data/canonical-migration-backups/hierarchy-private-restore-runs`.

The current cluster already rejects local trust authentication and generates
offline SCRAM credentials for its fixed roles; preserve that implementation.
It also already creates `murmingle_owner NOLOGIN`. Restore as the private
postgres connector, retaining archive ownership and ACLs; an owner login or a
new production credential is unnecessary. Do not pass `--no-owner`/`--no-acl`
to pg_restore. The archive's ownership metadata is retained by custom pg_dump
despite its original `--no-owner` argument.

Use the unchanged fixed A/B database names and existing fixture controller.
Restore the full data only into fresh A. Verify its OID/server epoch and empty
canonical schema, then drop only that verified empty schema before restore.
Existing vector0.8.2 remains. Close/drop A normally, then acquire/retire empty B
to preserve the controller's two-database isolation/retirement contract without
a second full data copy. No worker, crawler, HTTP service or provider starts.

The closed no-options lifecycle export is `runWithPrivateOwnedScopedPostgres`.
Its trusted callback receives `{connectFixedRole,restoreArchive,deadline,checkDeadline}`; credentials
remain private to the cluster. `restoreArchive` accepts only an original issued
postgres target client, its exact fresh A/OID/server identity, the authenticated
dump iterator/hash/length and original deadline. It rechecks ownership and empty
target, uses fixed pg_restore executable/arguments and the private SCRAM secret,
is one-shot, and clamps all work to the original cluster callback deadline.
It exposes no password getter, command arguments, host or path override.
The private port clamps inspect/restore/verification acceptance to that original
deadline, with checks before and after archive authentication and each database
verification await. The unchanged production backup helper has an opaque
authentication pass with its own330/360s lifetime; the195s callback timer does
not prove cancellation of that pass. The outer owned callback still observes
its original promise if authentication or a filesystem operation outlives a timer;
unknown work cannot authorize smart-stop or successful retirement. Reserve the
one pg_restore backend within the existing eight lifetime non-bootstrap clients.

## Bounds

The private data disk limit is6GiB, based on twice the measured1.84GB database,
1GiB of WAL and initialization margin. Require11GiB free on D before admission:
6GiB tree allowance +1GiB margin +the unchanged4GiB floor. Sample the tree and
original free-space floors throughout; this is not a disk quota. The synthetic
mode retains its512MiB tree bound. Retain Job1GiB, Node64MiB old space,
process32, CPU60s and the original startup/callback/360-380-390s deadlines.
No automatic retry, adoption, budget increase or production/HBA/host change.
An insufficient measured limit is a failed attempt, not permission to change it.

## Data and execution checks

Authenticate the complete archive before restoring. Run pg_restore serially with
`--exit-on-error` and one transaction, targeting only verified-empty A. No jobs,
clean/create, ownership/ACL suppression or list/schema/table filters are allowed.
Feed pg_restore in bounded
chunks and retain each plaintext buffer until its write callback settles,
including when write returns true. End stdin only after complete authenticated
consumption. Require the original child close and both output EOFs. Retain
finite codes/counts/hashes only; never serialize SQL errors, plaintext, URLs,
row contents, credentials or wrapped keys into reports.

Compare all19 snapshot fingerprints using the same ordered rows, JSONB and
binary64 array-send algorithm with UTC, ISO-YMD and extra_float_digits3.
Root's read-only source observation found database LC_COLLATE/LC_CTYPE
`German_Germany.1252` and every text primary-key column explicitly collated C.
Use that fixed locale for private initdb/database defaults, and verify restored
primary-key collations before fingerprinting. Preserve the receipt's ordering
algorithm; do not silently add COLLATE or reinterpret saved hashes.
Independently check the exact nine migration hashes, vector/server versions,
ownership/function security/search paths and app/worker/submitter grant boundaries.
Check generated import-ledger identity and the fixed owned ordinal sequences
using last_value/is_called/increment and the corresponding maximum stored key,
without nextval/setval. Fingerprinted runtime-state ordinal counters remain exact
row data and are verified separately. Do not claim
exact backup-time sequence values, since sequences are not MVCC snapshot data
and the receipt did not fingerprint them. Future16/17 archives must not silently
omit semantic tables; the first private entry is bound to this schema9 archive.

Use three explicitly named private outer groups and22 real child checks
(19 table checks plus schema, grants and sequences), satisfying the inherited
25/3 completion transport without borrowing semantic test names. Archive, fresh
identity, complete consumption and normal cleanup are additional mandatory
conditions. Private lifecycle/proof reports state owner data and
`syntheticOnly:false`; they never claim synthetic-only execution or live activation.

Source ownership authorized: Root driver/test/catalog/proposal; Platform run-binding
and cluster/test plus private-storage verifier/test; Maintained private entry/test.
Whole source, code/data bindings, fresh resources and a separate one-attempt Root
decision are required before actual restore execution.

## Implemented source checkpoint

Implementation is committed and pushed as `ceea2c7a`. Root's final focused checks
passed32 pure Python tests and51 guarded64MiB Node tests (including16 unchanged
backup-contract checks). Independent review accepted the private entry, platform
slice and driver after two failure-path fixes: preserve the first input error
when closing also fails, and retain failed-attempt publication when final close
fails. A startup ACL ordering defect was fixed before execution as well.

The current code catalog is372203 bytes,2433 files/274969808 bytes,
SHA256 `5ace16491828d4598c6a829fcf43acf2ffd35c54cd1e5a8c1b738caf8ddd7594`.
Root authenticated its complete inventory and end pins;193 tracked catalog blobs
and the catalog itself match raw committed Git bytes. Encrypted data inputs are
outside this code budget. Independent final catalog binding review passed before
the first actual attempt.
These are source checks, not proof of an actual restored row or live readiness.

## First actual attempt and narrow follow-up

The separately decided attempt (session20367) closed exit1. Run
`run-475eb273bd4de7d0c1b063bcd9944e5044474f7be8be6679` retains the consumed
catalog, marker/claim and outputs; Git commit `ceea2c7a` retains its source.
The child failed before authentication, with zero row checks. Scratch A16384 was
dropped and PostgreSQL3908 smart-stopped normally; the parent verified empty Job,
closed handles, both EOFs and end pins without emergency retirement. Independent
saved-failure audit SHA256
`bc34582ffcbe16ffefd138f3af51b945e0e128213070d5bd019338ded5bca148`
was fully read and authenticated by Root. This is a failed restore.

Saved output retains only a generic failure. A separate guarded probe reproduced
the production restore helper refusing before its trusted port when LOCALAPPDATA
is missing. Source shows eager protected-password-provider construction even on
the restore path, and the isolated launch omits that metadata variable.

Root authorizes a narrow follow-up SOURCE change: include only the fixed
`LOCALAPPDATA=C:\Users\Laurens\AppData\Local` in the private launch environment,
preserving the default seven-variable environment and all resource limits.
Extend the launch regression and regenerate/review the ordinary code catalog.
Do not modify either production helper/operator or expose password values.
No second actual attempt is authorized by this source correction; a fresh review,
resource check and separate one-attempt decision are still required.

## Full-data resource policy after the corrected attempt

The corrected attempt (session9953) closed exit1 at sampled cumulative Job CPU
60.015625 seconds. Its run is
`run-2a5d7e4541290b2bccac9edd86498e1a35f722e3e2465640`; original source is retained
by Git `1677abb0`, and its catalog/output remain unchanged. Parent retirement was
owned emergency, with empty Job/closed handles/both EOFs/end pins verified. There
is no child lifecycle report or assertion ledger, so authentication, restore phase
and normal PostgreSQL/database retirement are unknown. Root fully read and
authenticated independent failure audit SHA256
`c21a09d762d495070f5f1260b77bde3cd0226facdd6779a9aff84e3b213814ee`.
Offline A-directory metadata shows679188147 bytes; this does not prove phase or
completion. D free11657945088 bytes currently fails11GiB admission.

Lead, Platform, Maintained and independent reviewers accepted the following
purpose-based full-data SOURCE policy, not a prediction of success:

- Private Job CPU ceiling300 cumulative seconds; default60 unchanged. Adapt only
  the maintained private `job()` method's60 literal, with exact inverse proof;
  preserve truthful accounting, peak/process/monotonic checks and every floor.
- Private callback cutoff `min(now+300000, originalOverall-20000-25000)`;
  default195000 unchanged. Preserve startup120/overall360/380/390, Job1GiB,
  Node64MiB, process32, private tree6GiB and all free-space limits.
- Add private durable checkpoints under the verified output directory, with a
  closed ordered stage vocabulary, ordinal and original elapsed time only.
  Prefer at most40 exclusive pending/closed-hardlink records of at most1024 bytes;
  completed record publication follows original work and deadline checks. Keep
  within existing128-entry/512KiB output limits. Started stages and last completed
  checkpoints are lower-bound observations, not completion authority.
- Separately prepare a fixed-path retirement of only the failed run's
  `cluster/nhpg-EDfH2R/pgdata`, after marker/catalog/claim/owned-emergency joins,
  successful exact PID and55433 absence, ACL/containment and all-entry reparse and
  hardlink checks. Preserve ownership, PID metadata, file-count/size/hash inventory
  and finite retirement receipt outside pgdata before removal. Never start/adopt
  the retained cluster or touch archive, live data, maps, claims or output files.

Bounded SOURCE grant: Platform owns maintained cluster/test deadline changes and
the fixed one-off retirement script/test (delegated by Lead after cluster HOLD);
Maintained owns private entry/test checkpoint changes; Lead owns driver/test
private CPU adaptation and catalog.
Pure tests and review only. Retirement and a further full restore each require
separate explicit Lead decisions after source review and fresh observations.
No automatic budget increase or further retry follows a failed future attempt;
use the retained checkpoints to decide the next action.

Follow-up source is independently accepted:37 pure Python,43 guarded Node and10
managed-fake PowerShell checks pass. The33-stage JavaScript/Python grammar joins
exactly. Retirement script SHA256
`d0d39818d19208b549b65335d310b752d8c64eae27f709de87a7ebf0f557f08d`
binds only the audited failed pgdata, preserves all original artifacts, and writes
new evidence to a separate protected retirement directory. Root authenticated
the current catalog:372559 bytes/2435 files/275023616 bytes, SHA256
`9a6b7637dcc67f2a9c95066d2be84350555901cd1138e8c3e8cf54da6b85e223`.
This source acceptance authorizes neither actual retirement nor another restore.

## Full-data attempt: verifier configuration correction

The separately authorized full-data attempt28329 used run
`run-433e31e7913464156627959abb43de02fa876fc74a08b469`. Authentication and complete
restore-stream retirement passed; schema9 identities/versions/text-PK collations
passed the first child check. The function-security check then refused before
any table fingerprints. PostgreSQL10872 smart-stopped and A16384 was dropped;
parent normal retirement, empty Job, handles, EOFs and end pins passed. Nine
closed phase records end at schema-verified107936 callback-relative milliseconds.
The119834ms lifecycle is a one-off recovery rehearsal, not application latency.
Root fully read/authenticated independent saved-failure audit SHA256
`597e79b4d5299b04bcaa51770ace423b9b4d864964467ef0405a2f52efbf612e`.

A separate bounded read-only live pg_catalog observation returned37 functions.
`ingest_json_number` has both `search_path=pg_catalog` and `extra_float_digits=3`,
exactly as the fixed004 migration declares. The verifier and its fake fixture
incorrectly expected only search_path for that function. Saved failed output
does not identify the exact row, so this observation and source defect remain
distinct from a retained exact-cause witness.

Narrow SOURCE grant: Maintained updates only the private entry/test to require
the exact two settings for ingest_json_number, retaining exact configuration for
every other function and all ownership/definer/PUBLIC/role-grant checks. Add
positive and missing/wrong-setting regression cases. Optional failure diagnostics
may name only the existing closed function-name and field enums, never SQL/error
text or user data. No DDL, production permissions, resource limits, old output,
or checkpoint grammar changes. Fresh source/catalog review and a separate
one-attempt decision are required before another full-data rehearsal.

## Actual acceptance

The separately decided corrected run79937 closed exit0. Run
`run-99a8da6bcdb0ca78105a789df77f42f471e4d2b620fc97ec` at source `004f3b3e`
completed all25 ordered ledger records, including all19 genuine restored-table
fingerprints, schema/collations, function/role security and sequence safety.
All33 closed phase records completed; A16384/B264394 dropped, PostgreSQL37840
smart-stopped, and parent normal/empty Job/handles/EOFs/end pins passed without
emergency retirement. No data or permission discrepancy remained.

Root fully read/authenticated independent actual audit SHA256
`0fa1694bc822b02ed071d4d27c124a105e74444b800de34c519fa4e9da029b8e`.
This accepts the fixed schema9 snapshot within the stated checks. It does not
establish combined application/provider/UI/load readiness or arbitrary future
recoverability. The173677ms lifecycle is not page latency. No further actual
restore, new fixture mode, live migration or activation is granted here.

Source grant (2026-10-27): implement only the maintained driver/test and catalog,
maintained run-binding/cluster and their tests, new private-owner-storage helper
and test, and new owner-restore-native-check entry and test. Reviews resolved
the original deadline, source collation, private credential bridge, serial restore
and sequence-safety requirements above. Pure tests and source review are allowed.
No restore, native child, new database, production mutation or host change is
authorized by this source grant. A separate Lead one-attempt decision follows
whole-source review, fixed data/code binding and fresh resource checks.

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

Source grant (2026-10-27): implement only the maintained driver/test and catalog,
maintained run-binding/cluster and their tests, new private-owner-storage helper
and test, and new owner-restore-native-check entry and test. Reviews resolved
the original deadline, source collation, private credential bridge, serial restore
and sequence-safety requirements above. Pure tests and source review are allowed.
No restore, native child, new database, production mutation or host change is
authorized by this source grant. A separate Lead one-attempt decision follows
whole-source review, fixed data/code binding and fresh resource checks.

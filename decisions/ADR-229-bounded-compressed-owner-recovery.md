# ADR-229: Separate compressed owner recovery rehearsal

Date: 2026-10-30

Status: implementation source accepted by Root; fresh whole-catalog readiness and a separate actual execution decision remain required.

The current full17-to18 rehearsal uses a fixed29October archive and preserves all27
legacy tables while verifying28 restored tables, migration18, generated sequences,
SQL ownership/execute-only roles, normal18 HTTP and real Chrome UI. Its existing
uncompressed D: purpose requires11GiB free, including6GiB logical cluster capacity,
margin and4GiB reserve. Only about4GiB is currently available on D:. Old purposes,
catalogs, source files, assertions, limits and actual outputs remain immutable.

Source review also found a separate real blocker: the fixed17 archive contains a
1,354,423,835-byte dump, but both `hierarchy-native-cluster.js` restore admission and
its external process pump allow at most1,073,741,824 bytes. The pure causal test in
`compressed-owner-recovery-v1/archive-capacity-causal.test.js` must reproduce refusal
before child creation/stream reading. Existing fake full-owner tests do not execute
these real admission boundaries. More free space alone would not fix that mismatch.

## New purpose and retained evidence

Create a separate `compressed-owner-recovery-v1` implementation and catalog. Reuse
the protected native lifecycle, immutable native binaries and the same authenticated
fixed17 archive, real SQL assertions and browser checks. Mechanical copies must
retarget only the selected dependency graph; untouched dependencies stay pinned.
No loader that secretly rewrites evaluated old code, junction/reparse bypass, old
catalog adoption or reduced/full-data substitute is acceptable.

The new explicit purpose uses only freshly owned storage below
`C:\Users\Laurens\AppData\Local\MurmingleRecovery\compressed-automatic18-v1`.
It leaves the live PostgreSQL data, original backup, local-state files and crawler
on D:. The parent/run/output/cluster ACL remains exactly the existing owner+SYSTEM
full-control policy. Source bindings, nonce, PID/SQL-start-domain separation, real
OID/server checks, one-run claims, closed publication, smart owned-only shutdown,
unknown-acquisition barriers, bounded pipes and emergency classification remain.

Before any PostgreSQL write, verify local C: is NTFS with supported compression and
cluster size at most4096 bytes. Set LZNT1 on only the new empty owned directory,
read back its compression state and verify inheritance with a small fresh public
probe. Never compress an existing user/application/database directory for this test.

The retained6GiB **logical** cluster cap is supplemented by a4GiB **allocated**
cluster cap and128MiB non-cluster run budget. Admission requires at least6.125GiB
free C: (4GiB cluster+128MiB run+original2GiB C reserve), while original D:4GiB,
physical1GiB and caller-available commit1GiB floors remain. Keep64MiB Node old-space,
1GiB Job memory,32 Job processes,8 physical database clients and original deadlines.
Sample actual allocation separately from logical length; report that sampled
checks are not a kernel directory quota. Fail closed and retire only the owned run
if either storage budget/floor is violated. Success is not assumed from compression
ratios, file attributes or a small probe.

For the new purpose only, permit the exact fixed dump byte count **and SHA256**
`b5b71ee2bdf8b1b0e5b0b004915ca26df5a18360311f85a3ec988002103c0019`.
The older generic1GiB contracts and tests stay unchanged. Do not admit arbitrary
larger dumps. Stream with the existing chunk/backpressure/hash/magic/EOF/exit and
bounded drain checks; do not buffer or materialize another complete dump.

## Required gates

1. Root source/dependency-copy review, exact inverse where only paths change;
   causal admission fix tests and old native/owner/browser assertions retained.
2. Pure tests for C path/ACL/reparse limits, compression/readback, logical versus
   allocated accounting, unchanged generic dump rejection, exact17 admission and
   mismatched byte/hash rejection. No synthetic test confers native authority.
3. Separate small owned C: compression/native-storage proof with bounded public
   content, no private archive/live SQL. Verify transparent bytes, allocation,
   inherited compression and original reserve; retire only its verified own files.
4. Fresh whole catalog/binary/input/volume/resource review and a separate ONE actual
   full-data decision. No old entry is invoked and no result adopted.
5. Actual complete fixed-archive authentication, full restore,28-table/schema18 and
   all27-table fingerprint preservation, normal18 HTTP/browser, role and sequence
   checks, original input/end pins and settled owned cleanup. Missing or failed
   evidence remains failure; no quality/live-cutover acceptance follows automatically.

The filesystem design is based on Microsoft's
[directory compression semantics](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ni-winioctl-fsctl_set_compression),
[cluster-size restriction](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fsa/8e2a2e1e-5a90-4251-8b4d-18f1a4c0be43)
and [allocated-size API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getcompressedfilesizew).
These documents do not prove PostgreSQL compatibility, runtime performance or that
the private data fits. Those require the actual new owned tests. PostgreSQL's
[cluster guidance](https://www.postgresql.org/docs/17/creating-cluster.html) supports
an isolated initialized data directory with protected permissions; live storage,
host services, HBA, pagefile, update settings and existing application roots remain
unchanged.

## Actual bounded filesystem evidence, 30 October

The first probe stopped before creating any directory: PowerShell5.1 does not
resolve `[ulong]`. An exact read-only function reproduction identifies that cast;
it is not an NTFS/PostgreSQL failure. Its source and failed output remain fixed.
The separate v2 source changes only that cast to `[uint64]` and the versioned
output/root/schema identities; the exact inverse was checked.

The one actual v2 probe exits0. Two public synthetic1MiB files inherit LZNT1 and
survive page writes, overwrite, durable flush and same-handle hash readback.
The mostly-zero file allocates12,288 bytes; the random file1,048,576 bytes.
All three newly created directories are removed and the C parent is absent on
independent readback. Original resource floors pass. Saved resulta465153b...04d11
and Root audit376dc5ff...2a17d retain the measurements. No archive or database is
opened. This establishes bounded filesystem behavior only: actual PostgreSQL
compatibility, full-data fit, recovery and browser validation remain unproven.

## Source integration checkpoint

Root reviewed28 selected files totaling602,120 bytes. All14 original copy inputs
remain unchanged. The new purpose retains the complete original logical/identity
cluster check byte-for-byte and adds a required allocation wrapper. A regression
binds the real OwnedRun constructor to that wrapper. The parent also measures
noncluster allocation and records bounded observations through controller retirement;
original publication checkpoints continue enforcing resource/workspace checks.
The97-to98-test progression includes one explicit fixed-CLI dispatch regression.
Final results:95 Node tests pass with64MiB old-space (355.44ms),98 Python tests
pass (3.595s), including the80 inherited driver checks. These are pure/fake-port
checks, not98 SQL or semantic-quality cases. Both PowerShell scripts parse and
compile their C# bindings without invoking those bindings.

One separate read-only native readiness probe observes the already pinned public
Chrome executable through the new Windows allocation API. It confirms52/16-byte
ABI structures, NTFS4096 support, logical and reported allocated size4,525,720,
format0 and the original handle closed. The module remains held at SHA436e03c3
...242d4. This exercises no private/archive content, C writes, process or SQL.
Root source receipt7a781310...cbfb9 is a single review, not an independent review.

Source-ready flags enable only the explicit complete browser purpose after exact
catalog authentication; they do not authorize an actual run by themselves. No
new C database, private restore or actual browser execution has occurred yet.
A fresh source/runtime catalog, input/end pins, resource/volume/port readiness
and a separate Root ONE actual decision are required before the two fixed private
parent directories are prepared and the protected full rehearsal starts.

## First full actual attempt: closed failure, retained evidence

The fresh2704-file catalog authenticates279,829,030 bytes with all seven runtime
pins; its417,800-byte file hashes4bdee38c...7de2e. The complete encrypted archive,
receipt and fixed Chrome executable pass held-input start/end verification before
the separate Root ONE actual decision. Source4a045a36 is committed/pushed first.
The protected C parents are prepared without changing existing ACLs.

Actual26495 exits1. Owned PostgreSQL startup and complete archive authentication
reach restore-dispatched, but the parent selects aggregate Job CPU300.046875,
above the original300-second limit. The Job is retired by owned emergency with
all parent handles closed, empty Job and both EOFs; source/runtime end pins pass.
Node output is empty and no normal child lifecycle/owner completion exists.
This proves neither normal SQL smart-stop nor full restoration, migration,
HTTP/browser behavior or semantic quality. All consumed source/map/output are
immutable. Root audit9f84bf62...9cf1b independently rechecks all2704 end pins.

A separate fixed-path disposition verifies the exact stale PID/ownership/result
pins, complete process/listener/reference absence and every file's ACL/hash twice.
Only failed PGDATA is removed:1,556,436,787 logical bytes across1366 files. All
original controls/output, the source catalog, original encrypted backup and live
services remain. Disposition audit92d3cf34...08e32 records that emergency retirement
is not a normal SQL-stop or recovery-success claim. The initial read-only disposal
helper lacked its native binding block after generation; it performed no deletion.
A separate corrected helper and20 pure guards plus compilation/read-only audit
passed before the one actual disposition.

The actual CPU source and user/kernel split were not retained. Do not infer that
compression caused the failure from elapsed time or that64MiB retained WAL measures
WAL work. ADR230 proposes a separately reviewed bulk-load candidate with the same
full data, assertions, durability and original budgets. It is not an automatic
retry, a budget increase, a smaller dataset or live activation.

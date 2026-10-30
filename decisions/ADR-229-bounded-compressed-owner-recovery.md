# ADR-229: Separate compressed owner recovery rehearsal

Date: 2026-10-30

Status: source design under Root review; no native, archive restore or C: write authorized by this document alone.

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

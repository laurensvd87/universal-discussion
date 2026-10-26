# Bounded canonical hierarchy fixture

This adapter is intended to validate canonical source ingestion, historical topic
membership and ancestor discussion feeds in a fresh in-memory database. It keeps
the database test separate from Murmingle, PostgreSQL, the dashboard and the crawler.
It does not measure semantic matching quality or authorize live activation.

## Implementation status

`windows.py` supplies the fixed child boundary, `report.py` validates the exact
25-point Node TAP tree, and `supervise.py` composes their lifecycle, resource checks,
catalog authentication and exclusive output publication. Its CLI accepts exactly
one lowercase SHA256 for the fixed catalog file, not executable, path or phase
selectors. Imports are inert. The83 pure tests use a fake Windows API, invented TAP
and temporary files; they do not run the SQL assertions.

The full-source, dependency catalog and final pins require independent review
before actual execution. The source grant is recorded in
`apps/local-service/data/native-hierarchy-fixture-bounded-v3-source-grant-20261026.json`.
A separate Root execution decision with fresh resource readings must precede any
actual child launch. No source test, environment variable or green parser result
substitutes for that decision.

This successor preserves the file-URL correction and changes the separately
reviewed test budget to1GiB, with startup admission2144MiB. Its predecessor passed
the first no-database point, then refused a reported historical Job peak above
its512MiB threshold; no SQL point completed. That attempt and its inputs remain
immutable. The peak does not establish an allocation cause, current host commit
or production memory requirement. New budget tests retain strict peak refusal
and the original memory/disk floors; no automatic escalation ladder is present.

## Catalog authentication

The fixed catalog covers544 entries:53 local JavaScript files,11 executed SQL
assets,456 installed package files from16 literal roots, seven harness files,
three package-scope manifests, eight additional source and baseline files, and
six fixed executable/runtime binaries. The456 package path names must match an
independent ordinal-list hash before any package bodies are followed. Twenty-nine
absent intervening package scopes and absent shadow dependency directories are
checked before launch and at the end. Dormant admin-bootstrap SQL is not executed
by this fixture.

The catalog FILE hash is checked before JSON parsing. Canonical bytes, closed
records, exact keys, bounded lengths, file identities and every content hash must
match. Source modules are compiled directly from authenticated bounded bytes;
preexisting Python bytecode caches are not loaded. The immutable baseline map is
bounded to its authenticated size, at most8KiB, and its four historical source
pins must also match. These are sampled pathname checks, not an atomic filesystem
sandbox; Python and operating-system libraries remain trusted runtime components.

On Windows, cross-API identity comparisons use device, file ID, size, modification
time and birthtime. The deprecated `ctime` is still checked for stability within
each API's before/after pair, not compared between path and handle APIs. This
avoids the reproduced same-file discrepancy described in the
[CPython issue](https://github.com/python/cpython/issues/157671) and follows
[Python's Windows timestamp documentation](https://docs.python.org/3.12/library/os.html#os.stat_result.st_birthtime_ns).

## Fixed execution boundary

The intended child is the pinned local Node executable, with 64 MiB old-space,
the external-capability guard, no test-process isolation, concurrency one and TAP
output. Its only test entry is the held canonical hierarchy fixture. It receives
five fixed environment entries, including the disposable SQL-fixture enable value;
it receives no database credentials, inherited Node options or arbitrary arguments.

A new Windows Job has an aggregate committed-memory limit of 1024 MiB, one active
process and kill-on-close. The child is created suspended with only three inherited
stdio handles. Assignment, complete membership and exact limit readback precede
resume. The parent remains outside the Job. Node old-space is not total memory,
and the Job's historical memory peak is not current host commit use. PGlite's
existing memory defaults remain unchanged; exceeding the Job limit must fail the
attempt, not trigger a larger limit, retry or unbounded fallback.

Startup requires at least2144MiB available physical memory and caller-available
commit. Work and normal drain retain floors of 1024 MiB for both, 2048 MiB free
on C and 4096 MiB on D. These sampled thresholds are not reservations. Cumulative
sampled Job CPU may not exceed60 seconds. The startup sum is the original1024MiB
floor plus1024MiB Job budget plus96MiB parent allowance; none is a reservation.

## Deadlines and completion

One original epoch starts before authentication or setup. The original process
must be observed exited before 120 seconds. Normal drain and final checks get at
most 20 seconds from observed exit, never beyond the original 140-second epoch.
Failure cleanup gets at most 20 seconds from failure, bounded by any existing
normal deadline and the original 140-second epoch. One emergency physical drain
may continue only to that fixed cleanup deadline plus ten seconds, never beyond
150 seconds. A delayed observation cannot renew either allowance.

Both pipes are serviced fairly through nonblocking availability checks and reads
of at most 4096 bytes. Captures are bounded to 256 KiB stdout and 64 KiB stderr.
Exit alone is not EOF. Success requires the original exit code zero, both physical
EOFs, the exact complete TAP inventory with no skips or failures, complete empty
Job verification, all original handles closed, unchanged end-pins and no emergency.
Publication enforces a64KiB result limit and512KiB total logical output. The fixed
fresh output directory is never adopted, overwritten or reset. Pending result
bytes and their exclusive hard-linked final name remain evidence if a late check
fails; a linked accepted field alone is not success. The outer invocation must
also exit zero after its final deadline, resource and output checks.

Results retain finite failure metadata and opaque output hashes and counts, not raw
stderr, discussion data, environment values or process IDs. Failure cleanup keeps
the first failure separate from cleanup faults. An unverified empty Job is never
called normal cleanup merely because explicit termination was unnecessary; closing
a kill-on-close Job can itself terminate residual members.

## Pure tests

From this directory, using the local Python interpreter:

```powershell
python -B -m unittest supervise_test windows_test report_test -v
```

These tests cover joined ownership transitions, original deadlines, host admission,
sampled CPU and memory bounds, fair pipe service, overflow, failure preservation,
strict completion and cleanup. They establish controller behavior against fakes,
catalog and publication behavior against invented/temporary files, not Windows
kernel enforcement, database correctness or production performance. Tests that
need temporary-file access may require the ordinary host test environment if the
restricted agent sandbox denies access to newly created directories; do not
weaken directory permissions or invoke the actual fixture to work around that.

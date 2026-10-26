# ADR221 Isolated native canonical hierarchy fixture

Date:2026-10-26. Status: source checkpoint and supervisor source design accepted.
No actual execution is authorized by this decision.

The complete wrapper source is now implemented. Root's joined pure runs passed92
Python and76 guarded64MiB Node reports with no failures or skips. Independent
review closed bootstrap-epoch, bounded marker/hash-join, strict JSON types and
projection-hook findings. Full catalog and final-pin acceptance still precede
any separate execution decision.

## Use native PostgreSQL for the canonical SQL checks

ADR220 adds protected canonical source admission, historical discussion bindings
and hierarchical ancestor feeds. Its25 SQL assertion points still need execution.
The three isolated PGlite wrapper attempts are closed and immutable. After the
Windows import-URL fix, the512MiB and1GiB test Jobs stopped at their strict reported
historical-peak thresholds. The retained results do not identify an allocation
cause, an OOM or a production memory requirement. Do not raise those old budgets
again or bypass their guards.

Use a fresh owned native PostgreSQL17.11 cluster, not the live database. The
successful historical ADR175 lifecycle is reusable source, not execution authority
or evidence that the new SQL passes. New namespaces are
`integration/native-hierarchy-postgres-v1` and
`canonical-v4/experimental/hierarchy-native-postgres-fixture-v1` within portable.

## Accepted source checkpoint

Root and independent Trust accepted twelve runtime/test files after72 guarded
pure reports, with no failed or skipped points. Root reviewed the four delegated
cluster/client files; Trust independently reviewed the eight Root files. Two
session cleanup/reentry bugs and a concurrent-finish bug were corrected with
regressions. Source grant and pinned review receipts are under
`apps/local-service/data/native-hierarchy-postgres-v1-*20261026.json`.

The no-options proof internally chooses its assertions and privately grants
factory scope only after the first pure point. Caller-supplied database objects
cannot register a repository fixture. Transactions use one original physical
session with literal COMMIT, expired capabilities and nested/outside dispatch
blocked. Cleanup cannot replace even a falsy primary error. The assertion ledger
requires all25 exact ordered points, no skips, swallowed failures or unawaited
children. A permanent authenticated inverse preserves all original assertion
bodies and the unchanged ADR220 SQL inputs.

Only `127.0.0.1:55433` is allowed. New `nhpg1-` directories under the fixed new D
parent have private markers and fresh RAM-only SCRAM credentials. One admin and
two sequential work sessions create the fixed scratch names ending `_a` and `_b`.
Private server identity, database OID, exact port/version/start and vector0.8.2 are
checked. Physical client closure and exact zero-session/OID checks precede plain
DROP; no FORCE, existing-database adoption or backend termination. Original
startup120s, SQL195s, stop20s and report25s lifecycle bounds remain.

## Supervisor source boundary

Adapt the reviewed bounded wrapper in new files, never edit an old consumed
version. Create one fixed64MiB-heap Node process suspended, with DETACHED and an
explicit three-stdio-handle inheritance list. Assign it to the owned Job, verify
membership and read back flags0x2208, active-process32 and aggregate1GiB memory
before Resume. Native PostgreSQL legitimately creates multiple owned processes;
the old single-process assumption must not survive in descendant cleanup.
Terminate only the owned Job on failure, including when its root has exited but
descendants remain. Complete class3 census must reject truncated/unequal counts
and enforce the32 bound; root exit plus EOF is not an empty-Job proof. Normal
success requires no emergency, original root exit0,
both pipe EOFs, complete empty Job, all closed handles and end-pins.

Keep physical and caller-available commit floors1GiB, C2GiB and D4GiB. Startup
admission adds1GiB Job plus96MiB parent margin to the memory floor:2144MiB. This is
an observation margin, not a reservation. Read the caller commit counter directly.
Begin the one monotonic epoch before authentication; active360s, normal380s and
absolute390s permit20s normal retirement plus a fixed10s emergency tail. Sampled
CPU is bounded at60s. No continuation renews an expired deadline.

Bound the new owned cluster tree to512MiB and8192 discovered entries, retain it
after cleanup, and admit at most one fresh marked directory beyond a verified
baseline. Never traverse or mutate historical run directories. Parent output is
bounded512KiB, with stdout256KiB and stderr64KiB. A fully drained but discarded
failure stream is distinct from retained evidence bytes. Exclusive publication
and pending/final identity checks must not overwrite or adopt prior output.

The fixed actual entry internally calls the accepted no-options proof and emits
bounded structured evidence. It accepts no database path, URL, role, callback or
case selector. Child PATH is fixed to the PostgreSQL bin directory and Windows
system directories; user PATH, NODE_OPTIONS, credentials and service selectors are
not inherited. Fixed temporary and system paths stay in a scrubbed environment.
The actual child cannot use the pure-test external-capability denyguard: it must
spawn its own server and connect to its fixed loopback port. Fixed authenticated
code and owned process/Job/port boundaries supply its narrower intended authority,
not an equivalent network or filesystem sandbox. Pure tests retain the denyguard.

The parent enforces its original outer epoch across authentication and every
nested phase; inner no-options lifecycle APIs do not accept caller deadlines.
Their fixed maxima may have less remaining time after outer setup. Cumulative
Job user/kernel CPU includes exited children, not only the current root.

## Complete input catalog source design

Authenticate an externally pinned catalog FILE before JSON decoding or following
its paths. A1MiB map,3000 records and320MiB total inputs cover the local import/SQL
closure, fixed package closure, new wrapper files and runtime inputs. Preserve
streamed hashing, exact regular-file identities, no-reparse ancestry checks,
casefold/file-directory collision checks and start/end inventory comparison.

A read-only installation census found1777 files totaling145,301,366 bytes under
the fixed PostgreSQL `bin`, `lib` and `share` roots. Pin this complete bounded set,
including DLLs, vector DLL/control/SQL and initdb catalog/configuration inputs,
with a literal path-list hash and fixed logical-root mapping. This avoids claiming
that the historical nine-binary manifest covers the new native dependency tree.
Empty native asset files, if present, require an explicit bounded schema rule.
PostgreSQL installation files are inputs, not owned output-disk consumption.

Node, Python and PowerShell executables and the pinned Python runtime DLLs remain
fixed. Windows OS components and Python standard library are trusted platform
dependencies, not a claim that every operating-system file is authenticated.
The new wrapper must make DLL search/environment assumptions explicit and must
not use arbitrary loaded-module paths as authority or silently broaden roots.
Fixed PATH alone is not a complete Windows DLL loader policy: application,
current-directory, system and side-by-side resolution remain explicit platform
assumptions. No caller configuration, plugin or extension library selector is
introduced. An input catalog is sampled integrity, not a loader trace or sandbox.
The platform search behavior is described in Microsoft's
[DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order).

## Execution and remaining product work

The accepted supervisor and catalog design require source implementation, pure tests,
independent review and final pins before a separate ONE execution decision under
fresh resources. No existing entrypoint may be used to skip those gates. Saved
actual evidence then needs independent audit. A failed run is not retried or
adopted automatically.

The first native run measures serialized canonical SQL behavior. It is not
multi-session contention, restricted-role security, trained semantic quality or
live matching evidence. Those tests, real publication/issuance, owner/admin
controls, UI/crawler integration and safe live activation remain required for
the overall hierarchical matching goal. Live55432, HBA, DPAPI, services and the
running crawler remain unchanged by this fixture work.

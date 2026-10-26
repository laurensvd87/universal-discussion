# ADR146 Exact Ridge validation performance

Date: 2026-10-20. Status: isolated PGlite screen complete; native validation
under development. Production functions and data remain unchanged.

## Decision

Test a numerical finiteness check before introducing a protected projection or
changing topic geometry. The existing unit-vector validator renders both each
coordinate and the running squared norm as text. The candidate replaces only
these finiteness tests with strict double-precision bounds between negative and
positive Infinity. Shape checks, coordinate order, norm arithmetic, tolerance,
stored-reference validation, dot products, clamp, threshold and ordering stay
the same. Applied migrations 001–009 are immutable.

The current Ridge scan remains exhaustive. This optimization cannot supply a
semantic hierarchy or change the confidence needed to choose a child topic.

## Measured sparse PGlite comparison

One fresh in-memory engine ran three rotating repetitions per variant and size.
The full-validation candidate produced identical ordered binary64 score bits.
The following medians include SQL call and result transport, not fixture setup.

| References | Current milliseconds | Numerical validation milliseconds | Current divided by candidate |
| --- | ---: | ---: | ---: |
| 64 | 26.355 | 19.107 | 1.38 |
| 256 | 125.776 | 82.033 | 1.53 |
| 1024 | 608.313 | 384.955 | 1.58 |

All 22 validator and scan differentials matched, including tolerance neighbors,
NaN, infinities, nulls, array shape and signed zero. Subnormal, underflow-product
and overflow-product cases returned SQLSTATE 22003 on both paths; they did not
demonstrate successful arithmetic on those inputs. Both full-validation scans
rejected a malformed stored reference with P1204.

An intentionally unchecked mock was faster but missed that corruption. It is
not an activation candidate or a storage-integrity certificate.

The parent observed 13,672ms aggregate process CPU and 9,489ms wall time, below
its 30s/60s bounds, and confirmed its own Worker exited. The 256MiB limit bounded
Node heap, not total WASM or process memory. These sparse synthetic timings do
not establish native PostgreSQL, dense-catalog or endpoint performance.

The saved command, source pins, migration hashes, samples and differential
outcomes are in
`apps/local-service/data/ridge-validation-cost-screen-20261020.json`.
Its file SHA256 is
`8dec7e81b80c6057069f8d21c64bc52ca06b84468508f72d6780841f7a383f50`.
Independent stored-evidence review reproduced hashes, summaries and output
digests without rerunning the screen.

## Native comparison requirements

A new harness must use a fresh owned PostgreSQL17 cluster, an ephemeral loopback
port other than 55432, generated test credentials and synthetic sparse and dense
vectors. It must not connect to the installed owner cluster or change its HBA,
roles, services, credentials, crawler or application state.

Use the reviewed isolated-server lifecycle helper unchanged, protected by an
outer owned Win32 Job assigned before Node may spawn native utilities. Require
source and binary pins, continuous resource and drive reserves, aggregate Job
CPU including exited utilities, bounded files, and confirmed smart shutdown and
empty Job. Emergency termination may target only that assigned Job and must
produce a failed result, never a successful graceful-cleanup claim.

Compare all 22 differentials and exact score bits again, including dense
accumulation, threshold neighbors and malformed references. Seed bounded chunks
instead of building a large dense JSON graph. A native result is a prerequisite
to a separately reviewed additive production change; it is not itself activation.

## Sources

The numerical baseline is the repository's unchanged 004 validator and 007 scan.
Win32 aggregate CPU accounting uses TotalUserTime plus TotalKernelTime, which
include terminated Job processes in 100ns units, as specified by
[Microsoft's Job accounting documentation](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information).

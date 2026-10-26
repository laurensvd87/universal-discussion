# Public journey revocation after capture failure

This isolated SOURCE component adds only the exact `abort('phase-failed')`
overload to the authenticated journey-v3 implementation. It prevents a redundant
report when the owning capture phase has already failed. It does not select a
topic, prove hierarchy quality, run a browser or authorize a study phase.

The future capture caller must set its real local fatal and global phase-failure
presence flags before this call. This helper cannot authenticate that caller;
actual integration must prove issuance and preserve the original errors. Never
use this overload as a substitute for an original journey failure or for normal
zero-argument abort.

With exactly one primitive argument equal to `phase-failed`, a healthy journey
stores one external-failure error in its existing failure cell and rejects its
existing readiness Promise. It leaves the report absent and performs no report
preflight, report allocation or failure notification. Existing failures and every
report state remain untouched. Every other argument shape runs the byte-identical
old abort body. No cell, helper, option, callback or packed-state width is added.

The new error is not allocation-free; it belongs to the existing logical error
and control ownership. There is no second report allocation or reservation.
Physical originals and their pending-operation ownership are unchanged. No
continuation fact appears without original settlement, no cancellation settles
a native Promise, and failed retirement remains cleanup-only. A readiness
Promise that already resolved remains resolved; later publication still requires
the unchanged synchronous `assertComplete` fences.

Tests authenticate all128 frozen source entries before imports, preserve all36
original journey reports including both5040-order suites, and add six source,
revocation, exact-argument, physical-continuation and report-state reports.
They cover false/zero/NaN originals, pending and resolved readiness, hostile
arguments, zero preflight/notification, immediate null report, error identity,
repetition, building/compact/materialized/unavailable states and unchanged
32768/32769 behavior. The source-delta test proves the old module is restored
byte-for-byte by replacing only the new abort line with the old one.

Run from the repository root:

```text
node --max-old-space-size=96 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js ./spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v4/test.mjs
```

These are invented capability-guarded tests. The full collector, graph funding,
late bridge, transport, actual phase and live topic integration remain separate
review gates under ADR215. The held v3 and ADR214 files are unchanged.

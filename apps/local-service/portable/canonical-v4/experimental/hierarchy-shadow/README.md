# Isolated hierarchy mechanics, not canonical authority

This opt-in prototype is **not a registered migration**, runtime route, worker or
owner-database initializer. Tests use disposable synthetic data. Never initialize
it in `murmingle_canonical` or reuse its mirrors as Source/account/native proofs.

The repository supports immutable taxonomy/model/policy revisions, an ancestor
closure, Source input/incarnation fences and indexed parent feeds of original
canonical root/destination IDs. No posts, body text, vectors, principals or
credential material belong in this schema.

`registerShadowSourceWitness` gives a monotonic incarnation. A background decision
must carry its exact input hash/incarnation and current artifact/model/policy/tree
revision to `commitShadowDecision`. Input A-B-A and delete/recreate do not revive
an older job. `null` node means explicitly unresolved, not never processed.

`bindShadowRoot` requires the prepared revision/node/Source/input/incarnation plus
the original root/destination IDs. It rejects stale work instead of silently
binding to the Source's new topic. The first semantic root snapshot and original
route are immutable; page reclassification does not relocate old discussions.
Each Source link retains its original input witness until Source erasure. Shared
roots may survive another Source link without retaining the forgotten proof.

Parent reads return IDs only, with one-snapshot revision and per-node feed clocks.
Cursor continuation must carry both tokens. Unrelated branches and unchanged
classification do not invalidate a thread-feed cursor; related link/root erasure
does. A new taxonomy hides the old revision's feed until an explicitly reviewed
historical binding migration exists. Revocation also cleans roots whose current
Source decision was previously invalidated.

Mutations currently serialize on one short **shadow-state** lock. This proves
correctness mechanics, not high-write throughput. No public grants or real roles
are created. Future canonical integration must supply actual atomic root creation,
ownership, visibility/generation/native checks, deletion dependencies, fair worker
lifecycle, backfill review and accepted semantic quality. Hash mirrors alone
establish none of those rights.

## Checks

From `apps/local-service/portable`, run guarded tests separately with a bounded
heap, keeping memory-heavy tests sequential:

```powershell
node --max-old-space-size=512 --import ../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none test/hierarchy-shadow.test.js
node --max-old-space-size=512 --import ../../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none test/hierarchy-head-shadow-integration.test.js
```

The native harness defaults to no action. `--run-isolated` refuses a preexisting
reserved test database; it must never clear or borrow that database. Existing HBA
is intentionally not expanded for random scratch names.

`--run-isolated-server` instead uses an explicitly checked fresh D: directory,
the already installed PostgreSQL17 binaries, a private ephemeral loopback port
and its own test password. It never connects to the installed cluster. Read the
harness and ADR132 before explicit execution. Only its verified own postmaster
may be smart-stopped; failed ownership checks leave it reported for review.
Generated data remains in the ignored run directory for inspection, never
automatically recursively deleted. Native success must be observed, not inferred
from PGlite tests or an inert default invocation.

On 2026-10-19 the separate-process rehearsal passed. A reader completed in19.55ms
while the exact second writer was observed blocked; release, stale-job, feed/tree
races, stable roots and revocation checks passed. Its verified test postmaster was
smart-stopped and separately confirmed absent. [Execution receipt](native-execution-receipt.json)
links the ignored actual result; this is not canonical API latency or throughput.

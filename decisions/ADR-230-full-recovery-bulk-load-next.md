# ADR-230: Investigate full recovery CPU cost without weakening validation

Date: 2026-10-30

Status: successor source implemented and Root reviewed; no actual run authorized
by this document. The failed ADR229 attempt remains immutable.

The one complete-data attempt reaches actual owned PostgreSQL startup, authenticates
the entire fixed encrypted archive and starts pg_restore. Its original parent
selects `resource-limit/jobCpuSeconds=300.046875`, exceeding the unchanged300-second
Job CPU cap. It retires the owned Job by emergency cleanup with empty Job, closed
handles and both pipe EOFs. All2704 source/runtime end pins pass. The Node owner
completion/lifecycle proof is absent; normal SQL smart-stop, full restore,
migration, HTTP, browser and semantic quality are not established.

The final read-only scratch census observes1,556,437,369 logical bytes and
1,368,281,088 reported allocated bytes across1368 files including control hardlinks.
The retained accounting does not identify which process or user/kernel work
consumed CPU. The configuration's64MiB WAL retention does not measure total WAL
written. No inference that compression, parsing or WAL caused the failure is
accepted. Volume-free deltas are not a causal per-directory allocation measurement.

After complete fixed-path/hash/ACL/PID/listener auditing, only the failed PGDATA
is removed. Its1,556,436,787 logical bytes exclude retained ownership controls.
Original archive, run markers, source/catalog and failed output remain intact;
all existing service identities and crawler progress are preserved. Disposition
is not a claim that PostgreSQL stopped normally or that recovery succeeded.

## Candidate change and diagnostic evidence

Review a **new** source namespace for the same complete archive and exact original
data/schema/role/sequence/HTTP/browser assertions. Keep Job1GiB/32 processes,
Node64MiB,8 physical clients, the300-second CPU cap, original deadlines and all
memory/disk floors. Do not adopt/retry the old output or increase its budgets.

One promising candidate is `wal_level=minimal`, `archive_mode=off` and the already
fixed `max_wal_senders=0`, set only when starting the brand-new isolated cluster.
Keep fsync and full_page_writes enabled and verify these settings on the actual
bootstrap connection. Never apply these settings to live PostgreSQL. The official
[PostgreSQL17 bulk-load guidance](https://www.postgresql.org/docs/17/populate.html)
describes WAL avoidance for COPY into tables created in the same transaction.
The retained complete single-transaction pg_restore may benefit; this is a
hypothesis requiring a new full actual run, not a measured speedup or cause proof.
The current backup command source has no INSERT-dump option, but that observation
alone is not an independent inspection of the retained archive's SQL contents.

Preserve the original primary failure latch and retain its existing validated
aggregate user/kernel CPU accounting in the final bounded report. This adds
diagnostic evidence without a new client, arbitrary process access or a callout
before first-failure selection. Do not claim per-process profiling from aggregate
accounting. Consider a separate public synthetic comparison only if it resolves
an observed uncertainty; it cannot replace complete-data recovery acceptance.

Also review a bounded restore-progress observer before another expensive full
attempt. A single additional owned read-only connection, still inside the same
eight-client lifetime cap, can distinguish COPY progress from index building via
the official [progress-reporting views](https://www.postgresql.org/docs/17/progress-reporting.html).
Retain only bounded phases and numeric counters; never query/store statement
text or page/contribution content. Join the observer's original pending query and
connection close before lifecycle retirement. An unavailable diagnostic must not
mask the original restore result or invent completed physical work. Progress can
test the index-build hypothesis; no such index-stage observation was retained
from the failed first attempt.

Do not disable durability, filter tables/indexes/constraints, split away required
checks, change fingerprints or substitute a smaller dataset to make the test pass.
Parallel restore would conflict with the retained single-transaction contract;
the [pg_restore documentation](https://www.postgresql.org/docs/17/app-pgrestore.html)
does not justify silently removing that contract. If the candidate is unsuitable,
review another concrete design rather than automatically extending a timer.

The full product goal remains unchanged: general automatic topic discovery,
most-specific confident assignment with a usable broad fallback, stable canonical
identities, owner-wide/per-topic grouping, indexed retrieval and actual fast UI
behavior while the crawler runs. Recovery work is one prerequisite for safe
integration, not a replacement for those remaining requirements.

## Source checkpoint

The separate `compressed-owner-recovery-bulk-v2` contains28 predecessor copies
and five new diagnostic source/test files. Root reviewed the six nonmechanical
copy differences plus namespace-only adaptations. All28 predecessor source pins
and all2704 prior catalog pins are freshly rechecked unchanged. Final source
tests pass105 Node checks under64MiB and102 Python checks; no SQL/native Job or
actual browser cases are implied. Both PowerShell storage payloads parse and
their C# declarations compile without invoking native methods.

The actual-purpose source flags are ready after review; they do not confer
execution authority. Fresh2709-file catalog418924 bytes hashes
`802587e33abd099b9beeb2e44a99b613f656206a4177696e73a0c31dfb594f3f` and
authenticates279852323 bytes including the original seven runtime pins. Root
source review9660 bytes hashes
`8066239eb2206a9dc62316e9b064a413d7289c6073a17443fd0e15c6d1940888`.
This is one Root review, not independent review or successful recovery evidence.
Separate fresh resources, exact held private inputs/Chrome, port and live identity
checks, source archival and Root ONE decision remain required before preparation
of the new protected root or complete-data execution.

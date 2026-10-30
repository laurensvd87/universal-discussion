# ADR-230: Investigate full recovery CPU cost without weakening validation

Date: 2026-10-30

Status: proposed source design; no successor copy, implementation or actual run
authorized by this document. The failed ADR229 attempt remains immutable.

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

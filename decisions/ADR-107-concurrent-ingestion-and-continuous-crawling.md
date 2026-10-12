# ADR-107: Concurrent ingestion preparation and continuous crawling

Date: 2026-10-12
Status: Owner requested; implemented and independently reviewed, activation pending

## Request and research

The owner requires extension availability while crawling, scalability toward
thousands of simultaneous requests, uninterrupted crawling beyond 500 accepted
pages, and investigation/correction of the latest canonical `capacity` failure.
The subsequent explicit request is to research and implement concurrency.

[Node's worker documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html)
supports worker isolation for CPU-heavy JavaScript rather than occupying the
request event loop. [SQLite isolation](https://sqlite.org/isolation.html) and
[transactions](https://sqlite.org/lang_transaction.html) distinguish concurrent
read connections from serialized writers. [WAL](https://sqlite.org/wal.html)
can improve reader/writer overlap, but does not make synchronous JavaScript
concurrent or remove a full-catalog regrouping bottleneck.

Chosen local increment: read-only worker preparation with small authoritative
commits on the existing service connection. No journal change, schema migration,
alternate production endpoint, hosted database, provider or public permissions.
This preserves the existing canonical/version/identity protocol; many concurrent
read requests do not imply thousands of simultaneous successful regroup writes.

## Worker and commit boundaries

Normal CLI enables a persistent worker for normalized disk storage. Legacy/RAM
fixtures keep compatible synchronous operation without implicit migration. The
worker reads an existing canonical database with a read-only connection, plans
the exact ingestion, and returns only the affected canonical closure: changed
Sources/links/Topics and any complete subthreads required for stable routing.
No private/account/credential database, new vector, fetch, model or provider call
is involved. Full input validation preserves the original normalized floats and
operation digest; the worker cannot commit a write itself.

Main-thread `saveScoped` checks expected generation/revision and exact old rows
inside its existing transaction. Concurrent comments, edits, deletion or regroup
make the prepared plan stale and produce conflict; no fresh-version auto-rebase
or retry. Pairing and any supplied account session are renewed immediately before
commit, together with the original request's abort/closed/absolute-deadline guard.
An abandoned request cannot authorize a later worker write. Exact receipts still
reconcile without a second mutation, subject to their existing current-state rules.

One planner avoids multiplying quadratic working sets. Admission is eight tasks
including active work; queue plus preparation expires after fifteen seconds.
Replacement waits for worker termination; close awaits all retiring workers;
late errors are observed and late results cannot beat delayed timer callbacks.
Worker heap limits are old256MiB/young32MiB/stack4MiB; Node excludes external/native
buffers from those heap limits. Failures expose fixed allowlisted errors and do
not redispatch operations. Large changed closures and derived index updates still
run synchronously during commit: this increment is not unlimited write throughput.

## Transport and extension

Loopback accepts at most4,096 sockets, with a matching requested listen backlog.
Aggregate collected request bodies are capped at8MiB and outgoing response bodies
at16MiB until finish/close; overload fails closed. Individual header/body/response
bounds, exact Host/Origin/pairing, five-second raw/ordinary request deadlines and
absolute thirty-second authenticated model/ingestion leases remain. The shared
server-construction seam never binds; production startup stays127.0.0.1:4174.

Extension0.13.61 gives only ingestion a thirty-second client timer, keeping ordinary
reads at five seconds and every capture/context/409-brand/one-shot/provider fence.
It adds no retry, permission or automatic generation. Reload is needed to load it.

## Exact planner optimization

An optional bounded score/key heap replaces repeated all-pair rescans when
unrelated partitions merge. Pair eligibility/scores depend on immutable members
and the fixed Source universe, so unaffected entries remain exact; removed
endpoints are discarded. Numeric/lexical tie ordering, thresholds, manual pins,
sticky boundaries and Topic/subthread routing are unchanged. Cache overflow and
accepted legacy sparse NaN edges fall back to the original scan. Transient
integration indexes remove repeated Topic/link lookups without retaining new data.

Actual RAM-only next-candidate differential on the1,546-Source owner snapshot:
prior planner7,510ms versus optimized2,696ms, full partitions/decisions identical.
The ten-second CPU guard remains. A separate RAM-only scoped commit retains all
original contributions, revisions and immutable lineage; no owner data is written.
The old candidate can succeed on a quiet replay, so the latest `capacity` cannot
be retrospectively attributed exclusively to one guard or claimed permanently cured.

## Continuous crawler

Remove500 accepted ingestions per invocation. Default durable page, host, section
and packaged bucket quotas are unlimited(0), depth unlimited(-1), duration
unlimited(0). Explicit operator/custom-manifest caps remain. The finite packaged
origins, eligible path policy, robots/TDM/nofollow, pacing, byte limits and durable
deduplication are unchanged. Fair512-candidate windows and256 recent novelty
vectors avoid loading the entire staged backlog; quota counters come from SQL.
Ctrl+C or exhausted eligible frontier stops normally; service/embedding/policy
failures may still stop safely without dropping queued/staged work. No unattended
retry loop, ledger reset or automatic Windows startup is introduced.

## Verification and limits

Focused worker/authority/resource/crawler tests and full backend/client regressions
pass. Differential checks include both initial and post-merge heap overflow,
ties, sparse arrays and real-owner RAM comparison. Continuous fixture accepts775
pages in one run; historical attempts above5,000 and depth21 resume correctly.

`npm run check:concurrency` uses only a synthetic1,500-page temporary database and
a capability guard restricted to127.0.0.1:4175, forbidding owner4174, external I/O
and providers.2,000 real simultaneously released read requests(health/version/
one-Source catalog pages/discussion) over2,000 preconnected sockets all return200
while a real worker-prepared plan is held. p95~1,202ms/max~1,204ms; a concurrent
comment is accepted and the stale plan returns409 without overwriting it.
Connection setup is batched separately: an initial same-process Windows SYN burst
was refused, and this is not evidence of2,000 fresh connections arriving at once.

This is a reproducible local read-concurrency result, not a hosted release,
thousands of writes/inferences per second, arbitrary endpoint latency, or an
unlimited catalog-growth guarantee. Expensive reads, very large commit closures,
single-writer contention and global optimistic-version conflicts remain scaling
limits. Further hosted/write-heavy scaling requires its separate architecture,
load, identity, recovery and deployment gates; do not silently relax proofs.

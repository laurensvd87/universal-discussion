# ADR-108: Concurrent public connection and page reads

Date: 2026-10-12
Status: Owner approved; independently reviewed and checked, final activation pending

## Request and evidence

The owner confirms extension 0.13.61 still shows Not connected during crawling
and approves all changes needed for thousands of simultaneous service readers.
The crawler subsequently stopped with response-timeout after 25 accepted pages;
the owner explicitly permits restarting the service, even when not idle. Preserve
accepted writes, pairing and protected sign-in; this is not an inference grant.

ADR-107 isolated ingestion preparation, but its load test used inexpensive catalog
pages, not the selected-page connection path. A separate read-only owner replay
at revision 2199 / 1,571 Sources took 82 ms for an empty catalog context and
10,993 ms for a selected learned Source. Selected context and alternate discussion
still synchronously planned Ridge Topics on the HTTP thread; every ingestion
invalidated that revision cache. A health probe timed out at ten seconds, while
later health/version probes completed in 8-10 ms. This confirms a remaining
blocking path, not unique attribution of every owner timeout.

[Node worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html)
provide isolation for CPU-intensive JavaScript. [SQLite isolation](https://sqlite.org/isolation.html)
permits separate readers but still serializes writers. Do not hold a database read
transaction across matching: a rollback-journal shared lock would obstruct the
main writer. No WAL switch, migration, hosting or public network binding follows.

## Isolated reads and current authority

Normal normalized-disk CLI enables a persistent read-only public worker alongside
the ingestion worker. Legacy/RAM fixtures retain compatible synchronous methods.
Only public catalog/context/page, discussion/page, related, prior/alternate
discussion and exact Source methods are admitted. Worker data contains trusted
canonical location and already installed fixed adapter coefficients, never
private/account databases, provider credentials, browsing capture or a fetch.
Health, version, pairing and short account checks stay outside the expensive queue.
An empty-context disposable read initializes the read-only connection and fixed
coefficients in parallel with normal startup. It selects no page and invokes no
Ridge planning, account callback, provider or capture. Failure is best effort,
version-fenced and cannot authorize a write; shutdown awaits pending retirement.
This reduces first-request initialization cost, not a new read deadline guarantee.

Tasks coalesce by exact method, validated canonicalized input and generation/
revision. Defaults bound 32 distinct tasks, 4,096 waiters, 8 MiB aggregate distinct
serialized inputs, 64 KiB per task, 1 MiB per result and fifteen-second total task
lifetime. Heap limits remain old256/young32/stack4 MiB. External/native buffers are
not included in Node heap limits. Ordinary HTTP/client reads still expire after
five seconds; no new response lease or automatic retry is introduced. Overload
uses the existing capacity rejection; health/version remain independently usable.

Each waiter owns cancellation. One canceled reader cannot abort other coalesced
readers; the last abandonment removes the job and retires its worker before
replacement. Closure and failed retirement fail closed. Shared results are frozen
once. No completed-response lookup cache is maintained on the HTTP thread.

Repository reads close their individual short snapshot transactions before CPU
planning. Worker checks generation/revision before and after the complete read;
the main service and final HTTP delivery check again. Pairing, optional app session,
abort and absolute transport deadline renew before encoding. Changes or deletion
produce conflict, never an old response relabeled with a newer version. There is
no automatic read rebase. Existing client read-only reconnect handling remains.
Private/provider/account execution and write/proof paths are not moved to this
public worker or widened.

Public actor labels are renewed on the main service; account records never enter
the worker. Weak identity maps share immutable coalesced actor projections and
their bounded JSON encoding, not a request-addressable historical response. Every
delivery still renews authority. Private/provider/account responses never use
that encoding reuse. Existing 16 MiB aggregate outgoing buffering and 8 MiB
incoming buffering remain; slow consumers cannot allocate unbounded socket bodies.

## Fair crawler commits

Strict current-version reads could otherwise starve when new ingestion commits
arrive faster than a cold read completes. Prepared ingestion uses a bounded commit
barrier: admit at most eight commit claims, let the current admitted read batch
and its HTTP delivery continuations finish, then run the original synchronous
guarded scoped commit. New distinct read tasks pause during that bounded drain;
existing coalesced readers may join. Fresh read admissions receive an event-loop
turn between commits. Health/version remain outside the gate.

The barrier holds no database lock while waiting and has an absolute maximum
fifteen-second claim lifetime. Cancellation, uncertain worker retirement, expiry
or stale authority prevent its callback. Original expected version, operation
digest, receipt and row proofs stay exact. Concurrent comments/deletion are not
blocked by this crawler gate and still invalidate stale plans. There is no extra
ingestion retry, rebase or rollback claim.

## Exact performance improvements

Private Float64 coefficient copies and one centered-axis calculation per Ridge
input preserve every coefficient and left-to-right arithmetic. Full-coordinate
metric indexing tightens exact Euclidean pruning; raw-dot admission, ties, EPS,
thresholds, qualification and resource budgets are unchanged. Frozen prior
implementations are differential oracles, not owner data fixtures. Owner RAM
comparison: prior pipeline 6,400 ms versus 3,722 ms, identical 1,391 partitions;
dot comparisons fell from 2,699,406 to 730. All 1,563 owner learned transforms
were bit-identical in every coordinate. Other timings vary with CPU contention.

Explicit prepared related ranking validates existing E5 geometry once per current
ranking snapshot and model, with unchanged bounds, URL rules, ordering and 0.88
floor. These are bounded RAM normalization copies, not new semantic embeddings
or persisted vectors. A 32-entry metadata-only related result cache also resets
on snapshot change. Eight owner RAM queries: previous 1,608 ms, one 190 ms
preparation and 9.7 ms for the prepared ranks; full DTOs match exactly.

Normalized alternate discussion reads use the selected current canonical Topic
and exact group-member Topic/thread closure, not a fresh full catalog load per
reader. Complete nested replies, manual pins, historical routing, original lineage
and current-version checks remain. No old contribution bodies are cached globally.

## Verification and remaining limits

Independent reviews and restricted checks cover coalescing, cancellation, stale
versions, optional logout, revoked pairing, byte bounds, worker retirement,
commit fairness, exact transform/ranking oracles and normalized/aggregate projection
parity across manual pins, nested replies, historical routes, edits and deletions.

The isolated synthetic load guard permits only 127.0.0.1:4175 and forbids owner
4174, external I/O and providers. Its fixture has 2,000 learned Sources and real
synthetic Ridge coefficients. Two thousand simultaneously released requests cover
selected contexts, related, alternate/prior discussions, discussion, catalog pages,
health and version. The first passing cold wave had p95 3,088 ms / max 3,105 ms;
warm max 1,400 ms and post-comment max 2,166 ms, all HTTP200 with 27 coalesced tasks
per wave. Controlled 32-task overflow rejected capacity while health/version
completed in 5 ms. A comment survived while stale ingestion returned conflict.
Final startup-primed fixture: cold p95 2,489 ms / max 2,514 ms, warm max 1,474 ms,
concurrent-write wave max 2,423 ms, all HTTP200. A second real prepared ingestion
was released only after all 2,000 reads entered the handler, with a read worker
still active. Every old-version read completed before the accepted commit;
ingestion returned200 at revision+1 with its new Source visible (7,857 ms including
preparation and the controlled hold). A further100 reads passed after the write.
Overflow retained413 while health/version took4 ms. No owner data was used.

Full final backend972 pass/five platform skips and restricted extension1,496 pass;
an additional focused startup-shutdown lifecycle test passes. Isolated Chrome
checks pass. Secret scans backend774/client243 files found zero. All authority,
scope, performance and lifecycle slices received independent review. Final local
activation and actual owner connection-path timing are recorded below.

Sockets are preconnected in batches: this does not prove an instantaneous 2,000
fresh-connection burst, 2,000 different expensive tasks, thousands of writes or
inferences per second, unlimited catalog growth or a hosted multi-user deployment.
There is one bounded public planner and one canonical writer. Very large closures,
expensive account/private/search routes and CPU/network/resource overload retain
their own limits; further hosted/write-heavy scaling remains a separate gate.

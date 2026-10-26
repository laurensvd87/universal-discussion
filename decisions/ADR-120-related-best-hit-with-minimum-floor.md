# ADR-120: Related best-hit selection with a minimum floor

Date: 2026-10-15
Status: Implemented, verified and active locally; no client reload for this change.

## Decision

The owner retains 0.88 as the normal learned Related similarity threshold. If
there are no ordinary results, return exactly the best eligible candidate with
cosine >=0.80. Below 0.80 return no result. Strong results exclude all weaker
ones; existing manually confirmed associations retain their priority and suppress
the additional selection. Inclusive thresholds, exact normalized binary64
arithmetic, deterministic ordering, Source/URL exclusions, compatibility and
deduplication stay unchanged. A zero result limit still returns nothing.

Use the same Related naming, relationship/method and public DTO in both cases.
Do not introduce a fallback flag, label, translation or similarity disclosure.
This is related-Source retrieval, not Topic membership: Ridge thresholds,
references, memberships, canonical destinations and historical posts stay intact.

The shared pure ranker supports an optional lower floor; omission preserves
existing behavior. Only learned service and normalized PostgreSQL retrieval
enable 0.88/0.80. Fixture retrieval keeps its original settings. All candidates
are still validated and scored exhaustively, including below-floor and late
corrupt candidates. No SQL prefilter or persistent derived index is installed.
Public enrichment and optional Insight context consume the same result; later
existing exclusions do not initiate another selection. Explicit
`includeRelatedSources:false` continues to skip related retrieval altogether.

## Capacity correction discovered during live verification

The growing saved catalog reached 15,602 compatible candidates / 8,537,832
input units, exceeding the ranker's legacy 8-Mi-unit aggregate document guard.
This independently prevented learned Related reads, despite the new selection
rule. Prepared relational snapshots now have a finite 16-Mi-unit aggregate
guard. Direct ranker input retains 8 Mi units, candidate-array and per-field /
vector bounds stay unchanged, and every candidate is still validated. Tests
cover admission above the old guard, rejection above the new guard and late
invalid data. This is bounded local headroom, not unlimited catalog scalability.

## Verification and activation

Pure ranker 19/19, learned service 18/18 and PostgreSQL/PGlite read suite 11/11
pass, including exact 0.80 admission, just-below rejection, strongest-only,
strong-result suppression, direct/prepared parity, immutable inputs and unchanged
memberships. The PostgreSQL suite uses one WebAssembly compiler task to avoid
unrelated native compiler-memory pressure. An existing isolated-pool test now
correctly counts both its current-version fence and URL snapshot transactions.

The first complete backend run had one existing dense-planner timing failure;
that unchanged test passed independently, and the final complete backend run is
1,180 pass / five skips / zero failures (1,185 total). Final complete restricted
client suite is 1,576/1,576. Whitespace checks and final seal preflight pass.

Read-only owner-data HTTP proof through the extension's authenticated enrichment
route finds zero ordinary hits and one best score 0.86820369396936, returned as
one ordinary Related DTO (HTTP200, 8,229ms, revision16,349). The reported Kapsalon
pair remains normally related at 0.895147813926918, ranking first/second. Its
exhaustive related scans took 8,621/9,217ms. Optional matching is not claimed to
be faster: the raw Related endpoint retains its original five-second deadline
and may time out; the extension's already approved projection route has 30s.

Only the three reviewed production files were overlaid into the trusted checked
snapshot. Old manifest/code backups are under ignored
`data/runtime-backup-adr120-20261015`; no database backup/restore or migration.
Final seal:
`36145d2b316bb1cbcda283d5702944fffd747eb5db11cfe5f89c2d7ff7ddd725`
(1,355 files / 15,227,108 bytes). Preflight and 13 dormant module imports pass.
HTTP service-only restart is PID43852. Visible crawler30008, worker22884 and
dashboard6644 remained running with unchanged process start times. Pairing hash
is unchanged, lock waiters/blockers/deadlocks/idle transactions remain zero.
No provider request, page capture, owner post or deliberate data mutation was
made. Crawler ingestion continues independently; no hosted-scale claim follows.
Final revision16,361 check: 100/100 concurrent mixed reads HTTP200 in525ms,
crawler12,731 completed plus one currently leased job; same process start times,
service stderr empty.

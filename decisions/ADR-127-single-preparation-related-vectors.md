# ADR-127: Prepare Related vectors once

Date: 2026-10-19

Status: implemented, independently reviewed, regression-tested and ACTIVE in the
owner-local checked PostgreSQL runtime. Backend-only; no client reload required.

## Request and cache lifetime

The owner asks whether cold Related preparation is per website or per user and
requests acceleration. It is neither: each backend read facade owns a shared
in-process catalog index, inherited by its nested snapshot facades. Normal public
Related/enrichment and Insight validation share that facade. New users and other
saved pages reuse it. Separate server processes would have separate RAM indexes.

Restart/absence, an original non-sliding five-minute baseline, generation/server/
relation changes and unsafe tuple ages/horizon force full preparation. Ordinary
catalog changes revalidate changed rows/chunks; posts alone do not expire vectors.
Five-minute expiry is demand-driven: the next lookup rebuilds, not an idle timer.
This policy remains unchanged. No claim that Related is cold only once per page,
per browser or for the entire lifetime of the installation is correct. Browser
content extraction, its local model startup and new-page ingestion are separate.

## Change

The previous path retained parser-owned frozen raw coordinate arrays, copied each
to a private Float64 array, converted it back to an ordinary array and repeated
descriptor validation/normalization for chunk preparation. Query normalization
also repeated for every chunk. The original raw and normalized copies overlapped
during the full catalog build, increasing heap/GC costs.

The shared pure core now mints an opaque prepared Source token only after its
ordinary complete source validation and exact normalization. A module-private
WeakMap retains the copied normalized Source. Tokens expose no fields, vectors,
caller-mutable aliases or configurable trusted flag. Explicit appendPrepared and
rankPrepared consume only those minted identities; ordinary append/rank input
checks remain. Normalized arrays are private and never mutated or exposed, rather
than frozen/boxed. Arithmetic remains exactly scale/map/hypot/map and the same
axis-ordered dot, thresholds, clamping, tie order, manual priority and URL dedup.

The Node catalog index rejects proxies before token preparation, fully validates
ineligible vectors too and keeps its metadata/identity/ordinal/evidence/budget
guards. prepareRelatedCatalogEntry creates a second opaque identity for the
validated catalog entry; a token alone is not fresh database evidence. Build still
requires the complete current witness set, all requested deltas, original count,
chunk and cumulative16Mi-unit caps. Invalid later input publishes no partial view.

The PostgreSQL loader mints each entry during its existing512-row embedding batch
and releases processed metadata from its local hydration Map. It first performs
all original Source/link/membership/receipt checks, lossless JSON-to-binary64 mirror
comparison (including Object.is signed zero) and optional inline mirror equality.
Raw parser vectors need not remain retained until the entire catalog is loaded.
No SQL/migration, stored vector, membership, threshold, privilege, TTL, provider,
post, policy or client-authority change follows. No owner browser capture or AI
request is needed for this optimization.

## Evidence and boundaries

At23,009 Sources, a read-only profile of the sealed baseline measured cold9,654ms,
warm853ms and end-of-build process RSS805MiB. The optimized candidate measured
cold6,203ms, warm890ms and end-of-build RSS372MiB. A separate one-MVCC exact DTO
comparison measured baseline10,347ms versus candidate6,856ms: identical five
results/full response, about34% faster cold preparation in that pair. These are
local observations under an active crawler, not guaranteed latency/peak-memory
bounds. Cold is still seconds and warm remains dominated by all-row SQL evidence.

A deliberately512MiB-capped old profiling child exhausted its heap; the optimized
child completed at that cap. The later baseline768MiB run used a watchdog to
preserve512MiB host commit reserve and stop only its own child if unsafe. API and
crawler were not stopped by profiling. An outer PowerShell wrapper lost a child
ExitCode despite the exact helper printing success; the helper's complete DTO
equality assertion did execute. Do not count that wrapper outcome as a product
failure or invent an exact guarantee from the memory cap.

Pure small-fixture synthetic build433ms to82ms isolates duplicate allocation work,
not a whole-catalog extrapolation. Restricted client1604/1604, pure index18/18 and
focused core28/28 pass. Tests cover frozen-prior arithmetic with384-dimensional
random/extreme/subnormal/signed-zero/threshold-neighbor vectors, manual/ties/dedup,
forged identities, no-execution hostile accessors/proxies, caller mutation,
late-invalid append poisoning, ineligible corruption, delta/deletion/expiry,
ordinal and cumulative-budget guards. Independent review found no blocker.

Full portable/cache regressions and final sealed-runtime activation are recorded
in top STATUS/HANDOFF. Some resource-constrained offline child starts exhausted
host compilation memory when two PGlite suites overlapped; the verification is
therefore sequential. No owner pagefile, apps or live processes are sacrificed.

Final portable144/144 and sequential cache12/12 pass; both secret scans clean.
Only the three reviewed production files were overlaid, byte-equal to tested
worktree sources after LF formatting. No migration or database/data conversion.
Prior code/manifest is retained in data/runtime-backup-adr127-20261019, not a data
restore image. The API alone restarted as26168; worker22884/dashboard6644 and
crawler43664 retained start times. Pairing is unchanged; AI connected/plan-enabled/
not-pending. No inference, post or owner-profile action was performed.

Final runtime seal730d918dc54690db6b2ab294dd1fa933e97242774ef63604b8e8e95da1f4d878,
1366files/15370365bytes, schema9 unchanged. Live first HTTP enrichment6,602ms,
subsequent957/907/967ms, five Related pages and all optional errors null. Saved
discussion51–75ms.100read wave all200, p95458ms; contextual group89ms. Dashboard
sample23,059learned Sources,32seconds old; crawler3,924ingests this uninterrupted
run at the sample, still advancing. These are measurements, not fixed upper bounds.

## Non-goals

No background prewarm, stale-result serving, relaxed integrity, ANN shortlist,
five-minute extension or hosted/unlimited-scale claim. Core discussion and local
draft readiness remain independent of optional Related work. A later change to
cold scheduling or exact freshness policy needs its own review and evidence.

# ADR-126: Exact Related reuse and independent ingestion admission

Date: 2026-10-18

Status: implemented, independently reviewed, owner-local schema9 activation and
actual native browser/AI checks complete. See the activation record below.

## Scope

The owner authorizes continued implementation, local installation, actual public
browser tests, bounded deliberate AI posts, service interruption and keeping the
crawler running. Existing discussions, original destinations, pairing, protected
provider credentials and separate private/account stores must remain intact.
No existing account is appointed grouping owner: the owner defers detailed admin
controls to a future dashboard login. This is not hosted/scalability clearance.

## Exact Related reuse

The native PostgreSQL facade retains an opaque immutable numeric index. Every
request still obtains its own repeatable-read snapshot and checks every learned
Source's dependency witness across Sources, embeddings, primary links,
memberships and operation receipts, including candidates below the return floor.
Changed rows receive the original full mirror validation before reuse; missing
rows are removed. Metadata for selected results is freshly validated by the
existing same-snapshot enrichment/Insight closure. No message body is cached here.

Witnesses use relation identity/filenode and heap tuple version coordinates, not
logical identity. Reuse additionally requires the same server/database/generation,
an original non-sliding five-minute eligibility baseline, monotone xid8 horizon
advancing less than one billion, and every tuple age strictly between zero and
one billion. Unsafe ages force full validation, including repeated own-transaction
updates. Restarts, rewrites, inheritance, expiry and regression fail reuse. This
does not attest physical corruption or privileged unsafe extensions. There is no
new DDL, durable vector or approximate-neighbor exclusion in this cache.

Private 256-ordinal chunks preserve the exact global ordering, normalized-URL
deduplication, manual-confirmed priority, ordinary 0.88 floor and at most one
global best fallback at 0.80. Public labels do not distinguish fallback results.
Copied Float64 buffers retain original coordinates; normalization arithmetic is
unchanged. One fail-fast heavy-build token prevents simultaneous catalog repairs;
unchanged immutable views may still serve another coherent snapshot. There is no
unbounded follower queue or new provider/write authority.

Same-MVCC native differential returned exact DTO equality. At approximately19k
Sources with a crawler active, warm reads were734–1,001ms with zero embedding
batches; the exhaustive oracle took5,197–5,568ms. Cold preparation remained
8,798–9,432ms, worse than the old cold oracle, and active HTTP cold enrichment
took11,382ms. Active HTTP warm enrichment took844–875ms; saved discussion157ms.
Do not describe every visit or cold lookup as instantaneous. The full dependency
proof remains linear in catalog size. Native tests cover hidden-row corruption,
deletion/addition, model/extractor eligibility, signed zero, tuple ages, expiry,
generation, heap rewrite, inherited relations, nested Insight parity and duplicate
URLs across chunk cuts; a gated concurrent-cold test proves one build admission.

## Crawler and incoming-page investigation

The crawler's known-URL startup now uses a strict PostgreSQL-only URL page route
over the existing verified catalog reader, rather than rebuilding each Source's
Topic context. Opaque catalog cursors remain authoritative; unrelated monotone
global revisions do not invalidate catalog paging. There is no legacy fallback
or change to the default SQLite client mode.

A completion/renewal race is fixed: if authority renewal returns false or an
ambiguous storage failure, one exact status read can recognize an already saved
completion. It never reenqueues, revives a lease or overrides cancellation. Fixed
progress/failure categories exclude URLs, text, tokens and arbitrary errors.
An additional later generic crawler exit remains historically unproven; bounded
fatal diagnostics must identify any recurrence, not pretend that it was caused
by the renewal race.

Real browser ingestion intermittently returned HTTP500 before a durable job
appeared. The existing apply holds the ingestion lane while performing a long
exact scan; old admission also locks that lane before accepting a new job. This
explains a five-second admission timeout under a longer crawler scan, but the
historical individual HTTP500 bodies were not captured. Native read-only old
scan measurements were7,937ms and11,745ms over11,649 references.

Migration007 removes repeated validation/dot products inside the exact scan:
validate the candidate once, every retained reference once, compute the same
axis-ordered binary64 dot once and reuse its threshold/result. No float32/ANN,
normalization, threshold, coefficient or standalone validator changes. A native
temporary-function comparison, rolled back, measured3,270ms with exact result
bits/order versus7,937ms old. Dedicated synthetic tests also pass.

Migration008 admits genuinely new operations independently of the
expensive lane, with a separate finite admission lock, unchanged eight-job bounds,
Source/catalog/absence/generation fences and unique-operation/live-URL backstops.
Existing-operation replay and authority/lease repair remain lane-serialized. A
newly observed operation that disappears while waiting is rejected, never revived.
Native capacity, exact-operation race, Source-change and lifecycle-erasure proofs
pass. Fresh admission succeeded710ms while the old lane remained held; exact replay
waited then succeeded. No claim that same-Source writes or replay are nonblocking
follows.

Migration009 closes the remaining fresh-admission convoy: an early live-URL check
precedes Source work, and Source/stamp/runtime SHARE locks use NOWAIT with a narrow
lock-not-available translation into atomic nonacceptance. A private exception
subtransaction releases the fresh transaction advisory lock if another session
wins the exact operation between the initial check and admission recheck. Only
then does unchanged legacy lane-to-job replay run. Success retains locks through
outer commit; real failures are not swallowed. The private signal occurs before
Source work, sequences, inserts or returned rows. Applied001–008 and the legacy
replay tail are byte-identical to their predecessors.

The forced four-session native race proves the waiting replay holds zero new-
admission advisory locks; a fourth unrelated request succeeds5ms before legacy
lane release. Same-URL/Source/stamp/runtime cases reject in4–8ms with no new jobs;
after release, admission succeeds. Scratch databases were freshly created only
after absence checks, checked by exact OID and removed without FORCE after pools
closed. Temporary loopback-only SCRAM test rules were removed; original HBA hash
and successful reload were verified.

The exact scan remains linear and CPU-heavy: a later007 measurement under load
was11,235ms. A separately measured validator shortcut improved only14% and was
not adopted. Never describe the3,270ms earlier measurement as a guaranteed bound.

## Actual client and AI checks

Discover preview opens now hide the group list, show Back immediately while
loading, preserve same-page optional updates and restore focus to the trigger.
Navigation/generation changes close the preview. Restricted client1,602tests and
isolated narrow Chrome checks pass; client version0.13.71 requires reload.

Final actual native single-profile QA covered the original video, recipe and MDN:
exact document/window binding and real collector/embedding/ingestion, no replaced
model function or synthetic Ready. UI-ready timings9.59s/5.04s/4.82s;57observed HTTP
responses all200, no UI/network-guard errors. Video preview263ms, source-link-only,
group list hidden and Back restores exact focus. Recipe/MDN local draft focus is
preserved without autosend. Cooking terms8/19 and consent terms0/0 in the bounded
video/recipe capture; document/capture/catalog titles match Kapsalon. An earlier
third-page MDN transient did not recur; its original cause remains unproven.
Temporary profiles were removed; owner Chrome and active crawler were untouched.

Read-only pair diagnosis finds both original pages eligible: raw E5 similarity
0.8966407214092498 passes Related0.88. Pinned Ridge similarity0.8374276168255982
is below canonical0.8639003810829322; separate canonical memberships are therefore
expected, not a reason to retune. The settled video topic-space view has one group
and six discussion threads. New Explore topics groups populated threads, not all
empty page containers; the owner explicitly deferred account appointment/admin.

A disposable real Chrome profile used normal Continue with ChatGPT after a
read-only exact issuer/client/subject proof matched one existing named account.
No account/username/admin bootstrap was performed. Two new public human roots
and two AI replies were deliberately accepted on the owner's YouTube example:
German @AI5.71s and Dutch human-plus-sparkle6.20s; both language heuristics and
visible reply-level1 checks passed,81HTTPresponses all200. These are bounded
question-language/page-only tests, not general research quality evidence. Their
two-exchange grant is consumed. Both test conversations remain saved; the test
app session was logged out and disposable profile removed. No old job resumed.

## Density-clustering investigation (no visualization)

The frozen offline experiment uses84 short synthetic multilingual reports,
including36 independently authored holdout reports, two E5 input views and the
unchanged Ridge transform. Twelve fixed HDBSCAN pipelines compare original,
PCA10 and UMAP10 spaces; parameters were not tuned after inference. All measured
pipelines, frozen hashes and limitations are in
`apps/local-service/experiments/topic-encoder/formation-feasibility-v1/`.

For BODY/raw E5, UMAP increased wrong grouped pairs from142 to318 and cross-family
pairs from54 to210 while reducing noise. Larger groups are not automatically more
useful groups. Sparse incoming-topic tests use two seeds with minimum cluster
size three; their poor assignment results must not be generalized to mature
clusters. HDBSCAN's partition/noise output also does not replace overlapping
canonical memberships or preserve Topic identity across refits by itself.

No production adoption is justified by this small screen. Encoding both input
views took about9.8s total, peak process commit1,019MiB; the separate fitting
process took37s including imports/JIT, peak329MiB. One-thread sequential processes,
1,536MiB RSS/commit ceilings and host-reserve watchdogs passed. No plots, old closed
cohort inference, coefficient fitting, owner-page capture, provider calls or
canonical writes occurred in the experiment. Short synthetic text results are not
web-scale quality or long-document evidence.

## Completed activation and limits

Owner-local function-only007/008 and then009 transactions each verified every
heap tuple unchanged across18canonical data tables. Only function definitions and
their schema-migration records changed; no history/Topic/post rewrite. Each prior
migration hash matched before upgrading. Schema9 health/manifest and exact009 SQL
bytes were overlaid onto the checked snapshot, not the whole dirty worktree.

Final seal390ed9abc27d2db9033d691a4063581b82e4862263e17e227b22cf5c29c13b34,
1366files/15368354bytes; API39996. Worker22884/dashboard6644 retain their original
start times; crawler43664 continues and has exceeded224new ingests this run. Its
earlier generic exit remains historically unproven, so safe diagnostic categories
were added rather than inventing a cause. Pairing/protected provider sign-in remain;
read-only AI status connected/plan-enabled/not-pending. Account/private stores were
not migrated. Two deliberate test exchanges remain saved:33human/41AIposts total.
Code/manifest backup is data/runtime-backup-adr126-schema9-20261018, not a data
rollback image. Never start an incompatible older-schema binary or restore stale
data over later accepted writes/deletions.

Final backend fresh-process139file run1243pass/7skip/0fail, final hostile CLI9/9,
restricted client1602/1602, portable141/141 plus individually sequential cache12/12;
final migration/exact/ingestion23/23. A formerly warm-cache test expectation was
updated to require no unchanged binary hydration, then a synthetic tuple update
forces fresh validation through the nested native wire path and signed-zero
corruption still rejects. Both secret scans are clean. Actual final saved feed
48–159ms, warm enrichment913–1122ms, cold13,515ms (earlier8,079ms); all Related/prior/
alternate errors null. Final100mixed read wave all200, p95657ms, contextual group
142ms. Dashboard sampled19,359pages,25seconds old; counts continue growing.

Cold exhaustive Related preparation is still costly and optional; local drafts and
canonical feed no longer wait for it. First uncached document capture/embedding is
not equivalent to an indexed database read. Full dependency proofs, exact scans,
bounded public-root hierarchy and finite ingestion admission still impose growth
limits. This is not unlimited/concurrent-heavy-write or hosted readiness.

PostgreSQL max_connections100 limits database sockets, not signed-in users. The
application pool ceiling is42, only1–2clients observed in the final sample. Pooling
allows many users to share bounded connections; raising the server limit alone
does not remove lock/CPU bottlenecks and adds resource cost. No server limit or
owner pagefile change was made.

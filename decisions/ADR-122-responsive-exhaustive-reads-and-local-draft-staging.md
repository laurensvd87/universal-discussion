# ADR-122: Responsive exhaustive reads and early local drafting

Date: 2026-10-15
Status: Active backend; extension0.13.69 requires owner reload.

## Measured cause and change

The owner reports about10s before typing is possible and an AI failure. One
read-only profile measured an8,502ms Related lookup over15,749 Sources:4,269ms
transferring/decoding decimal arrays and3,086ms of trailing JavaScript work.
Its maximum event-loop delay was3,108ms. This was application CPU/serialization,
not PostgreSQL reader/writer locking. Separately, saved exact-page recovery
intentionally remains read-only until matching is verified, and the UI wrongly
also prohibited local root draft staging while showing those saved messages.

Native Related transport now encodes PostgreSQL's exact `array_send(float8[])`
through canonical base64 under the ordinary text protocol, in512-Source batches.
The installed pg-protocol cannot safely carry arbitrary binary result bytes;
binary:true/parser overrides were rejected before activation. The strict local
decoder checks dimensions/OID/lower bound/item widths/finite binary64/exact
framing/canonical encoding. Payload vs typed-array comparison remains exact,
including signed zero. PGlite keeps the original typed-array path. Nested
snapshots carry only the private wire dialect, without reopening the transaction.

Every learned Source/link/membership/receipt, every embedding mirror and optional
inline mirror is still checked before compatibility filtering. There is no SQL
candidate prefilter, persistent index, schema change, cached result or threshold
change. Pure preparation can append bounded batches while enforcing cumulative
count/16Mi-unit guards and poisoning an invalid build. A private WeakSet marker
only recognizes schema-checked JSON-parser-owned frozen embeddings; arbitrary
caller arrays keep their descriptor-safe validation. Normalization/arithmetic,
ordering, manual precedence, exclusions and0.88/one-best>=0.80 are unchanged.
Cooperative yields occur during Source validation and128-item rank preparation.
Public optional Related/enrichment has a separate two-distinct-task admission
bulkhead, leaving core32/URL8 admissions independent; saturation returns existing
capacity errors. Connection pool maxima and authority checks are unchanged.

The client permits local root typing in a retained exact saved-page snapshot
while matching checks/processes/errors. Sending, replies, edits, Insight and
@AI still require verified Ready and normal document/account authority. Genuine
navigation, replacement documents and account changes detach the staged text;
same-page recovery preserves it. Real pending enrichment shows existing compact
loading activity instead of immediately claiming an empty Related library.

## Verification and performance limits

Independent integrity review passes. Same native repeatable-read snapshot gives
exact old/new Related DTO equality at revision16,578:7,030ms before/3,732ms after.
Native PostgreSQL signed-zero/subnormal/extreme float transport is bit-exact.
Candidate profile3,526ms/max-event-loop-delay54ms retains9results. Latest live
Discover projection still yields9pages including the recipe with no missing
catalog metadata (4,299ms). These are measurements, not a latency guarantee.

Final live read-only overlap wave at revision16,631:30 coherent core selections
allHTTP200 while Related runs, median37ms/p95159ms/max210ms; Related3,809ms.
Initial cold saved read227ms, later saved discussion42ms. Earlier overlap wave
under other activity measured median54ms/p95294ms/max367ms and Related5,928ms.
Related remains multi-second optional work, not instantaneous search; sending
still waits for actual page verification. Do not claim hosted or thousands of
distinct heavy jobs/writes readiness. Expensive jobs remain finite and may
return capacity. Main-process memory remains substantial at this catalog.

Full offline backend1,180pass/five skips; restricted client1,582/1,582; portable
110/110 plus final canonical read14/14, including new two-admission/core-isolation
and nested native-wire/below-floor signed-zero-corruption cases. Pure batch/JSON
parity26, codec6 and focused async public read45 pass. Isolated packaged Chrome
community layouts at320/390/480px pass with inert provider seams. The final small
optional bulkhead has dedicated canonical isolation coverage. No owner-profile
reload is claimed.

## Explicitly authorized live AI test

The owner subsequently explicitly permits @AI posts and asks us to try the actual
failure. One real test was run on the exact saved Kapsalon YouTube URL, using
an isolated Chrome profile, its real native action popup and real current-page
capture/document attestation. No fake page, sender, Ready state or provider was
used. Manual Source selection used genuine scoped server metadata, without
deliberately starting matching ingestion. A fresh session for the sole existing
named account was created through normal verified local sign-in; only that QA
session was logged out during cleanup. The owner's Chrome profile was untouched.

Two initial setup attempts stopped at the sender gate before any post/inference;
an ordinary extension tab is correctly not an authenticated popup sender. The
native-popup attempt then used production controllers and the form handler:
one accepted human `@AI schreibe mir das rezept aus`, one accepted provider
start, one completed result and one accepted generated reply. There were no
automatic AI retries. Normal hosted research completed3search calls and one
accepted citation. Both posts are intentionally retained. Read-only canonical
proof verifies generated reply
`contribution-0e1aefd3-e5da-4314-9938-82fa3a9ed26c`, exact human parent, matching
operator and1,772characters. Existing root/reply remain, giving2roots/2replies.
The earlier generic failure did not reproduce; its historical cause remains
unknown. Do not claim it was a diagnosed provider/research failure or that every
future failure is fixed. This bounded one-attempt QA intent has been consumed;
do not automatically run another inference/post under it.

## Activation and crawler state

Reviewed overlays only, no unrelated dirty credential/name changes. Final seal
`f5737e1ce190543df554c06a195a60b5103a4781474a6056767f40cee31e5886`:
1,356files/15,248,587bytes. Service28164; worker22884/dashboard6644 retained
original start times. Prior code/manifests are recoverable under ignored
`data/runtime-backup-adr122-20261015`; no database backup/restore/migration.
Pairing hash unchanged, provider connected, lock audits zero, stderr empty.

Crawler30008 survived the first service-only activation but was absent at final
checks. No crawler stop/kill/start was issued. Read-only frontier shows last
attempt10:10:59.580Z/completion10:13:22.524Z,334,352queued/7staged; canonical
crawler jobs12,988complete. Its exit reason is not retained/proven. The owner
was asked whether they stopped it; do not silently restart a potentially
owner-stopped process or claim final latency samples ran with an active crawler.

### Subsequent owner clarification and normal resume

The owner confirms they did not stop the crawler. One normal saved-state resume
started PID30932 at12:46:35 local on2026-10-15, using the unchanged sealed runtime,
original queue and durable receipts. No frontier reset, generation rebase,
forced terminal-job replay, extra post or provider request was performed.
Startup catalog reconciliation takes about4minutes at the present catalog: it
pages the fully validated public catalog before reconciling already accepted
URLs and draining staged work. Six saved jobs completed and new fetching resumed.
This slow startup is not fixed by the Related optimization.

With crawler ingestion actually active,30core selections all returned HTTP200:
median31ms/p95176ms/max270ms, initial saved selection227ms, Related4,239ms.
A second100request read wave all returned200 in463ms. Lock audit still reports
zero waiting/blocker relationships/deadlocks/idle transactions. Worker22884,
dashboard6644 and service28164 were not restarted; pairing hash remains exact.

No matching Application1000/1001 crash or System resource-exhaustion event was
found for the old process/time window. Its historical exit cause remains unknown.
The code can deliberately exit1 on ingestion failure while preserving staged
representations; that is a plausible path, not a diagnosis of this occurrence.
The resumed process retains fixed progress/errors in ignored
`data/postgres-crawler-resume-20261015.stdout.log` and `.stderr.log`. No automatic
restart loop or expanded ingestion retry policy was introduced.

Subsequent proof includes26new fetch attempts/25staged pages, followed by their
first apply checkpoint. Durable completed crawler jobs advanced12,988->12,997,
with one further current lease at revision16,641. Thus recovery is not merely
a live PID or saved-row drain: newly fetched pages are being committed too.
The existing dashboard process regenerated its snapshot at10:52:18.018Z with
15,909learnedSources. Crawler30932 remains active; do not launch a second instance.

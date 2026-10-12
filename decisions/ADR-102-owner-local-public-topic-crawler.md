# ADR-102: Owner-local public-topic crawler

- Date: 2026-10-12
- Status: owner-requested local implementation; verification/activation evidence is tracked separately in STATUS/HANDOFF
- Related: ADR-018, ADR-021, ADR-023, ADR-073, ADR-095, ADR-098, ADR-099

## Context

The owner wants a PowerShell-run campaign that can add a broad range of public
Sources and provisional Topics without repeatedly visiting the same pages. The
normal operator should not have to find or approve origins one by one. Earlier
decisions excluded a general crawler; this decision changes that boundary only
for one owner-local, fixed-manifest campaign. It does not activate open-web
discovery, a search provider, hosted ingestion or background browser capture.

The canonical service already owns Source ingestion, semantic assignment and
storage. A crawler must use that authority rather than open or mutate canonical
SQLite directly. It must also preserve the existing distinction between a
semantic Topic, a Source and a Discussion: one fetched page is not automatically
one high-quality Topic, and crawling creates no contribution or AI-authored post.

## Decision

Provide a Windows PowerShell wrapper over a Node 24 crawler. The ordinary commands
from the repository root are:

```powershell
.\apps\local-service\ops\crawl-topics.ps1
.\apps\local-service\ops\crawl-topics.ps1 -Apply
```

The first command is a real, bounded network preview. It loads a packaged,
category-balanced manifest, fetches eligible pages, extracts and embeds bounded
static text, and durably stages candidates. It makes **no canonical API write**.
`-Apply` resumes the same campaign and serially submits selected staged
representations to the running local service. One invocation ingests at most 250
already staged candidates before crawling and 250 newly/remaining staged
candidates afterward. Repeated `-Apply` invocations resume the ledger instead of
turning growing Topic regrouping into one unbounded batch. Preview is the default
so a typo or ordinary invocation cannot populate the canonical database.

The service must already be running and paired on exactly
`http://127.0.0.1:4174`. The wrapper obtains an existing pairing capability through
a hidden interactive prompt and passes it to Node over standard input. It must
not put the capability in an argument, environment variable, manifest, state
database or log. The crawler uses authenticated, version-bound
`/v1/sources/ingest` requests with stable operation IDs. It never imports a
canonical repository adapter and never opens `data/demo.sqlite`.

Before a material `-Apply` run, the recommended operator action is the existing
online encrypted canonical backup:

```powershell
npm --prefix .\apps\local-service run backup:canonical
```

The crawler neither creates that backup automatically nor restores or rolls back
canonical data. Backup coverage and limitations remain those of ADR-099.

## Fixed campaign and expert manifest contract

Normal use loads a repository-controlled manifest with reviewed categories,
exact hosts and seeds. The built-in `wikimedia-balanced-v1` campaign has sixteen
knowledge buckets seeded across the English, German, French and Spanish Wikipedia
origins. Each seed can discover the large public path space on its own exact
origin; it cannot cross to another language/property, invent a host, include an
unlisted subdomain or invoke a search engine. A built-in path filter accepts only
`/wiki/<main-namespace-title>` and rejects a decoded title containing `:`,
excluding User, Talk, Special, File, Category and similar community/admin
namespaces. Its recorded rights basis points to Wikimedia's public terms and
documents the minimized retention; it is not a blanket legal or per-page quality
claim. The checked-in example is a schema reference for expert review and uses
reserved example-domain placeholders. It supplies no approved campaign origin
and asserts no permission for one.

The internal parser and checked-in expert reference use an exact JSON object with
only the following fields. The current PowerShell wrapper deliberately exposes no
manifest/origin argument; activating a custom origin remains a separate review,
not a normal crawler choice.

- `schema`: exactly `murmingle-crawl-manifest/v1`;
- `rightsAcknowledged`: exactly `true`; and
- `buckets`: one to 64 exact bucket objects.

Each bucket has only `id`, `rightsBasis`, `maxPages`, `allowedHosts`,
`allowedQueryKeys` and `seeds`. Hosts are lower-case exact DNS names, not suffix
rules. Seeds must be public HTTPS/443 document URLs on an allowed host. Known
tracking parameters are removed by the shared public-navigation sanitizer;
remaining functional parameters are rejected unless their key is explicitly
listed. `rightsBasis` is a human review record, not an automated legal conclusion,
and `rightsAcknowledged` is not a substitute for permission or licence review.

## Public-fetch and policy boundary

The crawler processes only static public representations fetched anonymously.
It sends no cookies, authorization, account state, page history or private
browser material. It does not execute JavaScript, submit forms, sign in, solve
challenges, call site-specific APIs or render pages in a browser. HTTPS
certificate validation is mandatory. Every requested destination and HTTP
redirect is normalized and rechecked against the explicit host/query policy.
Untrusted HTML `rel=canonical` metadata is parsed but cannot create an alias or
suppress another URL.

DNS is resolved for each bounded request, special-use or mixed public/private
answers are rejected, the selected public address is pinned into the TLS request,
and the connected peer address is verified. This prevents an allowlisted public
name from becoming a loopback/LAN/metadata-service fetch through rebinding.

The campaign maintains a durable minimum 2,000 ms interval between request starts
for each exact origin, including across restarts, then uses the larger interval
when `robots.txt` supplies a crawl delay for `MurmingleTopicCrawler`. It also
honors negative `X-Robots-Tag` and HTML robots directives and the TDM Reservation
Protocol, including `/.well-known/tdmrep.json` and response/page reservations.
A disallow, `noindex`, `noai`, header-scoped `notrain`, applicable reservation,
malformed policy or ambiguous policy result cannot be overridden by `-Apply`;
`nofollow` prevents link expansion. Policies are bounded and cached only in the
separate crawler state.

Requests and parsing have fixed time, header, body, compression, redirect, token
and link limits. Only bounded HTML/XHTML page responses can be staged. The static
extractor prefers `main`/`article`, excludes common navigation/chrome and
hidden/script content, and uses at most a 4,096-character normalized prefix for
embedding. The representation is labelled exactly
`crawler-static-html-prefix/v1`. That provenance is admitted by exact backend
matching allowlists only; it does not widen the browser page reader's existing
two-version capture contract.

The crawler loads the already pinned local E5 assets and verifies their manifest
and hashes before inference. It performs no model download and no provider call.
Fetched HTML and extracted text exist transiently in process memory only. Raw
HTML/text is never sent to the service, written to crawler SQLite or included in
normal output. The canonical API receives only the sanitized public URL, bounded
title, normalized 384-value E5 vector, extractor version and version/idempotency
proofs already accepted by the ingestion contract.

## No-revisit state and restart behavior

The durable frontier is the separate Git-ignored file:

`apps/local-service/data/topic-crawler.sqlite`

It records normalized-URL digests, bounded public frontier metadata, terminal
outcomes, content fingerprints, local vectors needed for diversity, and cached
origin-policy metadata. It contains no raw page text and is not a second canonical
Topic store. Existing canonical Source URLs are marked before work starts.
Normalized URL identity, revalidated HTTP-redirect aliases, exact content hashes
and a bounded near-duplicate fingerprint stop duplicate work.

Queued and staged work survives a reboot. Rerunning the ordinary preview or
`-Apply` command resumes the same built-in campaign. Completed, blocked, rejected,
failed and ambiguous in-flight pages are terminal and are not silently revisited.
Deleting this file discards that protection and is not normal cleanup.

The state binds to the canonical generation. A reset or replacement of canonical
storage fails closed. `-RebaseState` is an explicit recovery action only: it
abandons pending work and binds future work to the new generation; it is not a
restore, does not recreate lost Topics and does not authorize revisiting completed
pages.

## Breadth and selection

Breadth is deliberate rather than random. The packaged manifest separates major
knowledge categories into buckets. Queue scheduling rotates across bucket, host
and path-section deficits instead of exhausting one site tree. Diversity
selection keys its section quota by subject bucket plus exact origin/path section,
so one common `/wiki/` prefix does not collapse the sixteen subjects together.
The default campaign cap is 5,000 pages at depth two, with at most 1,250 per host
and 100 per subject/origin path section. `-MaxPages` may be deliberately set from
1 through 50,000. The default `-MaxMinutes 0` has no wall-clock cutoff: work
continues to its campaign cap or until Ctrl+C, and a nonzero limit is optional.
Each bucket's smaller `maxPages` remains authoritative.

After URL/content deduplication, a deterministic MMR-style pass favors E5 novelty
against a bounded recent ingested sample and newly selected candidates while also
rewarding bucket, host and path-section deficits. Stable URL digests break ties.
These quotas reduce obvious monoculture and near-duplicate clusters; they do not
prove that every subject is represented or that Topic assignments are correct.

Canonical ingestion remains serial and uses one global current version. It is not
a bulk-loader or a thousands-of-pages-per-second architecture. A large apply can
take substantial time because current Topic regrouping work grows with the
canonical catalog. The 500-per-invocation ceiling is split into two bounded MMR
passes as described above; a 5,000-page campaign can require many apply runs. The
durable ledger supports stopping and resuming; it does not make ingestion
parallel. The backend's current local matching policy may attach a Source to an
existing Topic or create a provisional one, and manual correction may still be
needed. Neither page count, E5 novelty nor a successful run is a Topic-quality
evaluation.

## Explicit non-goals

This decision adds no general URL input to the extension, open-web frontier,
search-provider/tool call, provider inference, retained raw-text corpus, login
crawl, hidden browser automation, private-page capture, scheduled daemon, LAN
listener, remote worker, hosted deployment or publication. It adds no post,
comment or AI identity and makes no release, licence, throughput or semantic
quality claim.

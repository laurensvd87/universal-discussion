# Owner-local topic crawler

The crawler broadens the local public Source/Topic catalog from a packaged,
category-balanced campaign. Normal operation needs no origin list or manifest.
The built-in `wikimedia-balanced-v1` campaign seeds sixteen knowledge categories
across the English, German, French and Spanish Wikipedia origins: science,
technology, mathematics, health, nature, history, geography, society, politics,
economics, culture, art, literature, music, philosophy and sport. Those four exact
origins expose a large path space without accepting arbitrary web origins. It is
an operator command, not a background service.

## Requirements

- Windows PowerShell and repository Node **24**.
- The pinned local E5 assets already installed at the repository's browser
  embedding asset location. The crawler never downloads a model.
- The normal local discussion service running and paired on
  `127.0.0.1:4174`.
- An existing valid pairing token. Paste it only into the wrapper's hidden prompt;
  do not add it to a command, environment variable, file, issue or chat message.

Run only one crawler process at a time. The fixed state database is exclusively
owned during a run. The public requests are real even in preview mode. A default
5,000-page preview can consume substantial time, CPU and network traffic; Ctrl+C
is the normal safe pause because the fixed ledger resumes later.

The terminal reports startup phases and aggregate progress while the command
runs, including page attempts, staged candidates and accepted ingestions. During
`-Apply`, new candidates are imported in small checkpoints so the running Topic
dashboard can show growth before the full campaign finishes. Progress contains
counts and fixed status labels, without tokens, URLs, titles or article text.

If a run ends with `ingest-unavailable`, its `ingestError` and the immediately
preceding terminal line give a fixed failure class. `capacity` means the service
rejected work at an existing capacity/budget guard; `ambiguous` means a response
was lost, incomplete or timed out. Complete HTTP 408, 500 and 503 responses now
report `response-timeout`, `service-error` and `service-unavailable`, respectively.
Older `unavailable` output cannot retrospectively identify which status occurred.
These labels do not add retries or extend deadlines. Queued/staged work stays in the ledger. Rerun
uses the same operation identity to reconcile a possibly accepted request.
Repetition alone cannot resolve a deterministic service failure.

## Preview, then apply

From the repository root, run:

```powershell
.\apps\local-service\ops\crawl-topics.ps1
```

This is the default **preview**. It prompts invisibly for the pairing token,
checks the current canonical generation and known Source URLs, and performs the
bounded network fetch/extract/embed campaign. It writes only the separate crawler
state. It does not call the canonical ingestion endpoint.

The default campaign is capped at 5,000 pages, depth two, 1,250 pages per host
and 100 per subject/origin path section. The section selection key includes the
knowledge bucket, so the common `/wiki/` prefix does not merge all sixteen
subjects into one quota. `-MaxMinutes` defaults to `0`, meaning it runs until the
campaign cap or Ctrl+C rather than stopping on a timer. Manifest bucket caps and
policy/deduplication decisions may stop it earlier. The summary is evidence of
staged/blocked/duplicate work, not a promise that 5,000 Sources or Topics will be
created.

For a deliberately smaller or larger campaign, `-MaxPages` accepts 1 through
50,000. A nonzero `-MaxMinutes` adds an optional time limit. The fixed exact-origin
allowlist does not expand when either limit changes, and raising one limit never
relaxes the other host/section/bucket bounds.

```powershell
.\apps\local-service\ops\crawl-topics.ps1 -MaxPages 1000 -MaxMinutes 120
```

The wrapper's advanced bounds are:

| Parameter | Accepted values | Default |
| --- | --- | --- |
| `-MaxPages` | 1-50,000 durable campaign attempts | 5,000 |
| `-MaxDepth` | 0-8 link levels from a seed | 2 |
| `-PerHost` | 1-50,000 durable attempts per exact origin | 1,250 |
| `-PerSection` | 1-10,000 selected candidates per subject/origin section | 100 |
| `-MaxMinutes` | 0-10,080 minutes for this invocation; 0 is unlimited | 0 |

These tune bounds, not authority. They never add an origin, bypass policy or
make ingestion parallel.

Before applying a material batch, create the existing encrypted online canonical
recovery point while the service remains running:

```powershell
npm --prefix .\apps\local-service run backup:canonical
```

Then deliberately apply the staged, diversity-selected candidates:

```powershell
.\apps\local-service\ops\crawl-topics.ps1 -Apply
```

`-Apply` continues the same campaign and sends candidates one at a time through
the authenticated, version-bound local API. It never writes canonical SQLite
directly. Stable operation IDs make an ambiguous API response safe to reconcile,
but there is no bulk transaction or automatic rollback. The crawler does not
create a backup or restore one for you.

One invocation ingests at most 250 already staged, MMR-selected candidates before
continuing the crawl. After every 25 newly staged candidates, it selects and
imports another small block, and a final bounded pass handles remaining staged
work when the frontier or campaign cap is reached. All passes share a total
ceiling of 500 accepted ingestions per invocation; reaching it stops the run with
`apply-limit`. Rerun `-Apply` to continue the remaining staged ledger. A large
5,000-page campaign therefore normally needs multiple apply invocations because
canonical Topic regrouping grows with the catalog. The dashboard shows accepted
canonical ingestions, while preview staging remains separate.

The 2026-10-12 planner optimization removes repeated exact comparisons without
changing grouping rules or the ten-second planning budget. Restart the updated
local service before retrying a run stopped at the older planner's work budget.
Restarting just the PowerShell crawler does not reload backend code.

Ctrl+C and an expired `-MaxMinutes` stop further imports. Already staged work is
retained and is selected at the beginning of the next `-Apply` invocation.

If the machine reboots, Ctrl+C stops the run, or an optional time cap ends, rerun
the same command. Queued and staged work resumes from:

`apps/local-service/data/topic-crawler.sqlite`

Do not delete that Git-ignored file as routine cleanup: it is how the crawler
knows what it has already seen. An interrupted fetch is conservatively terminal
rather than silently revisited. A staged item interrupted during API submission
retains its stable operation identity for safe reconciliation on the next apply.

## What leaves the computer and what persists

The crawler contacts only the packaged manifest's exact HTTPS origins and paths
reached from its exact seeds. Extracted links cannot change origin, including to
another Wikimedia language or property. It sends a fixed crawler user agent and
static content accept headers, with no cookies, credentials, browser history or
private page context. It also requests origin policy files such as `robots.txt`
and `/.well-known/tdmrep.json`. It does not use a search engine,
ChatGPT/provider research, a site account or JavaScript browser rendering.

For the built-in campaign, a URL must also be exactly under
`/wiki/<main-namespace-title>`, and a decoded title containing `:` is rejected.
That keeps User, Talk, Special, File, Category and comparable community/admin
namespaces out of the frontier. The four allowlisted origins still expose a large
range of encyclopedia articles; this is not a fixed link list.

Raw response bytes and the bounded extracted text exist only in crawler-process
memory. They are discarded after policy checks, fingerprinting and local E5
inference. The crawler state can contain queued/staged public URLs and titles,
URL/content digests, local E5 vectors, fixed outcome codes, and parsed robots/TDM
policy metadata; it contains no raw article text. Terminal rows redact URL/title
where the state contract permits. Canonical ingestion receives only a sanitized
URL, bounded title, normalized E5 vector and
`crawler-static-html-prefix/v1` provenance. The backend recognizes that
provenance explicitly; the extension's page reader continues to accept only its
two existing browser extractor versions.

The crawler ledger is Git-ignored but not encrypted. It is intentionally limited
to public crawl metadata; keep it in the app-owned `data/` directory and never
commit or publish it.

## Safety and rights behavior

Every request is HTTPS/443 with normal certificate validation. DNS must resolve
only to global public addresses; the chosen address is pinned and checked against
the connected peer. HTTP redirects are revalidated; an HTML `rel=canonical`
declaration is untrusted metadata and cannot create an alias. Exact host and
query-key allowlists prevent a seed from becoming an open-web or SSRF frontier.
Static documents, headers, compression, redirects, links and run time all have
fixed bounds.

The crawler keeps at least 2,000 ms between request starts for each exact origin.
The next-allowed time is durable across restart, and an applicable robots crawl
delay can only increase it. The crawler evaluates `robots.txt` for
`MurmingleTopicCrawler`, negative `X-Robots-Tag` and HTML robots directives, and
TDM Reservation/TDMRep controls. It does not offer an override for a disallow,
`noindex`, `noai`, header-scoped
`notrain`, applicable reservation or malformed/ambiguous policy. `nofollow`
stops link expansion. Only bounded HTML/XHTML page responses can be staged. A
fetch being technically possible is not permission. The built-in manifest records
Wikimedia's public terms and the minimized retained representation; that review
remains narrower than legal advice, per-page suitability or a site-wide licence
claim.

## How topic range is produced

The built-in campaign uses separate knowledge-category buckets. Work is rotated
across bucket, host and path-section deficits. Selection applies the
subject/origin section quota described above as well as the host and bucket limits.
Normalized URLs, revalidated HTTP-redirect aliases, exact content hashes and
near-duplicate fingerprints remove repeats. A deterministic MMR-style selection
then prefers candidates that are locally dissimilar to a bounded recent ingested
sample and candidates already picked in the current pass, while filling
category/host/section deficits.

This improves range; it does not validate semantic Topic quality. Apply is serial
against the service's global version, and the current matching policy can make a
provisional grouping that later needs manual correction. Applying thousands of
candidates may take substantial time because current canonical Topic regrouping
work grows with the catalog. Resume through repeated bounded `-Apply` runs from
the fixed ledger instead of starting parallel crawlers. Do not describe this as
high-throughput ingestion, complete subject coverage or calibrated clustering.

## Generation changes

The crawler state is bound to the canonical generation. After an explicit
canonical reset/replacement, the normal command stops instead of mixing campaigns.
Only after reviewing that reset may you run preview with the explicit recovery
flag:

```powershell
.\apps\local-service\ops\crawl-topics.ps1 -RebaseState
```

Rebasing abandons pending/staged work and adopts the new generation. It does not
restore canonical data, recreate deleted Topics or authorize revisiting terminal
pages. Run preview again before any later `-Apply`.

## Expert manifest reference

[`crawler-manifest.example.json`](./crawler-manifest.example.json) documents the
strict JSON shape. Its hosts are reserved example-domain placeholders; they are
not approved campaign origins and imply no permission. Normal use does not edit
or pass this file because the wrapper supplies the reviewed built-in campaign.

The strict schema parser used by review/tests accepts an object with exactly
`schema`, `rightsAcknowledged` and `buckets`. Every bucket has exactly:

| Field | Contract |
| --- | --- |
| `id` | Unique 1-64 character lower-case ASCII identifier; starts/ends alphanumeric, with internal `.`, `_` or `-` allowed. |
| `rightsBasis` | Non-empty, human-reviewed basis, at most 500 characters. |
| `maxPages` | Integer from 1 through 10,000. |
| `allowedHosts` | 1-64 unique lower-case exact DNS hosts; subdomains are not implicit. |
| `allowedQueryKeys` | 0-32 unique exact functional keys; known tracking keys are stripped first and other keys are rejected. |
| `seeds` | 1-128 unique HTTPS/443 document URLs on an allowed host. |

`schema` must be `murmingle-crawl-manifest/v1` and
`rightsAcknowledged` must be `true`. Extra fields fail validation. That boolean
records deliberate operator review; it neither discovers rights nor overrides
site policy.

The current PowerShell wrapper intentionally has no `-ManifestPath` or origin
parameter. Adding a real custom manifest is a separate code and trust review; do
not replace the example and assume it has become an approved campaign.

## Common failures

- **Service/token failure:** keep the service running and enter the same current
  pairing capability at the hidden prompt. Follow the durable-pairing procedure
  if it has genuinely been lost; do not expose or rotate it merely for logging.
- **Embedding assets unavailable:** install/verify the repository's already pinned
  E5 assets through the existing approved asset procedure. The crawler will not
  download a replacement or fall back to a provider.
- **Few staged candidates:** robots/TDM controls, static-text minimums, duplicate
  detection, host/section/bucket caps and existing canonical URLs legitimately
  reduce the result.
- **Generation mismatch:** investigate the canonical reset/replacement first.
  `-RebaseState` is explicit and is not data recovery.
- **State locked:** another crawler process is active. Do not kill an unrelated
  process or copy/write either SQLite database directly.

See [ADR-102](../../../decisions/ADR-102-owner-local-public-topic-crawler.md) for
the authority and non-goals.

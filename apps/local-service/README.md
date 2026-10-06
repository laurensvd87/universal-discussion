# Local service

Local, service-owned prototype state for Sources, vectors, Topic links,
Topics, Discussions and human/AI-assisted Contributions. S3a adds a deliberately started
loopback listener around the reviewed S1/S2 application. Imports have no listener
or database side effects. Default tests deny sockets, DNS, fetch and subprocesses.
The owner approved ADR-016's exact local S3 activation package on 2026-09-28.
Extension 0.6.0 pairs with this service and adds owner-approved on-device page
matching to the local human discussion
loop; see the [browser instructions](../../spikes/topic-resolution/browser/README.md).
See
[the S1/S2 review](../../research/S1_S2_REVIEW_2026-09-28.md) and
[current handoff](../../plans/IMPLEMENTATION_HANDOFF.md).

Extension 0.9.0 adds the owner-approved bounded generic article fallback (ADR-021).
Restart this service as well as reloading the extension: ingestion/persistence
now explicitly accept `main-text-prefix/v1` and `article-container-prefix/v1`
under the same unchanged E5 transform. Unknown extractors/models stay rejected.
That 0.9.0 change preserved existing SQLite data, Topic links, comments and
manual corrections without a reset, model installation or additional listener.
ADR-023 now performs the versioned migration described below.

Requirements: Node.js 24 or newer. No package installation is needed.

## Opt-in live Insight quality probe

`harness/run-live-insight-qa.js` is a developer-only, owner-approved one-shot
probe of the ChatGPT Insight adapter using a fixed public MDN article. It is
not part of normal service startup or the extension. Stop the local service
first, then run from this directory:

```sh
node harness/run-live-insight-qa.js --run-live --model <listed-model-slug> --show-result
```

For the separately approved controlled related-text check, explicitly add
`--with-related-text`. That selects public PEP 8 as the current page and
PEP 257, PEP 20 and PEP 7 as the only related candidates. The probe uses the
extension's bounded anonymous related-page reader and stops before a Responses
request unless at least one excerpt was obtained. Count-only output reports
the number and total characters of included excerpts; `--show-result` adds a
bounded private result preview and only validated PEP citation URLs.

```sh
node harness/run-live-insight-qa.js --run-live --model auto --with-related-text
```

It refuses an occupied fixed port, restores the protected local ChatGPT grant,
and checks that the model is on the account's list. `auto` prefers a listed
Luna model, then falls back to the last listed model. It fetches the signed-out
page without cookies and sends at most one Responses request. There is no
retry, Share, SQLite/catalog read or saved answer. Omit `--show-result` for
count-only output. The HTML
main-region extractor approximates public page prose; it cannot prove what
the Chrome reader displayed. This is a backend/prompt quality check, not a
full popup end-to-end test. The owner-approved ceiling is two deliberate
live Responses requests per relevant Insight change, with no private-page
material. Restart the normal local service when finished.

## Content-free insight trace

The interactive backend terminal prints one `INSIGHT_TRACE` JSON line when an
explicit Create insight request reaches the bounded Responses SSE parser. It
lists recognized event order/counts, item type/status/index, terminal output
shape and the exact local rejection boundary. It contains no provider/page
text, URLs, IDs, tokens, account/model, raw headers or usage counts, and is
not written to a file or SQLite in normal mode. An earlier HTTP/format/timeout
failure still has only its fixed result code.

For the owner-approved local debug mode, stop the service and restart it with
`node src/cli.js --origin chrome-extension://<your-extension-id> --debug-insight-raw`.
The terminal prints exact locations for `insight-trace.log` and
`exchanges.log` under the current user's OS temp folder. The latter contains
the actual bounded ChatGPT insight request envelope (including the sent page
prefix and context links) and successful bounded Responses body/status/media
type; it does **not** contain authorization headers or other browser traffic.
It is disabled by default, capped at three requests and 1 MiB across restarts,
and may contain sensitive text. Do not share or commit it; delete it after
diagnosis. Normal use needs no debug flag. See [ADR-030](../../decisions/ADR-030-owner-opt-in-raw-insight-debug.md).

## Durable local pairing (0.12.12)

Stop the old service first. In an interactive terminal, run
`node src/cli.js --origin chrome-extension://<your-extension-id> --pairing-init`
from this directory. Copy the one-time token directly into the extension's
**Connect local service** field; never send it in chat or a bug report. Then
start normally with `node src/cli.js --origin chrome-extension://<your-extension-id>`.
Initialization succeeds only when no pairing record exists. For a changed
extension ID, lost token or deliberately invalidated copies, stop the service
and use `--pairing-rotate` with the new Origin; this makes previous tokens
invalid. `--pairing-revoke` invalidates all copies for the current Origin until
a later explicit rotation. Administrative commands claim the fixed port first
and fail if another service/admin is using it. The startup command no longer
prints a new token. The ignored `data/pairing.json` stores a verifier, not the
bearer; keep this PC's browser profile and service data private. **Forget
connection** removes only this browser's token, not other copies or discussion
data. A service outage preserves the saved token; a confirmed 401 clears it.

The approved insight fallback accepts one fully finalized, identity-consistent
assistant message as a private draft only after a valid terminal completed
stream when the terminal output omitted that item. It rejects contradictory
finalized parts/items, failures, incompletion and refusal, and never imports
deltas or automatically retries. No successful live owner insight is claimed.

## ChatGPT insights (0.12.5)

The normal CLI now composes the owner-approved optional ChatGPT connector.
Starting the service does not contact a provider. Connect/model-list/research
actions are explicit; no API key or ChatGPT browser automation is used. Follow
the [extension workflow](../../spikes/topic-resolution/browser/README.md#chatgpt-insights-0125).

Paired `/v1/ai/` routes expose connection status, authorization, disconnection,
the account model list and bounded insight jobs. Only `/auth/callback` is an
unpaired OAuth callback, with exact Host, state/nonce/PKCE and verified token
claims. It returns generic HTML; no code or account information is reflected.
Both use the existing `127.0.0.1:4174` listener. Imports/default dormant composition
still have no provider network capability.

Access/ID tokens are process-memory only. On Windows, a rotating refresh token
may be protected under the current OS user for restart; on other systems or
without secure storage, restart requires reauthorization (ADR-027).
The ignored `data/chatgpt-registration.json` contains the stable installation ID
and non-secret account mapping (client ID, subject, email/label), not tokens.
Disconnect clears tokens/jobs and attempts provider revocation; it does not erase
that registration or deliberately shared comments. Local filesystem protection
is not encryption. Do not upload the data folder or place it in a shared location.

An identity-only sign-in can show the account as connected without permission
to use ChatGPT plan inference. Model listing and research remain unavailable in
that state; the owner may deliberately use **Continue with ChatGPT** again to
request plan consent. Temporary refresh failures preserve the local connection
for a later explicit attempt. Unusable refresh credentials are cleared. Neither
path starts research automatically.

The first owner login reached `/auth/callback` but failed later, before a
verified connection. The callback page now says that receiving the redirect
is not completed authorization. Authenticated `/v1/ai/status` may include a
fixed `failureStage` alongside `connection-failed` so the owner can report a
short code after a fresh attempt. Stages are process-memory only; callback
URLs, authorization codes, tokens and provider response bodies are never
returned in status or written to logs. The exact live failure remains unknown.
Version 0.12.3 also reports a fixed `failureSubstage` when identity verification
fails: signing-key fetch/shape, token header, matching key, signature or claims.
It accepts an exact one-item audience array containing this client ID; it still
rejects multiple audiences and preserves signature, issuer, nonce and time checks.
The new diagnostic does not prove which check failed in the owner's earlier
attempt. Report only the short substage code, never an authorization URL or token.

Version 0.12.5 adds a separate fixed result for a failed, owner-clicked model
catalog read: access rejected, rate limited, timed out, invalid response,
provider unavailable or another AI request busy. These categories are derived
locally from known internal errors; raw provider responses, credentials and
request identifiers are not returned. A successful list still returns only
`{models}`. Model listing now has a 25-second service deadline (30 seconds in
the extension); research keeps its 90-second deadline. No automatic retry or
fallback is added, and an unknown failure still returns a generic error.

An insight request temporarily relays up to 4,096 reviewed public-page characters,
bounded source descriptors and optional human discussion excerpts to OpenAI.
It does not store article text or private results in SQLite. Completed results
expire after two minutes, or are purged when consumed/cancelled/disconnected;
request IDs cannot replay. One research operation at a time, five starts per
rolling hour per process, bounded stream/output and a 90-second deadline; restart
resets that local limiter. Provider retention and usage rules still apply.

`share-insight` is an explicit root-only command. It derives the fixed agent
author and human demo operator server-side, uses the existing revision and source
anchor checks, and preserves that distinction during edits/withdrawals/regrouping.
Pasted or edited answers have unverified manual-import provenance, not a verified
claim about a particular provider/model. Only deliberate shared text and ordinary
discussion metadata persist. No remote publication occurs.

Offline transports test the connector without any actual account or provider
call. Live model/web-research availability and useful answer quality are not yet
established. [ADR-024](../../decisions/ADR-024-local-ai-insights-and-chatgpt-poc.md)
records the limits and remaining gates.

The separately approved [embedding experiment](experiments/embeddings/README.md)
has isolated dependencies and ignored assets. It is not loaded by this service.
`npm run test:embeddings` runs its synthetic, network-denied tests without any
model download or runtime installation.

```sh
cd apps/local-service
npm test
```

The bundled vectors are hand-authored synthetic coordinates. They demonstrate
ranking wiring only; they are not learned embeddings or matching-quality evidence.
The service never fetches a Source URL. Its application views omit vectors and
similarity scores.

The service provides:

- an in-memory and a transactional SQLite repository over the same versioned
  aggregate contract;
- human root/reply/edit/withdraw commands with ownership and stale-write checks;
- catalog, separate fixture/learned related ranking and projected discussion DTOs;
- ADR-018 ingestion of URL/title/384D browser-derived vectors, ADR-023 adaptive
  experimental Topic grouping, source-anchored subthreads and explicit
  correction/forget/deletion commands;
- a transport-neutral `/v1` request handler with exact Host, bearer, optional
  exact Origin, CORS preflight, size and route validation;
- dormant composition plus a bounded, explicitly started HTTP transport.

Bodies support line breaks/tabs. State is capped at 8 MiB and discussion views at
1 MiB. Until pagination is added, a write that would exceed those limits returns
capacity without changing the stored state. Existing text remains readable and
can be withdrawn. Application mutation results contain only version and IDs;
internal snapshots and revision history are not returned to callers.

## Owner-local page matching (ADR-018)

The service receives only a normalized eligible URL (2,048 characters), short
title (200), a 384D unit vector in `e5-small-q8-browser-main-prefix-v1`, extractor
version and bounded operation ID. `POST /v1/sources/ingest` also requires the
current `{generation, revision}` in `expected`. No page-body field is accepted;
this background-matching route has no server inference, URL fetch or provider.
The separate explicit ChatGPT insight action is described above. The browser model
space remains distinct from the earlier Node experiment.

One current vector/title/link and current operation receipt per Source persist
in SQLite until deletion. There is no visit history. The catalog is capped at
100 Sources including fixtures, 100 Topics and the existing 8 MiB aggregate.
At capacity, writes fail visibly; nothing is silently evicted.

ADR-023's `adaptive-supported-partitions/v1` policy is an experimental local
heuristic: sparse candidate joins require complete-link cosine >=0.90 and a
>=0.04 advantage over the closest outside member. A supported split requires
two independent, internally cohesive groups; duplicate-like pages do not count
as independent support. Such a split keeps a tighter >=0.94 boundary through a
bounded `retainTight` flag on its learned Topics, including after support is
removed. Incoherent old provisional groups may split. Explicit manual Source
links stay pinned and cannot expand automatically. Related-reading suggestions
still use >=0.85. These cutoffs are not semantic equivalence, event/stance
verification, confidence or real-page matching-quality evidence. The earlier
`provisional-all-source-cosine/v1` receipts and stored records remain valid.
Unknown extractor/model/policy versions remain rejected; scores/vectors never
appear in display DTOs.

New `create-root` and `reply` commands may include `originSourceId` (omitted or
`null` means no page origin). The server accepts only an existing Source linked
to the command's current Topic/Discussion. A root started from that Source keeps
a local Source anchor; replies can name their own page but always follow their
root's destination. A Topic-only root stays pinned. A visible post's discussion
DTO includes optional `origin: {sourceId, url, title}` from its still-retained
Source; a moved visible root also has `regrouped: true`. Deleted, legacy and
unlinked posts have no invented origin. The link points to the current live page,
not an archived copy. The service does not fetch it.

Grouping, Source links and whole root/reply routing update together in one
versioned SQLite transaction. A changed stored URL/vector/extractor representation
pins older anchored roots at their last Topic before the Source is regrouped;
the short display title alone does not freeze them. The stable Source stamp
cannot reconstruct earlier page content. Manual correction moves still-anchored
roots and replies; stale expected revisions reject writes aimed at an old
destination. IDs, authors, bodies and reply topology remain stable.

Versioned `/v1/commands` types: `correct-source`, `forget-source`,
`delete-learned-topic` and `clear-learned-data`. Forget removes a Source and its
vector/receipt/link, removes every post-origin reference to it, and pins dependent
roots at their current Topic while keeping comments. Root withdrawal purges its
origin and pins the surviving reply tree. Deleting a learned Topic removes its
linked learned Sources and currently projected discussion. Clear learned data
also removes learned-origin roots that were manually moved into a fixture/manual
Topic; unrelated fixture/manual comments remain. Both destructive discussion
actions require exact visible
confirmation. The extension pauses processing first; version checks fence late
ingestion. None of this encrypts the local database or promises forensic erasure.

On first open, a strict `demo-state/v1` SQLite aggregate is atomically migrated
to `demo-state/v2` with revision +1. Old roots and all their replies remain pinned
to their existing Topic; the migration does not guess a Source from text or
membership. A corrupt/unknown old record or failed migration rolls back and
fails closed, without reset, reseeding or dropped posts. Use a current expected
version after migration before posting.

This approval covers one owner and public enabled sites on this PC, not private
messages, a remote service, real accounts, external testers or publication.

The fixture and ranker adapters import the pure modules under
`spikes/topic-resolution/browser/`; keep those files alongside this package when
running it from a checkout. There is no separate package build or model runtime.

The default `test` command is the offline S1/S2 suite. It imports the repository's
capability-denial harness, so a socket, DNS lookup, fetch or subprocess causes a
failure. The app-owned `data/` directory is ignored. Removing its database while
the app is stopped is the explicit recovery for an unknown/corrupt local schema;
the service never silently overwrites one.

Start in your own interactive terminal, using the exact Origin shown for your
unpacked extension at `chrome://extensions`:

```sh
npm start -- --origin chrome-extension://<32-letter-extension-id>
```

The CLI accepts only that single Origin setting. It creates the fixed app-owned
`data/demo.sqlite`, uses cryptographically random IDs and a fresh 256-bit pairing
token, and binds only `127.0.0.1:4174`. An occupied port fails; it never falls back
or kills another process. Startup reveals the token once in that terminal. Copy
it manually into the extension pairing field; do not paste it into chat, logs,
URLs or files. Redirected/noninteractive startup is refused. A service restart
requires new pairing. Ctrl+C or SIGTERM closes its listener and SQLite connection.

Requests require exact Host and bearer; a supplied Origin must match the
configured extension. Preflight requires that Origin. The transport rejects all
duplicate headers before collecting the body, caps headers at 16 KiB/32 fields,
request bodies at 64 KiB, and connections at 16. A connection and its request have
a five-second absolute deadline; responses close the connection. UTF-8 JSON is
the only mutation format. There is no LAN listener, URL fetch, telemetry, model
download or arbitrary path endpoint. Pairing is a local demo capability; the
synthetic actor selector is not production authentication.

Use deliberate synthetic demo text only; never enter real secrets or private
page material. Text persists until withdrawal/reset or explicit database removal.
Withdrawal removes all stored revisions of that item. Logical deletion does not
promise forensic erasure of SQLite journals or operating-system backups. To reset
through the API, POST `/v1/demo/reset` with the current expected version and exact
confirmation `RESET DEMO STATE`; reset rotates generation. To remove/recover a
database manually, stop the service and delete only its app-owned `data/` files.
Unknown/corrupt schema fails closed and is never automatically overwritten.

The six original Harbor Sources remain unchanged. Two new project-created
reserved-domain Sources (`reserved-example-com`, `reserved-example-org`) share
the `reserved-domain-demo` Topic through explicit fixture links. Both have null
embeddings, so they make no similarity claim about Harbor. Their provenance is
`project-created-reserved-domain-bridge/1`. Existing databases preserve their
stored catalog on reopen; use explicit reset if a pre-bridge database lacks them.

`npm run test:integration` invokes a separate bounded loopback suite. Its own
capability guard permits sockets only on `127.0.0.1:4174` and still denies DNS,
Internet fetch, TLS, datagrams and subprocesses. It uses temporary SQLite databases
and injected test tokens, prints no production token, and closes only its own
listeners. Do not run alongside your demo service; the fixed port must be free.
The default offline harness is unchanged. S3a evidence: 51/51 offline
tests pass; secret scan covers 30 files with zero findings and six self-tests.
The parent's separate transport/security pass returned qualified GO for the
approved integration tests. Actual loopback suite: 2/2 pass, covering the live
Host/token/Origin matrix, narrow preflight, duplicate and excessive headers,
fixed/chunked body caps, the absolute deadline, CRUD/conflict/persistence, occupied
port failure, restart pairing invalidation, withdrawal and reset. Node's numeric
bind calls `dns.lookup`; the integration guard supplies only `127.0.0.1` directly
without invoking DNS. The suite closed its own listener and removed its temporary
databases. Separate actual-Chrome evidence covers the client integration;
see the [S3 review](../../research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md).

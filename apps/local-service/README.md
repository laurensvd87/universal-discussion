# Local service

Local, service-owned prototype state for Sources, fixture vectors, Topic links,
Topics, Discussions and human Contributions. S3a adds a deliberately started
loopback listener around the reviewed S1/S2 application. Imports have no listener
or database side effects. Default tests deny sockets, DNS, fetch and subprocesses.
The owner approved ADR-016's exact local S3 activation package on 2026-09-28.
Extension 0.5.0 now pairs with this service and exposes the local human discussion
loop; see the [browser instructions](../../spikes/topic-resolution/browser/README.md).
See
[the S1/S2 review](../../research/S1_S2_REVIEW_2026-09-28.md) and
[current handoff](../../plans/IMPLEMENTATION_HANDOFF.md).

Requirements: Node.js 24 or newer. No package installation is needed.

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
- catalog, fixture-only related ranking and projected discussion DTOs;
- a transport-neutral `/v1` request handler with exact Host, bearer, optional
  exact Origin, CORS preflight, size and route validation;
- dormant composition plus a bounded, explicitly started HTTP transport.

Bodies support line breaks/tabs. State is capped at 8 MiB and discussion views at
1 MiB. Until pagination is added, a write that would exceed those limits returns
capacity without changing the stored state. Existing text remains readable and
can be withdrawn. Application mutation results contain only version and IDs;
internal snapshots and revision history are not returned to callers.

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

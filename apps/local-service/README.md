# Local service

Local, service-owned prototype state for Sources, fixture vectors, Topic links,
Topics, Discussions and human Contributions. It is deliberately not a reachable
server yet. S1/S2 tests run in a process that denies sockets, DNS, fetch and
subprocesses.
The implementation review is complete; the owner approved ADR-016's exact local
S3 activation package on 2026-09-28. S3 is ready for implementation, not already
connected. See [the review](../../research/S1_S2_REVIEW_2026-09-28.md) and
[current handoff](../../plans/IMPLEMENTATION_HANDOFF.md).

Requirements: Node.js 24 or newer. No package installation is needed.

```sh
cd apps/local-service
npm test
```

The bundled vectors are hand-authored synthetic coordinates. They demonstrate
ranking wiring only; they are not learned embeddings or matching-quality evidence.
The service never fetches a Source URL. Its application views omit vectors and
similarity scores.

S1 and S2 currently provide:

- an in-memory and a transactional SQLite repository over the same versioned
  aggregate contract;
- human root/reply/edit/withdraw commands with ownership and stale-write checks;
- catalog, fixture-only related ranking and projected discussion DTOs;
- a transport-neutral `/v1` request handler with exact Host, bearer, optional
  exact Origin, CORS preflight, size and route validation;
- a dormant composition entry point. It creates no HTTP server and binds no socket.

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

`npm run test:integration` is still an intentional failing placeholder. The
approved S3 block may replace it with actual bounded loopback tests, separately
invoked from the socket-denied default suite. There is currently no listener to
start; approval alone has not changed runtime capabilities.

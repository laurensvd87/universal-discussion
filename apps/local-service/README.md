# Local service

Local, service-owned prototype state for Sources, fixture vectors, Topic links,
Topics, Discussions and human Contributions. It is deliberately not a reachable
server yet. S1/S2 tests run in a process that denies sockets, DNS, fetch and
subprocesses.

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

The default `test` command is the offline S1/S2 suite. It imports the repository's
capability-denial harness, so a socket, DNS lookup, fetch or subprocess causes a
failure. The app-owned `data/` directory is ignored. Removing its database while
the app is stopped is the explicit recovery for an unknown/corrupt local schema;
the service never silently overwrites one.

`npm run test:integration` is an intentional failing gate reserved for actual
loopback tests after the ADR-016 activation package is reviewed and explicitly
approved. There is currently no listener to start.

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

The default `test` command is the offline S1/S2 suite. `test:integration` is
reserved for actual loopback tests after the explicit ADR-016 activation approval;
do not run or populate it before that gate.

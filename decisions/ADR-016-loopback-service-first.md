# ADR-016: Local service first, thin extension client

Status: Adopted architecture under the owner's 2026-09-28 instruction. The exact
local S3 activation package below is explicitly owner-approved on 2026-09-28.
S1/S2 are implemented offline: domain, SQLite and an in-process request handler.
No listening server, client networking, model or permission is activated.
Continuation: the 2026-09-28 implementation review accepted the corrected offline
core. See
[the review record](../research/S1_S2_REVIEW_2026-09-28.md). The correction keeps
the existing 1 MiB response budget by rejecting growth before commit and shares
the 8 MiB snapshot/version contract across both repositories. It grants no new
data, network or permission scope.

Approval record: after the review, the owner answered **"ja"** to the explicit
request for the local connection, session-only pairing, required permissions and
tests, synthetic/demo payload and retention until manual deletion. This satisfies
the S3 owner gate below; it is not evidence that S3 is implemented or tested. Do
not request the unchanged package again. Later expanded-data/model/provider/
deployment/spending/publication gates remain in force.

Date: 2026-09-28

## Decision

The owner wants embeddings, linked pages and application state on a local server
now, so later hosting does not require moving business logic out of the extension.
They defer external search and request a cheaper implementation model with clear
return-to-GPT-6-Astra checkpoints.

Use one Node.js service owning the Source catalog, embedding records, candidate
ranking, confirmed Source-to-Topic links, Topics, Discussions and Contributions.
The extension handles permitted context observation and UI through a versioned
JSON API. Mobile clients will reuse the application API with different capture
adapters. No microservices or vector database for this prototype.

The first code block uses bundled synthetic Sources/vectors and deliberately
entered demo text only. It performs no real model inference. Model acquisition,
runtime/assets/license and real-page input retain their exact approvals. Future
private-body embeddings may still run on the end-user device: service-owned
matching does not authorize uploading private bodies/vectors when hosting begins.

## Engineering defaults

- `apps/local-service/`: JavaScript ES modules; domain/application, repository,
  embedding and HTTP adapters. Node 24.19.0 is the checked local runtime.
- Memory repository for pure tests; SQLite for local durable state, behind the
  same repository contract. Use built-in `node:sqlite`, transactions and prepared
  statements, no ORM. This module has release-candidate stability, not fully
  stable status; pin/revalidate before hosting. No production database selected.
- Reuse the existing pure candidate ranker behind one server adapter; do not
  duplicate it or use frozen resolver/review machinery as writable product state.
  The old offline panel stays diagnostic; new app results come from the service.
  No canonical IndexedDB discussion/vector store in the extension.
- A server embedding adapter will compute versioned vectors from approved
  descriptors. Initially it reports `model-unavailable` or uses explicitly
  labelled fixture vectors. No fake learned embeddings or automatic Topic joins.
- `/v1` JSON is the portability boundary. Future hosting still needs TLS, real
  identity/authorization, operations and privacy/deployment/spending approvals;
  it is not merely changing the server URL. Phone `127.0.0.1` is the phone itself,
  not the developer's PC; LAN/tunnel/mobile-connected tests need a later boundary.

## Activation package — owner-approved 2026-09-28

S1/S2 implementation and Astra review are complete. S3 implementation and its
bounded loopback/browser tests may now proceed within this approved package:

| Item | Approved local-only scope |
| --- | --- |
| Listener | `127.0.0.1:4174` only; no wildcard/LAN/tunnel/proxy; fail if occupied. Fixture server stays 4173. |
| Client identity | Exact Host and per-process random bearer token on every actual endpoint. Validate any supplied Origin against one configured unpacked extension; reject null/web/other. Absent Origin still needs the token; preflight needs the configured Origin. No cookies or Origin-only authentication. |
| Pairing | Developer manually copies a token into the extension. Only extension `storage.session`, trusted extension contexts; no local/sync/disk token storage. Restart invalidates pairing, no idle timeout. Not real login. |
| Permissions | Add `storage`, narrow loopback host permission and exact-port CSP/client target restriction. No general browsing host permissions. |
| Payload | Bundled Source/Topic IDs, synthetic actor context, explicit demo contributions and versioned commands; no captured URL/title/metadata/body or real private material. |
| Disk retention | Only app-owned `apps/local-service/data/demo.sqlite`, ignored by git, retained until explicit local delete/reset; all revisions removed on withdrawal. No sync, backup or export. |
| Network | Extension-to-local-process HTTP only. No Internet/DNS fetch, providers, model downloads, arbitrary URL requests or telemetry. Local HTTP is still a data transfer, not "zero egress". |
| Controls | Bounded JSON/routes/methods/size/time, exact token/origin/Host rejection tests, transactional expected-version writes/reset, sensitive-data-free errors/logs. |
| Limits | Local developer only. Synthetic actor selector is not authentication; logical deletion is not forensic erasure of journals/OS backups. |

Generate the token per process; reveal it only once in the developer's local
startup terminal for pairing, never in agent/chat output, request logs, URLs,
git or errors. Integration tests inject in-memory test tokens and suppress
startup output. No listener side effect on import. Unknown/corrupt schemas fail
closed instead of being overwritten automatically.

Owner approval is recorded above. Review the new transport/permission changes
with a separate Trust/Quality engineering pass before activation and verify them
in the approved tests; the S1/S2 review does not certify unbuilt S3 code. This is
an engineering checkpoint, not another vote on the unchanged approved package.
Real captured page data, wider permissions, remote recipients or hosted
deployment need a new explicit decision. At those later gates the implementing
agent must stop and ask; neither this approval nor a model switch grants them.

## Supersession and handoff

Supersedes ADR-014's IndexedDB-first canonical demo store and the client-first
placement of future matching in ADR-015. Product, no-auto-merge, privacy,
publication/provider and evaluation gates remain. External web search is parked,
not a dependency for the local service or embedding experiment.

Execution, API defaults, tests and model-switch rules are in
[the implementation handoff](../plans/IMPLEMENTATION_HANDOFF.md). The first
cheaper-model block, Astra review and owner activation approval are complete.
The next cheaper-model block is S3: listener, pairing, thin client and human
discussion UI. After integration, return again before real model/input decisions.

## Evidence and residuals

Read-only probe: Node v24.19.0 opened/closed an in-memory `DatabaseSync`; SQLite
reported 3.53.3. No disk database/server was created.
[Official Node 24 docs](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
mark the module release-candidate. This proves availability, not durability,
security or hosting readiness. The current extension remains offline 0.4.0.
S1/S2 evidence is recorded in `plans/STATUS.md`; listener/client activation is
approved but not yet implemented. S3 needs its own transport/browser evidence.

# Implementation handoff: local-service discussion MVP

Prepared: 2026-09-28. **Orchestration complete for the next coding block.**
Code baseline: `9e48916`, offline extension 0.4.0. Inspect current git state first.
Next task: **S1**. No server/product implementation occurred in this handoff.

## Authority and reading

Read [STATUS](STATUS.md), [ROADMAP](ROADMAP.md),
[ADR-016](../decisions/ADR-016-loopback-service-first.md),
[ADR-014](../decisions/ADR-014-product-first-rebaseline.md),
[ADR-015](../decisions/ADR-015-related-pages-first-utility.md),
[product](../docs/PRODUCT_SPEC.md), [domain](../docs/DOMAIN_MODEL.md),
[AI economics](../docs/AI_AGENTS_AND_ECONOMICS.md) and relevant
[lifecycle requirements](../docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md).
Use [team roles](../agents/TEAM.md), not a newly invented organization.

Latest owner direction supersedes the IndexedDB-first approach: **catalog,
embeddings/matching, Topic links and discussions live on a local server; the
extension is its client.** External web search/provider choice is parked. Do not
build hidden Google searches or revisit search pricing as a prerequisite.
Do not restart Phase 0, the P1.7 questionnaire or the finished 6/6 owner review.

## Frozen engineering defaults

- Node 24.19.0, JavaScript ES modules, built-in HTTP/SQLite/test APIs. No framework,
  ORM, package installation, container or cloud requirement for the first block.
- Add `apps/local-service/{src/domain,src/application,src/adapters,src/http,test}`
  with its own package scripts/README. Domain logic has no browser/HTTP/SQLite/
  provider imports. Repository and embedding adapters are replaceable seams.
- Memory and SQLite repositories share one contract. SQLite initially stores one
  bounded versioned aggregate demo-state record; use prepared statements and
  transactions. No independent canonical browser database or resolver rewrite.
- Server ranking may import the existing pure
  `spikes/topic-resolution/browser/core/related-sources.js` through one adapter
  and contract tests. Document that packaging dependency; do not duplicate the
  algorithm or introduce a shared-package build system merely for this step.
- Client UI stays in `spikes/topic-resolution/browser/chromium/`; DTO/controller
  code in `browser/core/`; new English message keys in `browser/locales/en.js`.
  Browser imports remain inside the unpacked extension root.
- The server embedding adapter owns model/version/dimension metadata and vectors.
  Initially use labelled bundled vectors or `model-unavailable`. No model assets,
  genuine inference, private inputs, vectors/scores in UI DTOs or semantic claims.

## Sequential work packages

| Slice | Deliverable | Evidence / gate |
| --- | --- | --- |
| S1 — start here | Pure service/domain, memory repository, API DTOs, synthetic catalog/ranking | Deterministic tests, no I/O |
| S2 — first block | SQLite adapter + in-process secured HTTP handler; listener code dormant | Persistence/conflict/reset and handler rejection tests; no bound socket |
| STOP → Astra + owner | Review S1/S2 and ADR-016 activation package | Explicit permission before listener/client networking or new extension capabilities |
| S3 — after approval | Loopback listener, pairing, thin extension and human discussion UI | Service-to-extension post/reply/edit/reopen/delete loop and real-browser smoke |
| STOP → Astra + owner | Review working local loop; choose exact real model/runtime/license/input experiment | No silent model acquisition/activation or real-page input |
| Later S4 | Private destination, fixture AI preview, filters, local report/block/moderation | Focused lifecycle/publication tests before each control is enabled |

S1/S2 are the immediately executable cheaper-model block, not all of roadmap R1.
Routine naming/CSS/focused fixes do not need owner votes. New capabilities do.
Use one implementation owner and a bounded separate Trust/Quality review, not a
large standing agent team. AI review is not independent-human/legal/store approval.

### S1: service-owned domain and catalog

Version state as `demo-state/v1`, with generation ID and monotonic revision.
Separate Topics, Discussions, Contributions, Sources and confirmed Source links.
Server-generated opaque IDs; injected clock/ID factories in tests. Reuse existing
synthetic Sources and record provenance for new fixtures.

Commands: create Topic, create human root, reply, edit own item, withdraw own item.
Selection is client state; confirmed Source links are server-owned. Two bundled
Sources in one Topic show one Discussion. Related Sources in different Topics
stay separate. New Topics can start without URLs. No arbitrary URL ingestion,
fetching, automatic Topic assignment or global merges.

Contract defaults:

- Topic kinds: `general`, `event`, `product`, `claim`. First block enables only
  local-public human comments; private/draft/agent/moderation commands deny until
  S4. Do not show unfinished controls or imply Internet publication.
- Actor comes from explicit synthetic test context, resolved against a fixed
  server registry. Command payloads cannot select author/type/owner/role. A paired
  developer controls the demo selector; it is not production authentication.
- One root owns each subthread. Replies retain its root ID and optional reply
  target within that same Discussion/root. Reject missing/withdrawn reply targets;
  existing replies survive parent withdrawal. Roots newest-first, replies oldest-
  first, stable ID tie-break. Summary is reserved for root-only S4 use.
- Public edits append revisions and show `Edited`; ordinary views show only
  current text, earlier bodies are owner-scoped. Withdrawal purges every body
  revision/author projection of the item, leaving non-linkable `Deleted` topology.
  No old response/receipt cache may resurrect removed text.
- Prototype caps: ID 128 UTF-16 units, title 200, body 8,000, 100 Topics,
  1,000 Contributions, 50 revisions/item. Reject excess, no silent eviction.
  Validate exact fields, enums, references and versions without sensitive echo.
- Expected generation/revision on every mutation; invalid/conflict commands do
  nothing. Reset rotates generation so old commands cannot target a fresh empty
  state. Reads are immutable projections, never mutable internal objects.

Tests: shared versus related Topic, ordering, forged actor/type, cross-root/
Discussion reply, stale mutation/reset, own/other edit/delete, full revision purge,
surviving replies, mutation isolation, resource limits and unavailable-model state.
Fixture vector retrieval is not trained-embedding quality evidence.

### S2: durable repository and secured handler, no listening yet

App DB: `apps/local-service/data/demo.sqlite`, with data directory gitignored.
Use temporary app-owned test directories for SQLite tests. No paths over the API.
Transactional revision checks prevent concurrent lost updates/deletion resurrection.
Unknown schema/corruption fails closed with explicit reset option, never auto-
reseeding. Failed commits cannot report success. Logical deletion is not forensic
erasure of journals/free pages/OS backups. No backup/export endpoint.

Implement the transport-neutral request handler and dormant startup entry point.
Do not bind a listener on import or run socket integration before the approval
gate. Validate planned `127.0.0.1:4174`, exact Host and one configured unpacked-
extension Origin; no wildcard/LAN/remote URL/automatic port fallback. OPTIONS
validates Origin/method/headers and exposes no app data. Actual endpoints require
a random per-process bearer capability. No cookies or Origin-only authentication.

Exact Host and bearer are mandatory on every application endpoint. If Origin is
present, require the configured extension Origin; reject null/web/other values.
Allow absent Origin only with a valid bearer; do not assume privileged extension
fetches always supply it. Preflight still requires the configured Origin. Local
programs can forge Origin, so it is never authentication. Test absent-Origin
success with a valid token and denial without one. In-process tests inject a test
capability; never print a real token in an agent tool log. Pairing is in ADR-016.

Freeze this small `/v1` JSON contract and test it before client wiring:

| Route | Input / result |
| --- | --- |
| `GET /v1/health` | Authenticated protocol/capability version, no private state |
| `GET /v1/catalog` | Bounded synthetic Source/Topic DTOs, no vectors/private entries |
| `POST /v1/related` | Known Source ID + bounded limit; ranked same/related DTOs |
| `GET /v1/topics/:id/discussion` | Eligible thread view + generation/revision |
| `POST /v1/commands` | Expected version + allowlisted command; durable outcome |
| `POST /v1/demo/reset` | Expected version + explicit confirmation; new generation |

Synthetic actor context is `X-Demo-Actor`, validated by the server registry, not
an arbitrary role/account registration. Responses: 400 invalid, 401 token, 403
Origin/actor/action, 404 unavailable object, 409 stale version, 413 oversize and
generic 5xx. JSON-only mutations, 64 KiB request limit, bounded headers/timeouts/
responses. No GET mutations, SQL/model-path/file endpoints, remote URL fetch,
DNS/Internet requests or providers. Logs/errors exclude tokens, bodies, vectors
and browsing data. Test startup configuration without opening a socket.

Tests: token/Origin/Host denial matrix, preflight, malformed/oversize input, forged
actor, concurrent writes, aborted SQLite transaction, reopen/restart persistence,
unknown schema and reset. In-process handlers run without sockets. Preserve the
old spike's fully network-denied suite. Document a separate loopback integration
suite to run only after the owner gate; never globally weaken the existing guard.

### S3: after explicit loopback/client activation approval

One audited `local-service-client.js` fetches only the fixed endpoint, rejects
redirects, omits cookies and validates DTOs. One `local-service-session.js` uses
`chrome.storage.session` for the pairing token, restricted to trusted extension
contexts. No local/sync token storage or client canonical discussion/vector DB.
Pair once per browser/service session; no idle logout. On token rejection clear
pairing/private views and show disconnected status, not repeated automatic retries.

Only after review/approval add `storage`, narrow loopback host permission and
`connect-src http://127.0.0.1:4174`. Host permission can cover more ports than the
intended one: enforce exact port in client and CSP. Replace the old blanket fetch/
storage ban only for those audited adapters, preserving no-I/O in readers/core.

Opening a paired popup loads catalog/discussion without a second button. Auto-run
the existing exact reserved-domain URL lookup; send only its known fixture Source
ID, never observed URL/title/metadata. Keep MDN/metadata manual, dated and unchanged.
Unsupported context offers manual Topic choice. Server down means honest disabled
writes/disconnected state, not a hidden offline database or fictitious results.

Provide Topic create/select, human root/reply/edit/withdraw and repository counts.
The old bundled 1-human/1-agent indicators stay visibly diagnostic. New source
recommendations come from the service and retain synthetic/model-unavailable labels.
Plain text rendering; English keys; keyboard/focus/status. Warn that deliberate
demo text persists locally and must not include real secrets/private page material.

Cancel/ignore stale requests on tab navigation, actor/Topic change or disposal.
Clear context-derived selection and disable stale submit; preserve typed text only
as detached unsent text, never silently retarget it. Manual selection wins over late
auto-load. Disable duplicate submit; never auto-retry a mutation after ambiguous
disconnect—reload current service state first. Actor changes clear old projections.

Tests: DTO/transport restrictions, pairing denial/restart, service unavailable,
stale responses/submissions, hostile text, keyboard and controller/service flow.
Run actual loopback tests and fresh real-Chromium pairing/post/reply/edit/reopen/
delete smoke before claiming integration verified. Missing smoke is a gap, not a
pass. No repeat of finished 6/6 review or the one-off real MDN exercise.

## Completion and return-to-Astra rules

Create service scripts `test` (no sockets), `test:integration` (gated loopback),
`check:secrets`. The service `test` command uses
`node --import ../../spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none`;
SQLite/filesystem remain available while accidental HTTP/DNS/subprocess use fails.
Keep later loopback cases out of the default test discovery and invoke them only
with the separate integration script. Do not weaken the harness for dormant
listener imports. Cover new source/data
ignores and test-token handling. Existing
spike commands remain: `npm test`, `npm run test:restricted`,
`npm run indicator:test`, `npm run check:secrets`. Baseline counts: 294 normal
(293 pass/one intentional skip), 294 restricted, 112 indicator, 101 scanned files.
New legitimate fixtures may change generated test hashes; never alter the actual
owner ledger. After each slice: focused checks, separate risk review, diff check,
STATUS/README evidence, then commit/push verified in-scope work.

**Stop and tell the owner to switch back to GPT-6 Astra at the first of:**

1. S1/S2 are ready: review handler/security/storage and ask the owner explicitly
   for ADR-016's exact activation package. Do not silently begin socket/client tests.
2. After approved S3: review the usable local loop and propose the exact real
   embedding model/runtime/license/assets/inputs. Do not download/activate it yet.
3. An unresolved architecture/security/privacy issue requires new decisions or
   wider permissions, real inputs, vector transmission, external I/O, dependency/
   database/runtime replacement or weakened isolation/purge tests. Provide a
   failing reproduction and options; stop speculative patch loops.
4. Any provider/account/tester/hosting/spending/publication/store approval gate,
   including the later 200–250-pair provenance-approved review, becomes necessary.

Astra review does not replace owner approval. No independent person is needed
for these local code increments; give a concrete assignment at the later real
evaluation gate. Do not ask the owner to decide every routine engineering step.

Model guidance checked using OpenAI Docs: Sol fits the multi-file implementation;
Luna can handle smaller fully specified subtasks. Availability is whatever the
owner's picker offers; no model/account/permission setting was changed here.
[Official model guidance](https://learn.chatgpt.com/docs/models).

## Copyable owner prompt

> Lies AGENTS.md, plans/STATUS.md und plans/IMPLEMENTATION_HANDOFF.md sowie die
> dort genannten aktuellen Entscheidungen. Implementiere zuerst S1 und S2:
> lokalen Backend-Kern fuer Seitenkatalog, Vektoren/Matching, Topics und
> Diskussionen, SQLite-Persistenz und abgesicherten API-Handler. Aktiviere noch
> keinen Listener, keine neuen Extension-Berechtigungen, keine echte Websuche
> und kein Embedding-Modell. Arbeite in kleinen getesteten Schritten, halte
> Status/README aktuell und committe/pushe passende abgeschlossene Schritte.
> Wiederhole weder Phase 0 noch meinen fertigen 6/6-Review. Sobald S1/S2 fertig
> sind oder vorher eine im Handoff genannte Architektur-/Sicherheits-/Freigabegrenze
> erreicht wird, halte an und sage ausdruecklich: "Bitte jetzt zu GPT-6 Astra
> wechseln." Nenne Ergebnis, Tests, offenen Punkt und naechste Entscheidung.
> S3 mit echter lokaler Verbindung folgt erst nach Review und meiner expliziten
> Freigabe. Keine Handlung hinter einer Freigabegrenze ohne meine Zustimmung.

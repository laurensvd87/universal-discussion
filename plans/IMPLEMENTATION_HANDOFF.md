# Implementation handoff: local-service discussion MVP

Updated: 2026-09-29. **S1–S3, ADR-017 and ADR-018 B1–B5 complete.**

Latest request: implement matching-quality improvements, automatic visits across
sites and pairing across sessions. Read [ADR-019](../decisions/ADR-019-automatic-browsing-and-durable-pairing.md)
first: the exact expanded permission/credential/version package is **proposed,
awaiting explicit owner privacy/security approval**. Do not activate it from the
general outcome request alone. Existing matching already automates visits after
each site's initial grant; the proposed global mode and durable bearer change
ADR-018/016 boundaries. The owner now clarifies session-wide consent rather than
per-site grants: ADR-019 B proposes Start/Stop with an in-memory capture lease
bound to the starting browser window, not capture automatically resumed across
browser sessions. Chrome's broad grant is not natively session-expiring and may
remain after a crash; capture must require a fresh lease regardless. Persistent
pairing is independent and still pending its explicit security approval.
No runtime/data changes were made in this planning turn.
Once approved, use its bounded implementation/review sequence and preserve all
existing discussions, manual links and later gates. Do not restart completed work.

Latest owner direction supersedes the synthetic-only interactive proposal below:
build the actual real-page background-vector/grouping/shared-comment loop, with
asynchronous resolution. [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md)
defines the approved one-time Security/Privacy/Policy package and executable
B1–B5 slices. Do not interpret direction alone as consent to undisclosed broad
permissions or retained URL/title fields. The owner explicitly approved that exact
package on 2026-09-29; work autonomously within it using parallel Sol Medium agents.
Do not repeat its approval. Capture must default off with per-site enablement.
Historical starting baseline: `818dd6e`, reviewed S1/S2 and offline extension 0.4.0.
Inspect current git state first. Extension 0.6.0 adds browser-local E5 and
selected-site provisional Topic resolution to the existing paired human loop.
Actual browser inference and full shared-comment/lifecycle checks pass; see
STATUS and the [ADR-018 review](../research/ADR018_IMPLEMENTATION_REVIEW_2026-09-29.md).
Do not restart B1–B5; owner-local public-site feedback is next. Historical S3 evidence is in
the [S3 review](../research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md) for exact evidence.
Read the [review and concrete S3 handoff](../research/S1_S2_REVIEW_2026-09-28.md).

Owner-feedback patch **0.6.1** added bounded eligibility diagnostics; the owner
confirmed the parent-window focus gate rejects their action-popup interaction.
**0.6.2** adds fresh authenticated popup focus as an alternative foreground
witness, keeping the site/window/navigation/consent restrictions. Actual Chrome
passes 11 checks including an explicitly injected false parent-focus flag.
Real popup ports omit optional sender document IDs; use the reviewed exact-port
identity and trusted-responder invariant in ADR-018, not a fabricated document
join. No new permissions; do not claim the headless regression reproduced their
exact OS focus behavior. The owner then reported `context-unavailable` on 0.6.2.
**0.6.3** fixes that overbroad diagnostic: missing/changed/query-failed windows,
tab query/identity failures, focus expiry/lifecycle changes and page eligibility
are distinct fixed reasons. All capture gates and the 500 ms deadline remain.
Actual Chrome passes 19 injected eligibility/recovery checks, restricted suite
484/484 and indicator suite 302/302. Separate AI Trust review accepts the slice.
The owner now confirms Enable is clickable, but the page remains unsupported.
**0.6.4** fixes a reproduced stale initial-foreground failure and exposes fixed
unsupported reason codes. A fresh eligible status on a previously enabled site
schedules one ordinary fenced refresh; it never retries actual reader rejections.
Full restricted suite 523/523, indicator suite 341/341, actual Chrome 21 checks;
separate AI Trust review accepts the slice. The owner has now supplied
`rights-restricted`: the head-metadata gate is identified, but the exact tag is
not. Read-only synthetic reproduction proved the parser also rejected positive/
unbounded preview declarations. The owner then explicitly directed proceeding
with vector matching under a permission assumption in answer to the reservation
question. **0.6.5** implements the ADR-018 owner-only working-assumption amendment:
remove the current real-page reader's robots/googlebot/TDM metadata veto, including
negative/unknown/malformed signals. No metadata advisory field or backend change.
Retain bounded head/title traversal, public-only per-site consent, visible-region
exclusions, document/focus guards, payload and retention. Existing granted sites
are not reset; new sites are not automatically enabled. The frozen metadata-only
experiment is unchanged. UI states that this is not legal/store clearance.
Do not ask the same policy question again. Broader private/remote/tester/release
gates and applicable policy/legal assessment remain separate. Owner next step:
reload 0.6.5 and retry the enabled public article; another rejection may still
occur. Do not promise all public sites or the particular article will resolve.
Leave the owner's backend, database and profile untouched; no reset/restart is
required. Verification results are recorded in STATUS and the ADR-018 review.
Latest follow-up supersedes that reload request: the owner reports two public
news pages ingest successfully but get separate Topics despite similarity.
Pair-scoped read-only diagnostics find compatible current vectors below the
unvalidated 0.94 cutoff. No product/data changes; see STATUS. Existing URLs keep
their links on revisit, so Retry is not a regrouping command. First-main-region
sampling is a plausible general weakness, not a confirmed fault on these pages.
Assess bounded article-focused input and positive/hard-negative calibration next;
do not lower the global cutoff from one pair or silently merge existing threads.
Manual Source correction is available; comments stay in their original Topic.
Known separate follow-up: a failed `authorized()` observation after reading can
strand `processing/reading` without a new event. It remains safely non-ingesting
but is not fixed by this initial-foreground recovery; see STATUS before changing it.

2026-09-29 continuation: [model options](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md)
and [ADR-017's exact experiment proposal](../decisions/ADR-017-local-embedding-experiment.md)
were explicitly **owner-approved on 2026-09-29**. The owner's global-language/download-size
clarification revised the comparison to compact multilingual static variants
versus E5, not the earlier Granite/E5 pair; see the
[size follow-up](../research/SMALL_EMBEDDING_FOOTPRINT_2026-09-29.md).
ADR-017 alone approved only bounded local acquisition/inference; ADR-018 now
additionally approves its exact browser background matching package. The local
Node process is on-device; future hosting must not silently move raw-content
embedding there. Browser/mobile inference and remote-vector transfer have not
been validated or approved by the synthetic comparison proposal itself.

ADR-017 execution is now complete. Historical narrower proposal, superseded by
the owner's real-page direction and ADR-018 (do not implement as another milestone):
use E5 suggestions in the existing local extension demo, using only the frozen
64 synthetic descriptors. Precompute on this PC; retain generated vectors and
catalog state locally in ignored app-owned storage, preserving existing demo
contributions. The existing paired loopback API carries known Source IDs and
bounded display DTOs, never vectors or observed browsing content. Keep suggestions
distinct from confirmed Topic links, with truthful model/coverage labels and no
automatic joins. No new extension permissions, model download, real-page input,
external search/provider, account, spending, hosting or publication. Ask the owner
explicitly before activation. Browser/mobile inference and general website tests
remain separate future packages; do not imply that this Node experiment proves them.

The owner answered **"ja"** on 2026-09-28 to ADR-016's explicit local connection,
pairing, permissions and test package. Do not ask again for that unchanged scope.
This approval authorizes S3, not later real-page/model/provider/hosting work.

**Current execution workflow:** the owner has now requested GPT-6 Sol Medium
coding subagents under the Astra lead. Pass bounded assignments with explicit
file ownership; the lead reviews security/integration, maintains shared docs and
commits/pushes checked slices. Return checkpoint results to that lead in this
conversation. The manual model-switch prompts below are fallback/historical
instructions only; do not ask the owner to switch while the Astra lead is already
handling the review. Owner consent is still required at every new approval gate.

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
- The server owns model/version/dimension metadata and vectors. ADR-018 adds
  browser-side real inference and local vector ingestion; the server never gets
  raw body text or runs that model. Fixture vectors remain separately labelled.
  Private inputs, vector/score UI DTOs and validated semantic claims stay excluded.

## Sequential work packages

| Slice | Deliverable | Evidence / gate |
| --- | --- | --- |
| S1 — complete | Pure service/domain, memory repository, API DTOs, synthetic catalog/ranking | Deterministic network-denied tests pass |
| S2 — complete | SQLite adapter + in-process secured HTTP handler; composition remains dormant | Persistence/conflict/reset and handler rejection tests pass; no bound socket |
| Review + owner gate — complete | Corrected S1/S2 accepted; ADR-016 activation package approved 2026-09-28 | Explicit owner answer recorded; no need to repeat |
| S3 — complete | Fixed listener, session pairing, thin client and human discussion UI | Reviewed code, socket-denied regressions, actual loopback and Chrome smoke |
| ADR-017 — complete | Frozen synthetic multilingual comparison; bounded pinned acquisition and offline CPU measurements | No interactive model activation or real-page input |
| ADR-018 B1–B5 — complete | Browser E5, selected-site capture, persistent provisional grouping and shared comments | Actual Chrome inference + 14-check lifecycle flow and legacy smoke pass; mobile/remote/private expansion remains gated |
| Later S4 | Private destination, fixture AI preview, filters, local report/block/moderation | Focused lifecycle/publication tests before each control is enabled |

S1/S2 were the first cheaper-model block and are now complete, not all of roadmap
R1. S3 is also complete; do not rerun its implementation handoff. Routine naming/CSS/focused fixes
and the approved capabilities do not need more votes; expansion beyond them does.
Use one implementation owner and a bounded separate Trust/Quality review, not a
large standing agent team. AI review is not independent-human/legal/store approval.

### Historical completed S1–S3 specifications

The following original slice contracts describe their completed scope. ADR-018
supersedes their fixture-only/no-vector-ingestion/no-auto limits only within its
explicit owner-local package. Do not treat the historical stop prompts as a new
gate for already-approved B1–B5, or repeat these implementations.

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
  Body text permits ordinary line breaks/tabs; titles and IDs remain single-line.
  Snapshots are capped at 8 MiB. Until pagination, reject growth before commit
  if a discussion view exceeds the 1 MiB response cap; preserve existing reads.
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

### S3: completed implementation contract

Delivered in independently checked slices (retained specification):

1. **S3a — transport:** bounded listener/startup around the reviewed handler,
   fixed app-owned SQLite path, random IDs/token, shutdown and separate local
   integration tests. Review the transport before exercising its listener.
2. **S3b — client:** fixed-endpoint DTO adapter, trusted session-only pairing,
   exact permission/CSP diff and tested synthetic fixture bridge. Preserve the
   existing readers' no-I/O boundary and the completed owner review ledger.
3. **S3c — usable loop:** popup auto-load, Topic selection/creation and human
   root/reply/edit/withdraw UI, lifecycle/error handling and real-browser smoke.

Apply the concrete transport and fixture-namespace requirements in the S1/S2
review. Default suites stay socket-denied. S3 replaced the formerly failing
`test:integration` placeholder with a separately invoked bounded loopback suite;
the owner approved running it. Tests use temporary app-owned databases and
injected test tokens, suppress token output and close their own listeners. An
occupied port fails closed; do not kill unrelated processes or choose another
port. Document user startup, extension-Origin configuration, manual pairing,
shutdown and explicit reset. Never print a real pairing token in tool/chat logs.

One audited `local-service-client.js` fetches only the fixed endpoint, rejects
redirects, omits cookies and validates DTOs. One `local-service-session.js` uses
`chrome.storage.session` for the pairing token, restricted to trusted extension
contexts. No local/sync token storage or client canonical discussion/vector DB.
Pair once per browser/service session; no idle logout. On token rejection clear
pairing/private views and show disconnected status, not repeated automatic retries.

The owner has approved adding `storage`, narrow loopback host permission and
`connect-src http://127.0.0.1:4174`. Host permission can cover more ports than the
intended one: enforce exact port in client and CSP. Replace the old blanket fetch/
storage ban only for those audited adapters, preserving no-I/O in readers/core.
Review the actual permission and adapter diff before activating it in tests.

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

Keep service scripts `test` (no sockets), `test:integration` (approved loopback),
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
Reviewed service baseline: 39/39 tests; 25 scanned files, zero findings and six
scanner self-tests. These are historical baselines; current S3 counts and actual
loopback/browser evidence are in STATUS and the S3 review. The separate spike
`test:browser` uses installed Chrome, a temporary profile/database and intercepted
project-created pages; it is never part of the socket-denied default suite.
New legitimate fixtures may change generated test hashes; never alter the actual
owner ledger. After each slice: focused checks, separate risk review, diff check,
STATUS/README evidence, then commit/push verified in-scope work.

**Stop the coding slice and return to the Astra lead at the first of:**

1. S3 is complete: review the usable local loop and propose the exact real
   embedding model/runtime/license/assets/inputs. Do not download/activate it yet.
2. An unresolved architecture/security/privacy issue requires new decisions or
   wider permissions, real inputs, vector transmission, external I/O, dependency/
   database/runtime replacement or weakened isolation/purge tests. Provide a
   failing reproduction and options; stop speculative patch loops.
3. Any provider/account/tester/hosting/spending/publication/store approval gate,
   including the later 200–250-pair provenance-approved review, becomes necessary.

The S1/S2 review and S3 owner-activation gate are already complete. Summarize
results, tests, remaining gaps and the next decision to the lead; do not silently
start S4/R2. Only if using a standalone cheaper-model session without the Astra
lead, say explicitly: **"Bitte jetzt zu GPT-6 Astra wechseln."**
Astra review does not replace owner approval. No independent person is needed
for these local code increments; give a concrete assignment at the later real
evaluation gate. Do not ask the owner to decide every routine engineering step.

Model guidance checked using OpenAI Docs: Sol fits the multi-file implementation;
Luna can handle smaller fully specified subtasks. Availability is whatever the
owner's picker offers; no model/account/permission setting was changed here.
[Official model guidance](https://learn.chatgpt.com/docs/models).

## Historical standalone cheaper-model fallback prompt — S3 (complete; do not rerun)

> Lies AGENTS.md, plans/STATUS.md, plans/IMPLEMENTATION_HANDOFF.md, ADR-016 und
> research/S1_S2_REVIEW_2026-09-28.md. Implementiere S3 in kleinen getesteten
> Schritten: lokalen Listener, Kopplung, schlanken Extension-Client und die
> menschliche Diskussionsoberfläche. S1/S2 samt Astra-Review sind fertig. Die
> exakte lokale Verbindung auf 127.0.0.1:4174 inklusive Session-Kopplung,
> begrenzter Berechtigungen und Loopback-/Browser-Tests ist bereits ausdrücklich
> genehmigt; frage das unveränderte Paket nicht erneut ab. Verwende nur
> synthetische IDs/Daten und bewusst eingegebene Demo-Beiträge. Keine echten
> Seiteninhalte übertragen, keine Modelle laden, keine externe Suche oder
> Provider aktivieren. Wiederhole weder Phase 0 noch den fertigen 6/6-Review.
> Halte Status/README aktuell, prüfe die Sicherheitsgrenzen und committe/pushe
> abgeschlossene geprüfte Schritte. Nach S3 oder bei einer früheren neuen
> Architektur-/Sicherheits-/Freigabegrenze: anhalten und ausdrücklich sagen
> „Bitte jetzt zu GPT-6 Astra wechseln.“ Ergebnis, Tests, offene Punkte und
> nächste Entscheidung nennen. Nicht mit S4 oder echten Embeddings fortfahren;
> spätere Freigaben werden durch einen Modellwechsel nicht ersetzt.

## Historical cheaper-model prompt (completed; do not rerun)

This prompt produced S1/S2. Both historical prompts are complete. Returning agents
review STATUS and continue only the approved ADR-017 experiment.

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

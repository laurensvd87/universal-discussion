# Universal Discussion Layer

A browser-first discussion app built around
`Content -> Semantic Topic -> Discussion`: different sources about the same
underlying topic should lead to one conversation, with human and AI
contributions clearly distinguished. Android and iOS follow.

## Current state

This is a usable local discussion prototype, not a hosted or general-web product.

- The offline kernel resolves synthetic Sources by exact URL or content
  fingerprint. It does **not** perform semantic similarity matching.
- The unpacked Chromium popup looks up bundled example.com/example.org mappings.
- A separate metadata button reads only a controlled local fixture and one
  approved MDN route. No body capture, network, persistence or AI.
- Extension 0.5.0 connects to the local service with session-only manual pairing.
  Create/select Topics, post roots and replies, edit/withdraw your demo posts and
  reopen persisted discussions. Human/AI counts remain distinct; no AI is running.
- A paired popup loads automatically. The two exact reserved-domain URL fixtures
  can select one shared demo discussion; all other tabs offer manual selection.
  No observed URL, metadata or page body is sent to the service.
- Service-ranked related pages distinguish confirmed same-Topic pages from
  related reading. Six synthetic Harbor Sources use hand-authored vectors, not a
  trained model or web search. The older offline panel remains diagnostic.
- Local-service S1/S2 now implement the service-owned synthetic Source catalog,
  fixture-vector ranking, Topics, Discussions and human root/reply/edit/withdraw
  commands with in-memory and SQLite persistence. A secured transport-neutral
  `/v1` handler is tested in-process. S3a now adds an explicitly started, bounded
  `127.0.0.1:4174` listener and terminal-only manual pairing token. Actual loopback
  and actual-Chrome extension integration tests pass.
- Review/evaluation tooling exists; the owner's synthetic 6/6 review is finished.
- An isolated, synthetic-only local embedding comparison now runs real models.
  It does not change the current fixture-only service/extension matching.
- General website matching, AI integration, private
  discussions, moderation, real accounts and mobile are not implemented yet.

The 2026-09-27–28 reassessment found that validation tooling had overtaken the
usable product. The active plan now prioritizes a local discussion loop,
useful related sources, early embeddings and an explicit AI-draft flow. Completed evidence is
preserved; local implementation does not wait for another per-module interview.

Start with [current status](plans/STATUS.md),
[active roadmap](plans/ROADMAP.md) and
[ADR-014](decisions/ADR-014-product-first-rebaseline.md), extended by
[ADR-015](decisions/ADR-015-related-pages-first-utility.md) and
[ADR-016](decisions/ADR-016-loopback-service-first.md).
For implementation, use the [concrete handoff](plans/IMPLEMENTATION_HANDOFF.md):
local service first, extension as API client. S1–S3 are implemented and reviewed;
later model/input work remains gated. External web search is deferred by the owner.
The [product reassessment](research/PRODUCT_RESET_2026-09-27.md) and
[store/legal findings](research/PRODUCT_RESET_POLICY_2026-09-27.md) explain the
corrections and options. These are research and engineering evidence, not store
approval or legal certification.

## Run and test

Node.js 24 or newer; the existing spike needs no package installation:

```sh
cd spikes/topic-resolution
npm test
npm run test:restricted
npm run indicator:test
npm run check:secrets
```

The socket-denied local-service checks also need no package installation:

```sh
cd apps/local-service
npm test
npm run check:secrets
```

From `apps/local-service`, `npm run test:integration` runs the separately guarded
loopback suite. Port 4174 must be free; tests close only their own listener and use
temporary SQLite state. The default suite remains socket-denied. For interactive
startup and pairing instructions, see the [service README](apps/local-service/README.md).
The owner approved this exact local package. `npm run test:browser` from
`spikes/topic-resolution` runs the separate real-Chrome smoke with a temporary
profile/database, injected test pairing, pipe debugging and intercepted synthetic
pages. It requires installed Chrome and free port 4174; it closes its own resources.
No browser/dependency download or existing browser profile is used.

For the unpacked extension and fixture-server/manual checks, follow the
[browser README](spikes/topic-resolution/browser/README.md). Load the
`spikes/topic-resolution/browser/` directory. The pinned MDN experiment expires
on 2026-10-23; that is a narrow experiment limit, not the future site architecture.

To try the discussion loop:

1. Load/reload the unpacked extension; copy its ID from `chrome://extensions`.
2. In your terminal, run `npm start -- --origin chrome-extension://YOUR_EXTENSION_ID`
   from `apps/local-service` (replace `YOUR_EXTENSION_ID` with the actual ID).
3. Open the extension, paste the terminal's token into **Session pairing token**
   and pair. Never paste that token into chat or logs.
4. Choose/create a Topic; use the two clearly synthetic actors to post, reply,
   edit and withdraw. Reopen the popup to verify persistence. Select a Harbor
   Source for related-page examples. Only use deliberate non-sensitive demo text.
5. Ctrl+C stops the service. Its next start has a new token. To remove demo
   state, use the popup's explicit `RESET DEMO STATE` confirmation.

Demo posts persist in ignored local SQLite state until withdrawal/reset/removal.
Unsent drafts stay only in popup memory. These are local test discussions, not
Internet publication, real accounts or production security isolation.

The navigation hardening clears metadata on source-tab updates, removal or
replacement. Automated race tests pass; a fresh real-browser smoke of this
change is not yet recorded. Browser events are asynchronous and do not prove
an atomic, continuously fresh page snapshot.
The new service discussion flow has actual-Chrome smoke evidence in the
[S3 review](research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md). This does not repeat
or replace earlier owner checks or certify the metadata capture paths.

Do not rerun `review:owner` or prepare a replacement owner queue as a routine
setup step: the synthetic 6/6 task is complete. The later 200–250-pair
provenance-approved task requires explicit approval before acquisition/review.

## Next product increment

The owner now requests background matching while browsing real pages, followed
by shared comments across matched Topics. The
[next approval package and implementation slices](decisions/ADR-018-background-page-matching-local-poc.md)
specify browser-side embeddings, selected-site access, local retention and
experimental provisional grouping. These features are not active yet; the exact
expanded privacy/security permissions await confirmation.

A local backend now owns the synthetic Source catalog, fixture vectors/matching,
Topics and discussion state. Its pure domain, SQLite repository and in-process
API handler are implemented, tested and corrected following Astra review. The
owner has explicitly approved the exact local S3 connection and test package.
S3's listener, session-paired thin client and English message-key UI now complete
the open -> choose/create Topic -> post -> reply -> reopen -> delete loop.
Synthetic identities are not real authentication. Captured browsing context is
not sent or saved in this block. R1's private/AI/moderation work is still later S4.

After the initial service/client loop: a pinned local-service embedding experiment
after exact model/input approval. The adapter is prepared early; no trained model
is active in the interactive service. The [model options](research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md)
and [approved experiment](decisions/ADR-017-local-embedding-experiment.md) define
the bounded synthetic-only comparison approved on 2026-09-29. Its isolated
[experiment workspace](apps/local-service/experiments/embeddings/README.md) is
implemented and locally measured; this does not enable learned matching in the extension.
The current service is on the user's PC; future
hosting must not move raw website-content processing off-device by default.
Remote vectors are sensitive too and require a separate approval.
The [size/global-language follow-up](research/SMALL_EMBEDDING_FOOTPRINT_2026-09-29.md)
prioritizes English within one multilingual space and compares compact model
packs with E5; experimental download budgets are not end-user app sizes.
Known permitted Sources come first; external web search is
parked and is not a prerequisite. The recorded options remain in the
[discovery options and costs](research/RELATED_PAGE_DISCOVERY_2026-09-28.md).
AI handoff/import and a shared service follow their data/security approvals.
The design avoids a crawler, a mandatory per-site API and a mandatory AI vendor.
For mobile, investigate sharing and Safari integration before assuming a WebView
can observe content in other apps.

No provider integration, general page acquisition, browsing-data upload,
deployment, purchase, recruitment/publication or store submission is authorized
by a successful local test. Relevant gates remain explicit in ADR-014/016.

## Project documents

- [Charter](PROJECT_CHARTER.md), [agent instructions](AGENTS.md) and
  [lean team](agents/TEAM.md): product invariants and ownership.
- [Product](docs/PRODUCT_SPEC.md), [domain](docs/DOMAIN_MODEL.md) and
  [AI economics](docs/AI_AGENTS_AND_ECONOMICS.md): intended behavior.
- [Trust/moderation](docs/TRUST_SECURITY_MODERATION.md),
  [lifecycle design](docs/PHASE_1_AUTH_AND_DATA_LIFECYCLE_THREAT_MODEL.md) and
  [BYO-AI threats](docs/BYO_AI_THREAT_MODEL.md): feature-specific boundaries.
- [Historical roadmap](plans/archive/ROADMAP_2026-09-25.md) and
  [historical status](plans/archive/STATUS_2026-09-25.md): preserved prior work.
- `decisions/` and `research/`: scoped decisions and dated supporting evidence.

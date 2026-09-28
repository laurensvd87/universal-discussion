# Universal Discussion Layer

A browser-first discussion app built around
`Content -> Semantic Topic -> Discussion`: different sources about the same
underlying topic should lead to one conversation, with human and AI
contributions clearly distinguished. Android and iOS follow.

## Current state

This is a local prototype, not yet a usable connected discussion app.

- The offline kernel resolves synthetic Sources by exact URL or content
  fingerprint. It does **not** perform semantic similarity matching.
- The unpacked Chromium popup looks up bundled example.com/example.org mappings.
- A separate metadata button reads only a controlled local fixture and one
  approved MDN route. No body capture, network, persistence or AI.
- Extension 0.4.0 adds a **Related pages · demo** panel: a local candidate ranker
  separates confirmed same-Topic pages from related reading, even with no posts.
  Its six synthetic pages use hand-authored vectors, not a trained model or web
  search. No active-tab data enters this demo.
- Local-service S1/S2 now implement the service-owned synthetic Source catalog,
  fixture-vector ranking, Topics, Discussions and human root/reply/edit/withdraw
  commands with in-memory and SQLite persistence. A secured transport-neutral
  `/v1` handler is tested in-process. There is deliberately no listening server
  and the extension is not connected to it.
- Review/evaluation tooling exists; the owner's synthetic 6/6 review is finished.
- The extension UI for posting/replies and current-tab auto-loading, learned
  embeddings, general websites, AI integration, real accounts and mobile are not
  implemented yet.

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
local service first, extension as API client. This architecture is planned, not
implemented in extension 0.4.0. External web search is deferred by the owner.
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

The offline local-service S1/S2 checks also need no package installation:

```sh
cd apps/local-service
npm test
npm run check:secrets
```

Do not run `npm run test:integration`: it is an intentional gate until the
ADR-016 loopback activation package is reviewed and explicitly approved.

For the unpacked extension and fixture-server/manual checks, follow the
[browser README](spikes/topic-resolution/browser/README.md). Load the
`spikes/topic-resolution/browser/` directory. The pinned MDN experiment expires
on 2026-10-23; that is a narrow experiment limit, not the future site architecture.

To try the new panel, reload the unpacked extension and open it. Select the
Harbor S2 overview to see two same-Topic examples and two related-reading
examples. Select the community-garden example to see the limited-catalog empty
state. These addresses are non-clickable examples, not discovered websites.
No fixture server or current-tab check is needed for this panel.

The navigation hardening clears metadata on source-tab updates, removal or
replacement. Automated race tests pass; a fresh real-browser smoke of this
change is not yet recorded. Browser events are asynchronous and do not prove
an atomic, continuously fresh page snapshot.
The related-page panel has automated DOM/contract coverage; its real-browser
smoke is also still pending. Earlier owner checks remain completed evidence.

Do not rerun `review:owner` or prepare a replacement owner queue as a routine
setup step: the synthetic 6/6 task is complete. The later 200–250-pair
provenance-approved task requires explicit approval before acquisition/review.

## Next product increment

A local backend now owns the synthetic Source catalog, fixture vectors/matching,
Topics and discussion state. Its pure domain, SQLite repository and in-process
API handler are implemented, tested and corrected following Astra review. The
next gate is explicit approval of the loopback/client activation package. No listener or new
extension permissions are active. After approval, the extension
will become a thin client with English message keys and an open -> choose/create
Topic -> post -> reply -> reopen -> delete loop. Synthetic identities are not
real authentication. Captured browsing context is not sent or saved in this block.

After the initial service/client loop: a pinned local-service embedding experiment
after exact model/input approval. The adapter is prepared early; no trained model
is installed yet. Known permitted Sources come first; external web search is
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

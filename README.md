# Universal Discussion Layer

A browser-first discussion app built around
`Content -> Semantic Topic -> Discussion`: different sources about the same
underlying topic should lead to one conversation, with human and AI
contributions clearly distinguished. The planned sequence is extension, readable
web conversations, then Android and iOS; public hosting is not yet approved.

## Current state

This is a usable local discussion prototype, not a hosted or general-web product.

The latest [product investigation](research/AI_INSIGHT_COLD_START_2026-09-29.md)
prioritizes useful research by the user's own AI, with selected sourced insights
shared into native discussions visible inside the extension. ChatGPT connection
is opt-in; no AI research runs automatically. Earlier external-feed tests are
research only; first-user value, sharing and growth remain unvalidated.

Extension **0.12.6** includes a ChatGPT insights PoC: review a bounded public-page
sample and same-Topic/related links, request research using your account, then
edit and separately share an AI-labelled discussion opening locally. No API key
or automatic posting. User Mode is simplified around the Topic, discussion
and insight action; setup and diagnostics stay secondary.
See [setup and testing](spikes/topic-resolution/browser/README.md#chatgpt-insights-0126)
and [ADR-024](decisions/ADR-024-local-ai-insights-and-chatgpt-poc.md).
Integration evidence is tracked in [STATUS](plans/STATUS.md). Actual account
eligibility, live research and answer quality still require the owner's test.
The 0.12.1 hardening clarifies plan access after sign-in, offers an explicit
re-consent path when needed, and gives safer, more useful provider-error guidance.
The 0.12.2 follow-up adds non-secret sign-in failure stages after the first
owner login failed; successful real-provider authorization is still unverified.
The 0.12.3 follow-up accepts a standards-valid single-item identity-token
audience array and reports a fixed identity-verification substage if another
check fails. The cause of the owner's live failure is still unconfirmed.
Version 0.12.4 places model-list loading, empty-result and failure feedback
beside the model selector. Live model availability is still unverified.
Version 0.12.5 gives that failed, explicitly requested catalog read a fixed
reason category without exposing provider details; no automatic model call.
Version 0.12.6 responds to the owner's live `catalog-body` result with a separate
2 MiB model-catalog limit (research output stays at 256 KiB) and fixed size,
stream and encoding diagnoses. The last 20 model-list outcomes stay only in
service memory; the extension's own fixed codes stay only in popup memory.
Developer Mode can inspect them on request. No provider body, account identity,
page content, tokens or URLs enter these diagnostics. User Mode keeps Topic and
discussion first and exposes ChatGPT setup as the next action without showing
account identity. Live model availability and insight generation remain unverified.

Extension **0.11.0** added a clickable ↗ source icon to new page-linked posts:
it opens that post's source in a new tab. Replies can link their own page while
staying with their root conversation. Legacy/Topic-only posts have no guessed link.
New page-anchored roots and all their replies follow the page during regrouping;
manual Topic-only and legacy threads stay pinned. See
[ADR-023](decisions/ADR-023-adaptive-topics-source-anchored-subthreads.md).

The five toolbar states remain: red disconnected/unverified, gray
connected without a current Topic, green Topic, light blue another learned page
shares the Topic, dark blue that shared Topic also has visible posts. Tooltips
explain the state; connection is last-observed, not continuous monitoring.
Offline, isolated Chrome session/reader and full comments/icon browser checks
pass, including all five native icon colors and re-pairing after a test backend
restart. See [STATUS](plans/STATUS.md) for evidence and remaining limitations.

The approved article/title matching experiment did **not** establish a reliable
automatic join rule. Its input code stays outside the extension; capture/model
and the one-vector payload are unchanged. See the
[measured findings](apps/local-service/experiments/topic-identity/RESULTS.md) and
[deferred subject-verifier proposal](decisions/ADR-022-subject-verifier-experiment.md).
The owner declines an additional local LLM. The approved experimental adaptive
rule now starts at 0.90, tightening to 0.94 for independently supported subgroups,
with all-member, competing-group and stability guards. It can change existing
provisional associations. This is not validated event/viewpoint recognition;
invented-vector tests prove mechanics, not general semantic accuracy.

Popup **0.9.1** made the existing window-scoped session clear: Start once covers
eligible active tabs in that window, including new tabs. Active sessions no longer
show another unchecked consent/Start prompt. Blank/loading tabs do not end the
session; another window or extension/browser restart still needs explicit Start.

Reader **0.9.0** adds the explicitly approved [bounded article fallback](decisions/ADR-021-bounded-article-container-fallback.md)
for pages without main/article markers, alongside cheaper traversal and clearer
capture-limit messages. It selects a narrowly marked, paragraph-rich container,
not unrestricted page text. Structural work is capped at 10,000 steps; the checked
40 ms deadline, 4,096-character sample, privacy exclusions and local-only payload
remain. Existing Topics/comments are preserved. The reader now succeeds on the
anonymous GameStar snapshot; 47 actual Chrome reader checks pass. The full-service
browser regression also verifies shared comments across marked/fallback layouts
and SQLite restart. Live-site/general-web coverage is not established. See
[STATUS](plans/STATUS.md) for exact evidence and remaining manual checks.

The owner approved [ADR-019 B](decisions/ADR-019-automatic-browsing-and-durable-pairing.md):
Start once per browsing session to match eligible HTTPS sites in that normal
browser window. Stop/window closure/browser restart ends capture. Chrome's broad
grant is separate: Stop retains it; **Remove broad HTTPS access** revokes it.
Use a dedicated non-sensitive profile; private-page detection is not reliable.
Bounded matching work is approved but the measured input proposal is not active;
the additional verifier experiment is deferred and persistent pairing stays gated.

- Extension 0.8.0 adds a **User / Developer** switch at the top. User mode opens
  with the Topic title, discussion and visible connection state; diagnostic
  details remain in Developer mode. The display choice is remembered locally.
  Connection, Start/Stop and data controls remain available in both modes.
- Light/dark blue require another retained learned page in the exact same Topic;
  merely related recommendations do not qualify. Dark blue additionally requires
  visible posts or replies, not Deleted tombstones or drafts. A single-page Topic
  stays green even with posts. Matching is still experimental.
- It connects to the local SQLite service using session-only pairing.
  Create/select Topics, post roots and replies, edit/withdraw local comments and
  reopen persisted discussions. Human/AI counts stay distinct; AI-assisted drafts
  are saved only after a separate explicit sharing action.
- Session opt-in background matching samples rendered main content on eligible sites,
  derives E5 embeddings inside the extension and sends only URL/title/vector and
  versions to the backend on this PC. It stores current Sources and provisional
  Topic associations, not raw page text or a per-visit timeline.
- The popup loads automatically and updates after matching finishes. A real
  Chrome synthetic-page check on 0.8.0 verifies User-mode connection/Topic/drafts,
  native blue/neutral icons, cross-domain shared comments, unrelated-page separation,
  Stop, persistence, correction and deletion: 17 full-loop checks and the 19-area
  discussion regression pass. The separate 15 session
  and 32 eligibility/reader checks also pass. Native first-grant and browser/
  extension reload/restart checks remain manual; real-news accuracy is unvalidated.
- Wrong-topic correction, Stop/site blocking, Forget page and confirmed learned
  Topic/data deletion are implemented. Matching defaults off; manual Topic choice
  remains available. There is no external search or crawler.
- Older exact-URL/fingerprint fixtures, metadata-only MDN/loopback checks and six
  hand-authored Harbor vectors remain separate diagnostics with synthetic labels.
- The secured, bounded `/v1` API listens only when explicitly started on
  `127.0.0.1:4174`. The service never fetches Source URLs or runs the embedding
  model. Vectors/scores never appear in display DTOs.
- The owner's synthetic 6/6 review and isolated model comparison are complete.
- The initial ChatGPT connector is local-only. Private discussions, moderation,
  real discussion accounts, remote hosting and mobile are not implemented yet.
  Matching accuracy remains unvalidated.

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
ADR-018's exact local browser/model/input package is approved and implemented.
Broader private/remote/release work remains gated. General background search is
deferred; the explicit ChatGPT research action may search supplied public domains.
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

If **Start browsing session** stays disabled, check the eligibility
message beside the site control. It distinguishes an unfocused/loading page,
unavailable tab access and an unsupported context; disabled does not mean loading.
Version **0.6.2** additionally checks the actual focused action popup when its
parent window reports no focus. **0.6.3** corrects misleading window-error guidance:
page loading, a changed tab/window, expired/changed popup focus and failed Chrome
API calls have separate messages. The owner now confirms Enable is clickable,
but the page still reports unsupported. **0.6.4** fixes a reproduced stale
foreground-failure state: a fresh eligible observation on an enabled site schedules
the ordinary matching checks again. Actual content-reader rejections do not
auto-retry and now show a specific message and fixed diagnostic code. Reload to
0.8.0, start a session on the article; if still unsupported, report only that message/code.
The owner's exact page outcome remains unconfirmed. No token, storage dump or
page content is needed; the backend/data do not need a restart or reset.

The owner identified `[rights-restricted]` and explicitly directed proceeding
under a local vector-processing permission assumption. **0.6.5** removes the
real-page reader's robots/googlebot/TDM metadata veto, including explicit and
unknown declarations. [ADR-018](decisions/ADR-018-background-page-matching-local-poc.md)
records this owner-only working assumption, **not legal or store clearance**.
Per-site consent, public-only scope, visible-region exclusions, resource limits
and local data boundaries remain. The older metadata-only experiment is unchanged.
Reload the extension and retry the enabled article; no backend restart or data
reset is needed. Other checks can still reject pages; all-public-site coverage
and the owner's exact page outcome are not established.

If similar pages get separate Topics, related does not necessarily mean same Topic.
The experimental 0.90–0.94 rule still requires all-member coherence and a 0.04
competing-group margin. Tightening needs two cohesive groups with two nonduplicate
representatives each; copying a page does not manufacture support. A tightened
group does not immediately loosen when support is removed. These are uncalibrated
heuristics, not probabilities; opposing opinions can still split incorrectly.
Input remains a bounded article prefix, not necessarily the complete article.
For deliberate correction, use **Wrong topic or retained page controls**, select
the other Topic, confirm, then **Confirm source topic**. Source-anchored roots and
their complete replies follow; legacy/manual Topic threads stay put. Manual
Source assignments override automatic regrouping. Start matching again afterward.

When upgrading to **0.11.0**, stop/restart the backend and reload the extension,
then pair and Start a new browsing session. First backend open transactionally
migrates old SQLite state; old comments remain, without invented page origins.
No reset is needed. A changed stored page vector conservatively pins its old
threads, rather than assuming they describe the changed page. Forget removes all
post links to that page and keeps comments. Clear learned data also removes
learned-source threads manually moved to another Topic; read the confirmation.

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
experimental provisional grouping. The owner approved this exact local-only
package on 2026-09-29; extension 0.6.0 implemented and browser-tested it. Version
0.7.0 replaces per-site enablement with ADR-019 B's approved explicit window
session. Matching still defaults off. Follow the
[browsing-flow setup](spikes/topic-resolution/browser/README.md#try-the-new-browsing-flow).

A local backend now owns the synthetic Source catalog, fixture vectors/matching,
Topics and discussion state. Its pure domain, SQLite repository and in-process
API handler are implemented, tested and corrected following Astra review. The
owner has explicitly approved the exact local S3 connection and test package.
S3's listener, session-paired thin client and English message-key UI complete
the open -> choose/create Topic -> post -> reply -> reopen -> delete loop.
Synthetic identities are not real authentication. The old S3 fixture-only block
does not capture browsing context; ADR-018 separately approves the new local
URL/title/vector path. R1's private/AI/moderation work is still later S4.

After the initial service/client loop: a pinned local-service embedding experiment
after exact model/input approval. The adapter is prepared early; no trained model
is active in the interactive service. The [model options](research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md)
and [approved experiment](decisions/ADR-017-local-embedding-experiment.md) define
the bounded synthetic-only comparison approved on 2026-09-29. Its isolated
[experiment workspace](apps/local-service/experiments/embeddings/README.md) is
implemented and locally measured. ADR-017 alone did not authorize interactive
matching; ADR-018 separately authorized the extension 0.6.0 successor.
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

Beyond ADR-024's explicit local ChatGPT action, no new provider integration,
private capture, off-device browsing-data transfer, deployment, purchase,
recruitment/publication or store submission is authorized by a successful local
test. Later gates remain.

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

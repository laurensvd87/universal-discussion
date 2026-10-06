# Universal Discussion Layer

A browser-first discussion app built around
`Content -> Semantic Topic -> Discussion`: different sources about the same
underlying topic should lead to one conversation, with human and AI
contributions clearly distinguished. The planned sequence is extension, readable
web conversations, then Android and iOS; public hosting is not yet approved.

## Current state

This is a usable local discussion prototype, not a hosted or general-web product.

The owner has approved in principle assembling a local 200–250-pair public-page
review set for semantic matching. [ADR-045](decisions/ADR-045-r5-public-pair-acquisition-checkpoint.md)
records the pilot scope and remaining scale-up gates;
six real pilot Source records have been captured locally. The owner rated one
frozen pair; the other pairs have only exploratory assistant judgments, not
human labels. This does not change the live
Topic matcher or reopen the completed six-pair synthetic review.
The owner subsequently approved a small three-origin English-news pilot and
deferring reviewer recruitment until labeling. Its isolated
[one-page capture harness](apps/local-service/experiments/r5-pilot/README.md)
and page-level provenance checks passed for those six pages; expansion to
the full review set is a separate decision. The real pilot records are
Git-ignored and are not included in a clone of this repository.
[ADR-046](decisions/ADR-046-owner-only-exploratory-r5-review.md) records the
owner's subsequent decision to rate the local PoC alone. Those ratings can
guide iteration, but will not be called independently validated.
[ADR-047](decisions/ADR-047-metadata-only-llm-triage-for-r5-pilot.md) keeps
the owner's first real-pair answer separate from title-only AI suggestions;
neither changes the live matcher or constitutes a benchmark.
[ADR-048](decisions/ADR-048-llm-evaluation-nonllm-runtime-matching.md) permits
the assistant to read these approved public articles for an offline reference
judgment. The running matcher remains non-LLM; the
[local shadow comparison](apps/local-service/experiments/r5-pilot/shadow-README.md)
tests vector, keyword and publication-time signals without changing Topic IDs.
An additional [transient title-vector probe](apps/local-service/experiments/r5-pilot/title-vector-README.md)
improved some candidate scores on those six pages but also admitted many
distinct-Topic hard negatives in a fixed synthetic challenge; it is not active.

The next matching direction is a graded, overlapping cloud of related pages
across any subject, not a fixed Russia/Ukraine collection or a mandatory
Topic/Collection tree. Opposing views on the same subject should remain close;
written conversations must keep stable identity as the cloud changes. This is
still a [proposal](decisions/ADR-044-continuous-topic-cloud-and-insight-diversity-proposal.md),
not the current matcher. The present PoC has a 100-Source/100-Topic cap and
does not yet provide the scalable cloud or reliably stance-independent matches.
An isolated [synthetic shadow experiment](apps/local-service/experiments/topic-cloud/README.md)
tests the proposed cloud mechanics; it does not change the running extension
or service and exposes a false-positive example.
A separate [synthetic SQLite dry run](apps/local-service/experiments/topic-cloud/sqlite/README.md)
persists 140 invented pages without that fixed cap, but it is not wired into
the app or approved to migrate existing data.
The [migration/recovery plan](apps/local-service/experiments/topic-cloud/sqlite/MIGRATION_RECOVERY_PLAN.md)
lists what a safe conversion of existing discussions must preserve; no owner
database has been converted or backed up.
An initial [synthetic v2 conversion rehearsal](apps/local-service/experiments/topic-cloud/sqlite/rehearsal/README.md)
passes rollback, round-trip and a narrow learned-Source Forget check, but is
not ready to run on the current database. A separate
[near-copy retrieval probe](apps/local-service/experiments/topic-cloud/related-retrieval-README.md)
keeps duplicate-looking invented pages from crowding out a distinct related
candidate; it is not active or evidence of real-world matching quality.
An isolated [small learned embedding probe](apps/local-service/experiments/learned-embedding/README.md)
trains a 256-dimensional text encoder on invented same-subject and
different-subject examples. It did not improve held-out retrieval over its
unweighted baseline. A second experiment learned a tiny projection on the
already-packaged multilingual E5 vectors; it likewise did not improve
held-out synthetic same-subject ranking. Neither is installed in the app.

Extension **0.13.3** makes first connection and Insight progress clearer in
User Mode: the first-run Connect action fits the popup at 410 and 320 px,
Enter connects with the local pairing token, the token is cleared immediately,
and the main Insight action shows each preparation stage,
including related-page lookup. A connected account without Insight access
gets accurate Settings guidance. Reload the unpacked extension to see it;
no new permission, provider call, Topic rule or stored field is involved.

Extension **0.13.4** adds a Developer Mode diagnostic for related-page text:
eligible, attempted and accepted counts plus coarse failure totals. It contains
no page text, titles or URLs. Reload the extension to inspect it after an
explicit Insight request.
The current page text and successfully fetched related-page excerpts already
reach the connected model on a deliberate **Get insights** click. Extension
**0.13.5** raises the approved anonymous HTML ceiling to 768 KiB and parser
ceiling to 8,192 tokens, so some previously skipped large pages can contribute
an excerpt. Four attempts, 2,048 characters per page, five seconds, source
exclusions and private-draft behavior stay the same. The owner approved one
separate live provider quality test; the first attempt stopped before any
Responses request because the protected ChatGPT connection could not be
restored in the default sandbox. After the owner reconnected, the test ran
in the approved elevated environment with an actually listed model. One
Responses request received three public PEP 257/20/7 excerpts and produced
a private opening post comparing PEP 8 and PEP 257. It was not shared or
retried. The local service was restarted with the same extension Origin and
persistent pairing. This is not Chrome/news-page or store-release validation.

Extension **0.13.6** prefers a listed Luna model for new model selection as a
cost-sensitive default and keeps a deliberate user selection. If no Luna is
listed, it falls back to the last listed model. Catalog order is not a
documented price ranking; this is not a guarantee of the cheapest plan usage.

Extension **0.13.2** improves the source mix for a deliberate **Get insights**
request. It considers up to 20 already-known local related-page nominations,
then selects at most four non-current pages, gently preferring different
hosts and non-identical titles within the existing Topic/related priority.
Provisional Topic peers now retain their local relevance order instead of
falling back to ID order. The existing four anonymous fetch-attempt limit,
provider payload bounds, storage and automatic Topic assignment are unchanged.
This does **not** identify opposing viewpoints or join same-subject pages into
one discussion. Reload the unpacked extension **and restart the local service**
to use the same context selection on both sides. A separate
[synthetic title-cue probe](apps/local-service/experiments/topic-cloud/subject-rerank/RESULTS.md)
improved opposing-view ranking on invented cases, but is not active: some
distinct events still outrank the intended partner.

Extension **0.13.1** removes manual Topic selection and the initial Start
session/Choose Topic buttons from User Mode. With the already-granted HTTPS
access and saved pairing, eligible public pages are discovered automatically
when a fresh browser session has a healthy local service and focused window.
When no Topic is found, the popup shows a short waiting state instead of an
empty composer; manual Topic tools remain in Developer Mode. Two overlapping
mustard rings now visibly move behind the conversation and become static when
Reduced Motion is enabled. This is an extension-only update: reload the
unpacked extension; the backend need not restart for these UI changes.

The local diagnostic checkpoint adds a content-free `INSIGHT_TRACE` line to
the backend terminal. Explicit `--debug-insight-raw` mode additionally keeps
bounded request/response and structure logs in the user's temporary folder;
these can contain page and AI text, are never committed, and should be removed
after debugging. One owner-authorized synthetic GPT-5.5 test reproduced the
live `response-item-prefix` failure: the stream completed eight items but its
final output list was empty. The owner approved [ADR-031](decisions/ADR-031-complete-stream-private-draft.md):
one complete, internally consistent stream may yield a **private draft**
despite that empty list. Contradictory/partial streams still fail;
there is no automatic posting or retry. See also
[ADR-029](decisions/ADR-029-ephemeral-insight-structure-trace.md) and
[ADR-030](decisions/ADR-030-owner-opt-in-raw-insight-debug.md).

Extension **0.13.0** adds a conversation-first ivory/ink/mustard popup
and optional related-page excerpts for **Get insights**. The related-text
setting is on by default and can be changed in Settings; a saved off choice
is honored before any fetch. Only an explicit Insight request tries up to
four selected public HTTPS pages, anonymously and with a 768 KiB/5-second
fetch bound and at most 2,048 text characters per page. Failed or inaccessible
pages are skipped. The current page remains the subject; the local service
checks excerpt source IDs/URLs against the selected catalog context. Ordinary
use does not add those texts to SQLite; explicit raw Insight debug mode can
record them in its local temp log. Related excerpts are supplied context, not
proof that the whole pages were available, and citation icons still require
validated provider annotations. The related-page list is no longer a main User
view; individual source exclusions remain in Settings and post source links
remain accessible. Browsing already starts automatically on a fresh browser
session when saved pairing, Chrome HTTPS access, local-service health and an
eligible focused window are present; Stop still suppresses capture for the rest
of that session. The opening-post prompt now selects a useful angle from the
article and treats related excerpts as unverified context. This has
offline/synthetic and isolated-Chrome coverage. Two separately owner-approved
one-request GPT-5.5 tests used only public PEP 8 text plus three bounded public
PEP excerpts: the first opener stayed on PEP 8, while a revised prompt produced
a short PEP 8/PEP 257 comparison. Neither test shared a post, retried, or proves
reliable cross-page quality on arbitrary sites. See
[ADR-041](decisions/ADR-041-owner-local-related-page-excerpts.md),
[ADR-042](decisions/ADR-042-conversation-first-popup-redesign.md) and
[ADR-043](decisions/ADR-043-evidence-first-topic-sensitive-insight-prompts.md).
The local service was restarted with the current code on 2026-10-04; reload
the unpacked extension to test 0.13.0. New related text is sent only by a
deliberate **Insight** click. No standing authorization for further live
provider tests or public release follows from the two fixed QA requests.

A narrow service startup fix now accepts historical retained Sources under
the retained-only URL validator without rewriting the database. New capture
and new post origins remain strict, including at the paired API boundary.
See [ADR-040](decisions/ADR-040-retained-source-projection-compatibility.md).

Extension **0.12.22** makes reply targets explicit in the composer and uses
readable safe page titles as links in Pages. Restricted retained Sources remain
non-clickable. It includes the 0.12.21 catalog recovery below; reload the
unpacked extension in Chrome to pick up the update.

Extension **0.12.21** keeps the 0.12.20 discussion-first popup and fixes a
local compatibility regression: old retained account-host Source records no
longer invalidate the entire catalog after the new-capture guard. They remain
inert for links/Insights and are not recaptured or deleted. Internal popup-
to-background pairing errors now ask for an extension reload, not a new token.
Reload the unpacked extension in Chrome; the backend needs no restart for
this extension-only correction. See [ADR-040](decisions/ADR-040-retained-source-projection-compatibility.md).

Extension **0.12.20** organizes the popup around the current Topic and two
views: Discussion and Pages. The comment composer is above the conversation;
its small **Insight** button explicitly starts a private insight for the
current page. The result appears in Discussion, not a separate tab. Pairing
has a welcome state; ChatGPT account, model, source and related-page options
live behind **Settings**. Its formatted result
is already the private preview; only a separate **Share** publishes it. If you
close the popup after research starts, the paired local service can finish it
and recover the result when you reopen the same Topic/source within 30 minutes.
The result stays in service RAM, never posts by itself, and is lost on service
restart, disconnect, reset, expiry or context change. User Mode displays only
the insight message, its inline source links, and Share/Discard controls;
technical disclosures remain in Settings/Developer. Synthetic isolated-
Chrome checks cover the actual popup width and height, keyboard navigation,
account switching and no horizontal overflow. Reload the unpacked extension
after updating; this UI change alone does not require a service restart. The
connected ChatGPT account controls remain reachable under **Settings > Insight
settings > ChatGPT account > Disconnect to switch account**.

With the owner's bounded live-QA approval, one fixed public MDN HTTP article
was also tested through the real ChatGPT backend prompt and response parser:
the listed GPT-5.5 model returned a short 76-word private discussion opener
and a relevant question in one request. No source citation appeared and
nothing was shared. This does not yet validate the extension's rendered-page
capture, related-page research quality or the whole popup flow. The opt-in
probe and limits are in [ADR-038](decisions/ADR-038-bounded-owner-live-insight-qa.md)
and the [local-service instructions](apps/local-service/README.md#opt-in-live-insight-quality-probe).

The public-page URL guard now also excludes obvious credential/account host
labels before new capture. This does not identify every private or signed-in
page, so use the separate public-only browser profile. Previously retained
sources were not deleted; reload the unpacked extension for this guard.

If Chrome shows old popup JavaScript errors after pulling changes, use the
round-arrow **Reload** control on this extension's card at `chrome://extensions`;
closing and reopening the popup alone does not load changed extension files.
Chrome may retain earlier error entries, so compare their timestamps or clear
the old entries before retesting. A visible pairing-token field on an error
screen does not itself mean the stored token was lost. Do not rotate pairing
until a fresh error identifies an authorization failure.

The first AI result is prompted as a short, page-specific forum opener,
not a long research report. Provider-returned citation references appear as
small inline source links instead of a list of bare URLs. A generated robot
result can be shared unchanged or discarded, never edited under robot identity.
You can publish a human question beneath that opener, then click **Get insights**
on your own question for a short private robot reply, then share or discard
that result. Your own human and robot posts can be withdrawn. A fully withdrawn
thread disappears; otherwise a withdrawn post reads **Deleted by user**.
This is still a synthetic-actor local prototype, not an account system.
See [ADR-033](decisions/ADR-033-short-insight-openers-and-inline-sources.md)
and [ADR-034](decisions/ADR-034-published-followups-and-robot-provenance.md).

Insight context is limited to the current page plus at most four other ranked
source references. ADR-035 initially supplied title/URL only for the other
pages; ADR-041's next local build may also supply short anonymous public-page
excerpts on a deliberate click. ChatGPT's web search remains optional: the
earlier captured completed request made **zero web-search calls**, so it did
not fetch related content in that request. A URL alone is not evidence, and
even a citation does not prove the whole linked article was read. There is no
Google-related or SimilarSites fallback. See
[ADR-035](decisions/ADR-035-bounded-related-source-context.md).

At the owner's stated 2026-10-03 19:41 Berlin reset time, one synthetic-public
live request completed through the saved ChatGPT connection and strict local
parser as a private result (1,354 characters, one citation). It did not
publish anything or prove insight quality on a real page or the popup's
end-to-end owner experience. No answer or credentials were logged.

To use a different ChatGPT account, explicitly disconnect the current one in
the extension before reconnecting. The local service then forgets that
account's client mapping and starts a fresh OpenAI registration; local pairing,
Topics and comments remain untouched. The OpenAI consent page itself may
still show the browser's active ChatGPT account, so change that account on
ChatGPT web or sign out there before starting the new flow. Do not approve
the consent page if it shows the wrong account. The second-account flow has
offline coverage but still awaits owner live verification.

Extension **0.12.13** follows the owner's first live retry of the strict
insight fallback, which still returned `response-final-item-missing`. The
fallback had additionally required a matching `response.output_text.done`
event, beyond the approved fully completed `output_item.done` condition. It
now accepts that text event being absent, while rejecting it if present but
inconsistent. Four fixed, content-free rejection codes distinguish identity,
contradiction, missing output prefix and text mismatch. No provider call,
raw response capture, automatic retry or sharing was added by this fix.
Live insight success remains unverified.

Extension **0.12.12** implements the owner's approved persistent local pairing:
after one fresh explicit initialization and pairing, the browser retains its
local-service token across browser/service restarts until **Forget connection**,
rotation, revocation or confirmed rejection. The service stores only a verifier;
the browser profile stores the bearer and is not an encrypted vault. The owner
still starts the service manually. A separately approved strict fallback can
turn exactly one identity-matched, fully finalized assistant stream item into a
**private editable draft** when the provider's terminal completed response
omits that item. Contradictory, failed, incomplete and refusal events are
rejected; nothing is auto-shared or auto-retried. Offline tests pass, but a
successful live insight remains unverified. See the [current local setup](spikes/topic-resolution/browser/README.md#current-local-setup-01212),
[ADR-019](decisions/ADR-019-automatic-browsing-and-durable-pairing.md) and
[ADR-028](decisions/ADR-028-finalized-insight-item-private-draft.md).

Extension **0.12.11** follows the latest owner test with model “5.5”, which
returned `response-no-message`:
ChatGPT sign-in and a completed response stream worked, but the final response
contained no assistant message for an insight. The next local diagnostic
distinguishes an empty final output from search-only or reasoning-only output
without recording provider text. Insight settings can disable linked-page web
research for an explicit comparison; the normal one-click behavior remains
unchanged. No partial output is imported and no retry runs automatically.

Extension **0.12.10** addresses the latest owner-operated Create attempt. It
passed the completed-stream check but
returned `response-empty-output`: the service saw no usable final assistant
text. We have not seen the provider response and cannot yet tell whether it
was blank, a refusal, or tool/reasoning-only output. The local follow-up now
reports one fixed, content-free category for those cases and asks the model
for a brief uncertainty explanation instead of an empty answer when evidence
is insufficient. No partial/tool output is imported, no provider material is
logged and no automatic retry is added. Restart the backend and reload the
unpacked extension before one deliberate public-page recheck.

The **2026-10-02 local-service follow-up** accepts a headerless HTTP 200
research response only when its bounded body is a complete validated SSE
stream. It also keeps the ChatGPT refresh credential in Windows CurrentUser
protected storage so sign-in can resume after a service restart. Access/ID
tokens stay in RAM; the extension's local-service pairing token still changes
on restart and must be entered again. On other systems or if protected storage
is unavailable, ChatGPT sign-in remains RAM-only. Restart the local service to
use these backend changes; no extension reload or new permission is needed.
Live insight success and live sign-in restoration remain unverified. See
[ADR-026](decisions/ADR-026-headerless-complete-sse-fallback.md),
[ADR-027](decisions/ADR-027-windows-protected-chatgpt-refresh.md) and
[status](plans/STATUS.md).

Version **0.12.9** adds safe diagnosis for the owner's first live ChatGPT
research failure (`response-content-type`): after restarting the local service
and reloading the unpacked extension, one deliberate Create attempt will show
whether a non-stream reply looked like JSON, HTML, plain text, a missing format
header or another format. No provider body/header, account or page text enters
the diagnostic; no non-stream output is accepted and no automatic retry occurs.
The owner-operated check returned `response-content-missing`: the successful
HTTP reply supplied no format header. Its body and cause remain unknown; the
subsequently approved narrow fallback above is now implemented.

The latest [product investigation](research/AI_INSIGHT_COLD_START_2026-09-29.md)
prioritizes useful research by the user's own AI, with selected sourced insights
shared into native discussions visible inside the extension. ChatGPT connection
is opt-in; no AI research runs automatically. Earlier external-feed tests are
research only; first-user value, sharing and growth remain unvalidated.

Extension **0.12.8** includes owner-approved automatic local matching in a
separate public-only browser profile and a one-click ChatGPT insight PoC. Once
the local service is paired, Chrome HTTPS access is granted and ChatGPT is
signed in, User Mode loads the current Topic and available models, selects the
last listed model in that original build, and keeps **Create insights** visible.
Clicking it reads the bounded current public-page text and sends it with selected related source
titles/URLs to ChatGPT; the result stays private until separately previewed
and shared locally. Related pages can be excluded in Insight settings. No API
key, automatic AI inference, automatic posting, new permission or cloud backend.
See [setup and testing](spikes/topic-resolution/browser/README.md#chatgpt-insights-0128)
and [ADR-025](decisions/ADR-025-public-profile-autocapture-and-one-click-insights.md).
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
account identity. The owner now confirms a live model list; insight generation
remains unverified.
After the owner confirmed the model list works, 0.12.7 clarifies that its empty
manual-draft editor is not an AI result and shows the next step or research
failure distinctly. This is an extension-only UI change; reload the extension,
but the local service need not restart.
Version 0.12.8 responds to the first real failed research attempt with only
fixed, non-sensitive failure details in the paired result and in-memory local
diagnostics. The exact live cause is still unknown; no partial answer, provider
body or automatic AI retry is introduced. After separate explicit owner
approvals, this version also starts matching after authenticated local pairing
when the existing Chrome HTTPS grant is present; Stop remains sticky for that
browser session. User Mode no longer requires a separate text/cost click before
the explicit Create action. A compact bottom bar prevents horizontal popup
overflow and keeps the model and action visible. Restart the local service and
reload the extension for this checkpoint. Native Chrome permission and ChatGPT
sign-in still require their own initial interaction. Provider-side paid-credit
settings remain the owner's responsibility; the app cannot enforce them.

The actual Chrome action popup initially exposed a width bug missed by a
fixed-width tab test. A follow-up CSS correction and real action-popup check
restore a 410 px User body (380 px Developer body) without horizontal overflow;
reload the unpacked extension to get this display-only fix.

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

The following troubleshooting notes describe the older, manual-session UI.
In current User Mode, browsing starts automatically when the saved pairing,
Chrome HTTPS grant, service and eligible focused window are available; the
Start button is no longer shown. If an older build's **Start browsing session**
stays disabled, check the eligibility
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
Unsent human discussion drafts stay only in popup memory. Private generated
insight results instead have the bounded RAM lifetime described above. These
are local test discussions, not
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

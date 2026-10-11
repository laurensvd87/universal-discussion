# ADR-080: Bottom composer, deliberate-post reveal and actionable citations

Date: 2026-10-10.
Status: owner-requested product refinement; implemented and verified in 0.13.38.

## Owner request and evidence

The owner reports a completed price reply that names retailers but supplies no
product links. A read-only check of the exact matching saved generated post finds
zero persisted citation links. The normal service's content-free success trace
records a completed search/assistant through the strict finalized-stream fallback;
it does not contain URLs or annotation contents. No raw original provider response
was retained. This establishes that the stored message has no hidden citation,
not whether every intermediate provider event lacked annotations or whether the
retailer claims were correct. Do not guess a product URL or backfill that post.

The owner also requests a compact new-thread composer always at the bottom,
scrollable threads and related discussions above it, and automatic expansion,
scrolling and focus of a deliberately posted human or generated reply.

## Decision

- In User Mode, separate the discussion feed from the root-composer dock. The
  native panel uses its viewport height: the feed scrolls, while the compact
  new-thread composer/model/actions remain reachable below it. Related
  discussions stay after canonical threads. Settings and disconnected welcome
  have their own scrollable view. Very short panels may scroll an oversized dock
  rather than hide controls; no horizontal overflow is acceptable.
- Keep one form. A reply/edit form stays immediately below its target, not in
  a duplicated bottom form. A bottom new-thread shortcut returns it to the dock.
  Detached drafts remain detached; moving a form never reauthorizes a write.
- A successful creation/share command supplies its accepted contribution ID as
  a RAM-only presentation cue. Emit it only after a canonical fresh read in the
  same actor, Source, Topic and discussion context. It never enters requests,
  storage, generated proof or write authorization. Failure/uncertain writes,
  changed context and unrelated catalog arrivals do not manufacture a cue.
- Reveal the target's complete ancestor lineage, scroll it into view and focus
  the new post once. Keep generation progress at its reply target. Subsequent
  polling must not steal typing focus or reopen a branch the reader closed.
  Reduced-motion preferences apply to explicit scrolling as well as animations.
- The broad reply prompt requires an adjacent exact-page citation for each
  researched named retailer, listing, price or shipping claim, even if delivered
  cost remains unverified. If an exact listing cannot be cited, do not describe
  it as a found/actionable offer. This is a prompt instruction, not a guarantee
  of provider compliance or factual correctness. Do not infer claim attribution
  from the tool's complete source list or invent a URL from a merchant name.

## Unchanged boundaries

Opening Insights retain selected-page research and `[refN]` mapping. Broad
replies retain ADR-078 discovery and ADR-079 primary-page compatibility. Accepted
citations still need safe URL/span validation and the existing completed search
and identity checks; the combined five-distinct-source limit remains. Canonical
reply targets, exact result proof, account/Source/Topic binding and one-use local
sharing remain. No provider output/schema or citation-trust relaxation, new
permission, automatic generation/retry/post intent, model, retention, crawler,
remote deployment or release approval follows.

## Verification

Sol Medium coding slices and an independent Trust review pass. Focused panel
and controller tests pass 127/127, including root/nested human/generated cues,
inline placement, actor/context invalidation, one-time reveal, later manual
collapse/typing focus and experimental cloud-growth expansion preservation.
Full service: 392 pass, four optional skips. Full extension: 1,107 pass, one
optional skip; capability-denied extension: 1,108 pass.

The synthetic real-adapter/runtime/SQLite round trip passes for both normal
terminal output and strict completed-stream fallback. Two exact annotated
listing links survive proof-bound sharing, SQLite close/reopen and accessible
clickable-arrow rendering; altered link text is rejected before persistence.
The prompt/round-trip focused suite passes 7/7. This is link-pipeline proof,
not a live guarantee that the provider cites every researched claim.

Disposable actual Chrome QA passes independent feed scrolling and compact dock
accessibility at 390x600, 320x600 and 320x400, inline form placement, nested
human/generated post visibility/focus, one-time reveal, keyboard/typing,
citations, settings, zoom and reduced-motion checks. Root inspects the compact
390x600 and 320x400 screenshots. The companion surface exercises real Chrome
layout, not a new native side-panel authentication proof. No provider dispatch
or owner database writes occur during this QA. Secret scans (service 623,
extension 189 files) find zero issues; diff checks pass.

The original price reply has no recoverable product link; it is not rewritten.
No new live inference is made in this checkpoint, and the revised prompt's live
price-answer quality remains unverified. The prior project process is no longer
running and port 4174 is free. The normal service is started with the same Origin,
durable pairing, protected login and SQLite, raw debug off. An unauthenticated
catalog 401 confirms listener availability, not provider/account verification.

Official OpenAI documentation distinguishes inline claim annotations from the
tool's wider source list and requires visible clickable citations:
[Web search](https://developers.openai.com/api/docs/guides/tools-web-search).

## Owner-requested lean inline reply refinement (2026-10-11)

The owner points out that the target message is immediately above its inline
reply form: a repeated quote, author banner and heading consume space without
adding context. The form's second sparkle duplicates the existing message action.
User Mode therefore uses a compact growing reply editor with a send icon, no
visible repeated quote/heading, and no composer sparkle in reply mode. This does
not remove external source citations from generated or published messages.

Keep the actual single form/textarea at its canonical target, accessible target
descriptions and send names, per-message sparkle and root Insight action. Preserve
visible detached/unavailable-target warnings, disabled write behavior, typing,
caret/IME, polling focus, generated result/progress placement and Developer
diagnostics. Visual simplification is not new posting/generation authority.
No provider, persistence, permission or backend change is needed. Final UI and
regression evidence is recorded in top STATUS/HANDOFF for extension 0.13.42.

Sol Medium implementation and independent QA pass: focused panel 77, full
extension 1,118 pass/one optional skip, restricted 1,119 pass. Disposable actual
Chrome verifies compact root/nested placement, accessible send/target, bounded
growth, typing/caret and simulated IME through polling, retained message sparkle
and generated progress, visible unavailable/detached warnings and narrow layout
without horizontal overflow. Root reviews compact and 320 px screenshots;
secret/diff checks pass. No provider request, owner DB change or backend restart.

## Owner-requested direct thread feed refinement (2026-10-11)

The owner puts Topic-title generation on hold and requests no repeated current
page title/domain at the top, a retained sparkle beside Reply, and immediate
visibility of earlier threads started on this same Source. User Mode hides the
source header without changing current-page observation or validation. Canonical
message sparkle actions remain visible but disabled when their existing Source/
context gate is unavailable; Source restoration must refresh their availability.
The compact human composer still has no duplicate sparkle.

The transient controller preloads earlier discussions using only existing paired
loopback GETs from the validated prior-topic list. At most four such reads run
concurrently; current discussion readiness does not wait for them. Epoch, Source,
Topic, catalog/discussion/prior revisions and root-origin identity fence results.
Unavailable reads do not hide the current discussion; unauthorized reads follow
existing session failure handling. No backend schema/API or persistence changes.

Current/alternate matched roots stay first; earlier same-Source roots follow as
normal visible cards with expandable replies, deduplicated by canonical root ID.
Related discussions remain below. Earlier projections do not become inline draft,
generation, edit, deletion or new-post-arrival targets. Their explicit canonical
Open conversation navigation retains the previous manual Topic-opening path;
reading no longer needs that click. Original Topic/Source/post authority is not
rewritten or inferred from display adjacency. Developer navigation/diagnostics
remain. No new provider call/context, retry, permission, retention, grouping,
deployment or release scope follows. Final verification is in top STATUS/HANDOFF.

Sol Medium implementation and independent Trust review pass: controller 62,
panel/UI/layout 90, full extension 1,126 pass/one optional skip, restricted 1,127
pass. Disposable actual Chrome validates delayed prior reads through the real
controller, source filtering, visible earlier roots/replies, explicit canonical
navigation, sparkle adjacency and disabled-to-enabled Source restoration,
focus/caret/IME/reveal/citations/root Insights and narrow reduced-motion layouts.
Root reviews screenshots; secret/diff checks pass. Existing normal service needs
no restart. No live inference or owner DB mutation occurs. Manually opening an
older Topic still clears Source; cross-Topic AI generation is not enabled.

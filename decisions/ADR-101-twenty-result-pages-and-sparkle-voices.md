# ADR-101: Twenty-result pages and sparkle voice menus

- Date: 2026-10-12
- Status: owner-requested local implementation; verification in STATUS/HANDOFF
- Related: ADR-074, ADR-080, ADR-084, ADR-096, ADR-100

## Decision

The owner requests twenty results per page with Previous/Next throughout the
panel and a voice menu behind a small lower-right arrow on the sparkle button.
The main sparkle click still generates; opening/selecting a voice never does.
Twelve fixed styles retain existing local preference storage and clicked-settings
snapshots. Native popovers escape scroll-container clipping; fixed radio choices,
keyboard navigation, disposal and busy/context fences keep controls predictable.
The native Developer selector remains; no always-visible User dropdown remains.

My chats merges separately owner-scoped public/private recent streams into twenty
total results. Page history stores cursor/skip/scroll metadata, never old card
bodies. Replaying Previous re-fetches batches under current version checks.
Fresh entry/Back binds fresh store versions rather than rejecting a valid new
private reply as stale. Strict signed private recent cursors bind account, query,
limit, action, order and owner revision; legacy ID DTO/cursors remain unchanged.
Activity is SQL MAX current-message time, with creation fallback; stream/merge
comparators use the same descending timestamp/ID text ordering. No schema change.

Discover global search replaces windows and re-fetches Previous. Blank Discover
pages the already retained current-context suggestions, never runs external search.
Discussion pages current/earlier roots, related roots, safe page links and each
nested sibling reply list. Created-post cues select the necessary windows before
unfold/reveal; typing, drafts, manual collapse and canonical route proofs remain.
Public inbox previews/private messages use existing bounded read routes. Fast
Discover reply-page clicks are serialized so they cannot skip to an empty page.

## Limits and authority

These are presentation windows, not a canonical ingestion/storage limit. Page
recommendations remain within existing 512 catalog/100 candidate metadata work
budgets. Full validated Discover discussion DTOs retain their existing byte bound;
this change does not implement arbitrary-size full-tree network transport. Private
recency/search aggregation scales with owner data; there is no constant-time claim.
Account/version/context changes clear rejected text. No private projection into
public indexes, new permission, provider tool scope, autonomous request or posting.

## Style quality

Read-only inspection of the two saved public Threadshift posts found mostly
analytical prose, not clearly Funny/Sarcastic. Stored records do not retain selected
voice, so historical tone delivery is not proven. Strengthen only the Funny and
Sarcastic static overlays with one short playful image/ironic line and tiny marked
fictional style examples. Keep original Standard prompt/packet exactly unchanged,
all factual/research/citation/privacy/120-word rules and harm-sensitive exclusions.
No rewriting historical posts or treating tone examples as evidence. The OpenAI
Docs skill informed tone/task separation and few-shot examples, following
[official prompting guidance](https://developers.openai.com/api/docs/guides/prompting).

The owner explicitly approved two synthetic live checks using the cheapest
eligible model, without web research, saving or posting. Exactly two GPT-6 Luna
requests completed: Funny used a cable-parking-garage image (69 words), Sarcastic
questioned an "effortless" setup (71 words). Both stayed within supplied facts.
This is a small qualitative check, not reliable humor calibration across topics.
The guarded opt-in harness exclusively claims port 4174, rejects tools, caps two
attempts and emits only bounded accepted invented-fixture text; no raw stream.
The approval is consumed, not reusable for future inference.

## Verification and activation

Independent Trust reviews signed cursors/legacy bytes/owner fences, real private
send-to-Back, rapid paging, voice stale-choice/busy/disposal and exact retry packets.
Actual isolated Chrome checks twenty-card replacement/replay, search hit 57,
private/public previews, 45 suggestions, narrow/enlarged text and open menu fit.
Synthetic fixtures are not proof of the owner's live Chrome connection.
Final suite counts, screenshot review, secret scans and owner-approved idle restart
preservation are recorded in STATUS. Routine restarts do not authorize busy-work
interruption, remote deployment, mail, store submission or expanded data scope.

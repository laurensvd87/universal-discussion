# Implementation handoff: local-service discussion MVP

2026-10-08 owner-approved local real-data research: [ADR-065](../decisions/ADR-065-local-multilingual-corpus-research.md)
allows a private, offline GlobeSumm evaluation only; the corpus is outside
Git and no publisher-rights/product-training or release clearance follows.
The first deterministic 1,192-article/96-event sample from 4,687 articles
showed the offline E5 title+lead/complete-link-0.94 baseline joining
14/7,049 true same-event pairs and one different-event pair, leaving 1,177
groups. There is one exact title/lead duplicate across gold events, and no
viewpoint/family gold. The 1,200-article compute budget is not a Topic-size
limit. At least one true-event partner ranked in the first three candidates
for 1,141/1,192 scored reports, but rank three is a diagnostic rather than
a fixed identity cutoff. The next research question is candidate admission, not
another unvalidated threshold; no live matcher or owner DB changed.
The first train-only pair classifier admitted 20/803 correct pairs and
0/10,372 incorrect pairs on 150 event-disjoint validation articles; its
2.5% recall is inadequate. The 293 selected test reports remain untouched,
no trained weights were persisted, and no live code changed.

2026-10-08 fresh synthetic validation after the frozen 180-article
[multilingual corpus v2](../apps/local-service/experiments/topic-encoder/multilingual-train-v2/README.md):
the [hard-negative projection v3](../apps/local-service/experiments/topic-encoder/multilingual-projection-v3/README.md)
joined 0/120 true pairs, zero false, and the independently designed
[two-view pair classifier v4](../apps/local-service/experiments/topic-encoder/multilingual-pair-v4/README.md)
joined 2/120 true, zero false. Neither recovered any of 12 whole events.
The older projection v2 joined 9/120 true and zero false on this fresh slice,
but it already made six hard false joins on another family-disjoint slice.
All remain offline negative results; do not activate or lower a threshold
based on one split. The owner-approved local-only real multilingual benchmark
is recorded above; the independent synthetic v3 holdout remains unscored.
Data/rights, retained representation,
owner DB migration and live activation gates remain intact.

2026-10-08 later offline checkpoint: [v7](../apps/local-service/experiments/topic-encoder/topic-event-v7/README.md)
kept a 102-report varied synthetic Topic together without adjacent mixing,
but joined 0/80 multilingual validation true pairs. A permissive bridge
produced false joins and was rejected. A [384-weight metric head](../apps/local-service/experiments/topic-encoder/multilingual-metric-v1/README.md)
also gave no gain over raw E5 (38/40 true rank-one partners, 1/80 admitted
true pairs, zero false at a train-only cutoff). Neither is activation-ready.
An [offline exact cursor](../apps/local-service/experiments/topic-encoder/expandable-retrieval/README.md)
supports expandable batches and `unresolved` work exhaustion without a fixed
Source count. Its static, synthetic benchmark is not production scalability.
Next: broader original multilingual training data and a learned event-specific
representation, then untouched holdout and separate real cross-publisher
evidence. Do not lower a threshold just to force Topic joins. The owner/Trust
representation, retention, migration and live regrouping gates remain.
A [rank-eight projection](../apps/local-service/experiments/topic-encoder/multilingual-projection-v2/README.md)
also remains offline: it admitted 31/80 multilingual true validation pairs
but six adjacent-event false pairs at a train-zero-false cutoff. This fails
the precision-first gate despite improved recall. Its weights are not shipped.

2026-10-08 offline grouping update: [v5](../apps/local-service/experiments/topic-encoder/topic-event-v5/README.md)
demonstrated that fixed reciprocal top-three seeds and complete-link can
fracture a 20-report synthetic event into ten Topics. [V6](../apps/local-service/experiments/topic-encoder/topic-event-v6/README.md)
has no fixed member/exemplar count and kept 100 varied synthetic same-event
reports together beside three adjacent reports, but split two weak true
outliers. On five-language family-disjoint development validation it joined
21/80 true pairs and no false pairs, with no complete gold Topics recovered;
this is no improvement over v5. V6 still scans all catalog pairs and uses v5
seeds. It is a frozen offline negative/partial checkpoint, not a live matcher
or migration. A separate 60-article multilingual v3 holdout is sealed and
unscored; do not tune on it. Next test a candidate that can establish a
high-evidence cross-language event group from unseeded pages, with local
competing-event checks and no fixed Topic-size/top-K identity gate. Later
service design needs indexed expandable retrieval and affected-neighborhood
updates; a retrieval batch limit may not become an identity or Source-count
limit. New retained focus representation, historical regroup and root moves
remain owner/Trust-gated, as do real-data validation and activation.

2026-10-08 extension 0.13.27 fixes read-only related-discussion visibility:
the popup checks the existing ranked related-result list in batches of four
until it finds four nonempty discussions or exhausts the list. It previously
stopped after four candidates regardless of posts. Topic routing, ranking,
matching and data retention are unchanged. This is a UI mitigation, not an
answer to multilingual same-event admission or backend search coverage.

2026-10-08 precision-first Topic method checkpoint: the owner prefers missed
automatic joins to false discussion joins, but rejects static global
catalog-size/neighbor-margin gates and wants related discussions to soften
an empty primary Topic. [ADR-064](../decisions/ADR-064-event-evidence-topic-graph.md)
proposes broad local candidate retrieval followed by conservative
same-event evidence, with uncertain matches kept as related. The new
[partition benchmark](../apps/local-service/experiments/topic-encoder/topic-benchmark/RESULTS.md)
shows a frozen body-E5/title-cue v3 at 6/48 true and zero false on a synthetic
English challenge; an ephemeral title/lead-E5 + facet focus graph at 44/48
true and zero false there and 33/54 same-storyline, zero cross-storyline on
a limited single-publisher CDEC-WN set. However the focus graph joined
**0/72** true translated pairs on a fresh 48-page multilingual challenge,
despite focus E5 retrieving a true top-3 neighbor for 46/48 queries. Its
triangle rule still checks every outsider and is not the final scalable
method. Do not tune frozen candidates on the scored sets, activate them,
retain a second vector/facets, change the existing body-E5 extractor, or
regroup owner data from this evidence. The app already has a related-discussion
read path; improve retrieval there without treating vector rank as identity.
Any new focus representation or routing policy requires explicit owner/Trust
review, stamp/recapture/Forget and whole-root migration design, real
cross-publisher labels and scale tests.

2026-10-08 grouping correction boundary: the owner rejects the existing
catalog-wide .04 outside-neighbor lead. [ADR-023](../decisions/ADR-023-adaptive-topics-source-anchored-subthreads.md)
records its structural scaling failure; a new
[offline shadow](../apps/local-service/experiments/topic-encoder/grouping-shadow/README.md)
shows that simply deleting the lead creates an adjacent-event false join.
Design/test a replacement using full event neighborhoods and event-specific
conflict evidence, preserving manual pins, supported splits and whole-root
routing. Do not activate an untested rule or silently regroup owner data.

2026-10-08 further Topic-encoder checkpoint: two compact, genuinely trained
dual-view E5 heads and a single-pass head remain offline experiments. A frozen
56-page Luna-authored English challenge favored **unchanged title + lead E5**:
48/48 paired-query rank-1 and 40/48 true pairs accepted at a validation-only
cutoff, with 0/72 same-entity hard false pairs and 8/8 separate-family
singletons abstaining. The CDEC-trained dual head accepted 24/48; the
Luna-trained dual head 32/48 with one hard false join. The single-pass head
failed its validation gate and was not challenge-scored. Read-only QA
reproduced the results. These labels are synthetic and the unmatched pages
do not test a new development of a represented entity. No public-page
snapshot was collected, no new real-web result is claimed, and no app input,
stored vector, threshold or Topic assignment changed. Further labels and a
separate owner/Trust migration decision are required before activation;
see [the experiment](../apps/local-service/experiments/topic-encoder/real-model/README.md).

2026-10-08 follow-on Topic-encoder research: the owner authorized extended
autonomous local training. [ADR-063](../decisions/ADR-063-topic-focused-embedding-shadow.md)
now also records a supervised 384D E5/title-lead projection, two new frozen
synthetic checks and a CC BY 4.0 CDEC-WN Wikinews storyline check. The
projection did not beat raw E5 on unseen retrieval (24/24 tied; 76/76 tied;
165/176 versus E5 168/176 on full real-storyline gallery). A reciprocal-
neighbor dynamic rule made false joins in the fresh synthetic challenge.
Keep both inactive; neither score calibration nor same-Topic identity is
validated. See [measured report](../apps/local-service/experiments/topic-encoder/next-eval/RESULTS.md).
The real dataset archive is hash-pinned and Git-ignored under experiment
`.work/`; no app/owner data or provider transfer follows. No owner-data
revectorization, database migration, new extension asset, permission or
discussion move is authorized or performed.

2026-10-08 owner-directed Topic encoder shadow: [ADR-063](../decisions/ADR-063-topic-focused-embedding-shadow.md)
adds synthetic-only E5 topic-head, fused-vector and text-cue comparator
experiments under `apps/local-service/experiments/topic-encoder/`. The first
independent 80-document English holdout is negative for the learned head
(same-subject rank 1: 40/80 versus raw E5 48/80); the text-cue scorer reaches
61/80 but requires historical body text the service does not retain. All
validation-selected zero-false-pair cutoffs accept zero held-out positive
pairs in that set. A later independent 104-document stress set found raw E5
76/104 same-subject rank-1, learned head 63/104, and fused one-vector 46/104;
even raw E5 had three false pairs at its validation-selected strict cutoff.
The read-only six-public-Source pilot shadow also favors raw E5 (2/6 same-
development first neighbors versus 1/6 for the head), but has only two such
assistant-judged pairs and is not independent human gold.
**Do not**
replace live embeddings, re-vectorize owner data, change the .90/.94 routing,
store a second vector/body text, migrate discussions or infer real-page
accuracy from these synthetic checks. The current extension/local service
remains the testable product. Any activation needs the ADR-063/044 data,
quality, security and owner gates; external search is still parked.

2026-10-08 owner-directed dynamic Topic Atlas refresh (ADR-062): `npm start`
keeps the separate dashboard program running, polls only the read-only SQLite
generation/revision, atomically updates sibling `snapshot.js` on change, and
the local-file dashboard checks it automatically and via Refresh. No listener
or provider. `--no-open` remains one-shot. Keep the terminal open for live
updates; Ctrl+C stops monitoring but retains last local HTML/JS snapshots.

2026-10-08 standalone owner visualization: ADR-061 adds
`apps/topic-dashboard`, a separate read-only SQLite-to-self-contained-HTML
Topic Atlas. It displays learned public pages, their current Topic links and
nearest-vector edges; generated output lives in OS temp, not Git. Re-run for
fresh data. It does not bind a listener, contact provider, change the extension
or mutate the service DB. Current read-only count: 118 total Sources, 110
learned pages, 95 represented Topics, 132 total Topics. See its README for
launch and privacy/capacity limitations.

2026-10-08 latest owner-approved window behavior: ADR-060/extension 0.13.26
preserves auto-start eligibility when the bound normal browser window closes.
The next focused eligible window in the same separate public-only profile can
bind after existing pairing, grant, service and page checks. Deliberate Stop
remains sticky, and the old in-flight work is fenced. Focused offline tests
pass; owner Chrome confirmation is open. There is no fixed page-count quota,
but snapshot/response size and processing ceilings remain. Do not run a
fixed-port synthetic Chrome service over the owner's live 4174 service.

2026-10-08 latest owner finding: the missing Topic was caused by **Matching
off** in the owner's session; after Resume, the supplied public article was
stored and Topic-linked. Default auto-start for a fresh eligible session was
already implemented; explicit Stop persists for the current browser session.
Extension 0.13.25 clarifies the grey toolbar tooltip when matching is off.
The exact reason the owner session was off remains unproven. A fixed-port
synthetic Chrome smoke must not replace the owner service while the owner
browser is active: a concurrent 401 could clear pairing and Stop capture.
The harness was updated for current User Mode but not rerun end-to-end. See
STATUS for evidence and remaining owner verification.

2026-10-08 latest capture reliability: extension 0.13.24 adds bounded
popup-closed retries for transient authenticated service/foreground/matcher
failure on the same eligible active tab. It does not scan inactive tabs,
continuously observe page DOM, or add permissions. Stop/block/window close,
permission revocation, unpairing and navigation fence retries. Chrome MV3
may suspend the worker, so long outages still need a later tab/focus event
or explicit retry; owner Chrome confirmation remains open. See STATUS.

2026-10-08 latest visual refinement: extension 0.13.23 replaces visible
"Loading discussions" prose with two decorative animated conversation-card
placeholders. The live text remains screen-reader accessible; reduced-motion
settings stop animation. The scene appears only during active loading and
does not alter draft, Post or Insight gates from 0.13.22.

2026-10-08 latest UI loading refinement: extension 0.13.22 removes the
page-title Topic header in User Mode. Active page resolution/read says
**Loading discussions…**. Once a Source/Topic selection exists, the root
composer accepts memory-only draft text during the discussion read, but
submit is gated on the ready snapshot and navigation detaches staged text.
**Get insights** is greyed out until both discussion and related-page context
are loaded. No Topic identity, backend association or provider behavior changed.

2026-10-08 latest UI/prompt refinement: extension 0.13.21 shows each Insight
source as a raised `↗` link rather than a number or `?`, retaining the visible
unverified-source note and accessible label. The opener prompt prioritizes a
supported cross-source difference when exact selected-page evidence is
available; otherwise it stays grounded in the current extract. This is a
prompt/UI change, not proof of provider access or improved live quality.

2026-10-08 latest: [ADR-059](../decisions/ADR-059-model-reported-selected-links-unverified.md)
records the owner's explicit acceptance of model-written `[refN]` links as
**unverified** hints, not attested citations. `ref1`–`ref5` resolve only to
server-selected public URLs; malformed/unknown IDs and foreign provider
annotations reject, and completed search plus deliberate Share remain.
At 0.13.20 the preview and shared posts used a visible `?`; 0.13.21 replaces
that badge with `↗` while retaining the unverified-source note. A one-shot
public PCGames/GameStar QA returned one private
78-word result with one selected model-ref link, without raw answer logging
or sharing. Factual support/page access is not proven. The service was
restored with unchanged state. No automatic fallback/retry or publication gate follows.

2026-10-08 continuation: The owner chose strict selected-URL IDs rather than
same-publisher citations. [ADR-058](../decisions/ADR-058-selected-web-reference-ids.md)
implements server-assigned `ref1`–`ref5` and accepts `[[webref:n]]` only with
an exact selected URL in a completed ChatGPT search's consulted source list.
Foreign provider annotations still reject; the popup formats an attested ref
as a clickable superscript. Two public PCGames/GameStar live calls after the
change did **not** yield a safe draft: one still cited another GameStar page,
the stricter prompt then wrote one ref without an exact selected source hit.
Do not assume a model-written ID verifies page access, or hide the foreign
provider citation. ADR-059 later permits only visibly unverified model-ID
links. No automatic fallback/retry, publication or broader
provider permission follows. The local service is restored with existing
state. Gather an explicit owner trust/usage choice before changing these
boundaries; user-visible current-page-only research remains opt-in.

2026-10-08 checkpoint: [ADR-057](../decisions/ADR-057-hosted-search-citation-scope-open.md)
records a reproduced PCGames `response-web-citation`: ChatGPT cited an
unselected same-publisher article after completed search. Exact selected-URL
validation remains in force; do not loosen it or add automatic retries. Three one-shot public QA Responses
calls were made, none shared; service is restored. In parallel, the isolated
[Topic-title PoC](../experiments/topic-titles/README.md) passes 12 offline
checks using shared phrases and existing-vector representative ranking.
The owner-local catalog is too sparse for its strict keyphrase rule (zero
supported titles across 85 learned Topics); no production title behavior,
second vector, migration or model was added. A frozen multilingual label
evaluation and owner approval precede activation.

2026-10-07 owner-directed Insight source selection (ADR-055, extension
0.13.18): exact/tracking URL and same-host stable-article-ID aliases now use
one slot. Recognizable search-result tabs are omitted from Insight sources,
not from background capture/Topic membership. Distinctive title and weaker
URL-path overlap rerank candidates for the specific article/event before the
20 locally reversible choices and five provider URLs are chosen. Zero overlap,
including many translated or differently framed reports, retains embedding
order; this is not verified event identity. The final five remain a subset of
the displayed 20 and are independently rebuilt by the service. A generated
private draft with no validated outside citation displays **No outside sources
cited** separately from the post body; zero citations do not prove no link was
consulted. No new provider call, permission, Topic migration, data retention
or release approval follows. See current STATUS for tests and remaining owner
Chrome verification.
An isolated Chrome smoke also revealed that a coherent Source switch could
clear the previous Insight without immediately preparing the new Source.
The controller now clears stale material and prepares the new ready context
without an AI call. Restricted extension 994/994, service 253 passed/four optional skips, loopback
2/2, secret scans zero and isolated Chrome smoke PASS after that fix. The
local service is restored with the same Origin, pairing and SQLite data.

2026-10-07 newest owner direction (ADR-054, extension 0.13.17 implemented):
related-source content for Insights should come only through the connected
ChatGPT Responses `web_search` tool, not the extension's anonymous HTTP reader.
Keep the bounded current-tab extract as subject and background vector matching
unchanged. Use up to five selected eligible public HTTPS URLs after exclusions
and sensitive URL/path checks; no page-fetch preflight. The catalog has no
reliable access/paywall marker. Old related excerpts must not be relayed to
ChatGPT. Keep one explicit Get insights request, exact URL citation checks for
external claims, private draft and separate Share. The owner also requires a
current-page-only private draft after a completed search if all selected URLs
are inaccessible; no uncited external claim should be solicited. The UI keeps
20 reversible choices locally; only the post-exclusion five reach the paired
service/ChatGPT. Excluding all 20 cannot pull in an unseen 21st choice. The service rebuilds that selection from its own catalog and
rejects older clients' locally fetched related excerpts. Turning research off
strips related URLs/titles from the provider payload. Independent Trust review
found no remaining blocker. Restricted extension 981/981, service 253 passed
plus four optional skips, integration 2/2, zero secret findings and isolated
Chrome smoke PASS on second run (first late UI wait timed out). One additional
approved public PEP ChatGPT request returned a private exact-cited draft;
**seven** Responses requests total, none shared. The owner service was
restarted with the same Origin and data. Reload extension 0.13.17 for
real-page confirmation; no general publisher access is promised.

2026-10-07 newest owner direction: a cache of the current user's past visits
does not solve cross-user source context. The owner now authorizes testing up
to 100 ChatGPT HTTP research requests (fewer preferred). ADR-053 supersedes
ADR-052's no-search rule only for explicit Get insights when selected public
related URLs have no accepted anonymous excerpt. Isolated live SIWC tests
proved hosted search/citations on PEP pages and one RD article, while the
De Standaard Kyiv article remained unavailable (provider-reported fetch/cache
and robots.txt failure). Two production-path PEP QA requests returned private
cited drafts with account-listed `gpt-5.6-luna`. The final path requires a
completed web-search call and citations to exact missing candidate URLs;
unannotated links are rejected. Six Responses requests total; no draft was
shared. Trust re-review found no blocker; full service/extension/loopback/
isolated-Chrome checks and secret scans pass. The owner service is again
listening on 127.0.0.1:4174 with the same Origin and durable pairing. Reload
extension 0.13.16. This is not universal publisher access: De Standaard
remained blocked for ChatGPT, and a citation may reflect a snippet rather
than the full article. See STATUS and ADR-053.


2026-10-07 owner correction: ChatGPT must not make web-search calls. ADR-052
implements the fail-closed no-tool request and text-only Insight boundary in
extension 0.13.15. The extension already supplies up to 4,096
characters from the current article and, when anonymous direct fetches
succeed, up to four 2,048-character related excerpts. A De Standaard Kyiv
case replay accepted zero of its four selected excerpts; no source link can
be guaranteed. Do not expand raw-text retention, provider payload or fetch
budget without a separate owner decision. The updated service is running with
the same Origin and durable pairing; extension reload remains for the owner.
Restricted extension 973/973, service 238/242 (four optional skips), loopback
2/2, both secret scans and independent Trust review pass. No live provider
request was made. See current STATUS.

2026-10-07 ADR-051 continuation: extension 0.13.14 uses model-placed
`[[ref:n]]` markers only for actually supplied related-page excerpts. The
service resolves each number to its validated selected Source URL, and the
popup turns it into a numbered, clickable superscript beside the claim;
existing provider web citations coexist. The model prompt requires the same
specific subject, but cannot guarantee it. The current Topic remains above a
separately labeled read-only Related discussions section. No Topic merge,
cross-Topic reply, new fetch/provider call, permission, retained page text or
owner-data migration is implied. Reload extension and restart local service;
no pairing/data reset. Restricted extension 973/973 and service 238/242 (four
optional skips) and loopback integration 2/2 pass; independent Trust review
found no remaining blocker. The owner service was restarted with the same
Origin and durable pairing. Owner real-page behavior is still unverified;
check STATUS for detail.

2026-10-07 reference-page follow-up: extension 0.13.13 fixes an inert/hidden
`<article>` decoy masking a visible `<main>` excerpt. Socket-denied tests
cover reader-to-Insight forwarding; a single public PEP ChatGPT QA used three
excerpts. Anonymous news-site 403/redirects still cause zero-text context for
those candidates; do not claim Chrome or general-site coverage. A synthetic
adaptive whole-neighborhood shadow fixes the .92 three-page split but falsely
joins a .93 different-event pair. Do not activate it or regroup owner data;
see current STATUS and ADR-044/049 gates.

2026-10-07 Insight stability correction: the owner approved
[ADR-050](../decisions/ADR-050-stable-private-insights-across-unrelated-catalog-changes.md).
An unrelated catalog revision must no longer discard a private Insight.
The Source/Topic/account/follow-up binding and current-revision CAS remain
mandatory at explicit Share. Extension 0.13.12 also avoids redundant identical
page ingests and repeated unchanged resolution rendering. Restart the local
service and reload the extension; no pairing or data reset is intended.

2026-10-07 101st-page follow-up: the 0.13.10 service accepted the owner's
101st Source/Topic, but the extension's catalog DTO still rejected >100 rows
and displayed `Local service unavailable`. Extension 0.13.11 removes the
coupled client/Insight/related-ranker count assumptions within the existing
byte/result guards. No data or pairing reset is needed; reload the extension
and restart the service for the shared ranker. See current STATUS.

2026-10-06 catalog-capacity correction: [ADR-049](../decisions/ADR-049-remove-prototype-catalog-count-ceiling.md)
supersedes the historical 100-Source/100-Topic prototype cap below. Fixed
Source/Topic counts are removed. The current snapshot, catalog-response and
global planner-work guards remain; normalized storage and an indexed/incremental
matcher need a separate reviewed migration before scale claims. Existing owner
data was not migrated or reset.

2026-10-06 related-page followup: The real local catalog can nominate up to
20 related Sources, but only four other selected pages can supply excerpts to
an explicit Insight request. A prior HLN check got zero accepted anonymous
excerpts. One previously supplied Vietnam.vn candidate is 583,306 bytes and
starts its main region beyond the current 96 KiB response cap; an in-memory
768 KiB/8,192-token reader variant accepted 2,048 characters without a
provider call or persistence. That larger fetch scope is **not activated**:
ADR-044/Trust require a narrow owner-local approval, which has been requested,
as has separate permission for one live ChatGPT quality test. Do not infer
approval from this diagnostic. The current reader now gives bounded,
content-free eligible/attempted/accepted and fixed failure counts in Developer
Mode memory; no raw data or User Mode diagnostic UI was added. The current
96 KiB cap, four-page/2,048-character provider limits, source exclusions,
public HTTPS guard and no-Google-fallback rule remain unchanged.
Extension 0.13.4's full suite passes 922/923 with one optional skip; the
secret scan found zero issues. Reload the extension to use Developer Mode
diagnostics after a deliberate Insight attempt.

2026-10-06 bounded continuation: Extension 0.13.3 changes User Mode only:
first-run Connect is above the fold at 410/320 px, Enter pairs through the
existing guarded handler, and the main Insight button shows setup/related-
preparation/research state. Reload the extension; no service restart is needed.
Full extension checks pass 633/633, local-service checks pass 221/225 with
four optional skips, and isolated Chrome visual checks pass. The
synthetic v2 SQLite rehearsal adds transactional learned-Source Forget with
11/11 socket-denied tests. An isolated near-copy nomination probe has 4/4
socket-denied tests. **Neither probe is active in the local service**, changes
the current grouping rule, or touches retained owner data. Their activation,
full lifecycle/migration and any new data representation still require the
separate ADR-044/Trust/owner decisions. Do not promote either on test counts
alone.

2026-10-05 R5 reviewer decision: The owner explicitly chose to be the sole
human reviewer for the local PoC. [ADR-046](../decisions/ADR-046-owner-only-exploratory-r5-review.md)
permits owner-only exploratory pilot ratings; do not ask for an independent
person just to try the pilot. The owner has rated frozen pair 001 only. The
owner has already seen some cosine scores, so hide scores in any task and do not claim blinded
independent validation. The older distinct-role completion path remains a
separate future quality gate, as do scale-up and AUTO activation.
The owner-only task preparer passed 5/5 synthetic checks and read-only Trust
review. Its create-only ignored snapshot is now frozen from six approved Sources
into 15 pair prompts; one owner answer was recorded later. In the R5 pilot
directory, `node owner-review.js view` renders the task locally without scores
or vectors. Never
regenerate the pair IDs from a later inventory or call these judgments blind
independent secondary ratings.

2026-10-06 R5 triage: The owner answered frozen pair 001 `different-topic`
and asked the LLM to handle obvious cases. ADR-047 records this narrow
title/date-only conversational triage: eight AI-suggested different, two same,
four uncertain among the 14 remaining pairs. Owner answer and AI suggestions
are separately stored under the frozen digest in ignored local files. Do not
turn suggestions into human labels, claim a blind benchmark, or change the
production threshold. No raw article body was supplied to the model for that
title-only step.

2026-10-06 R5 content-evaluation exception: The owner subsequently authorized
the assistant to read the approved public pilot articles transiently and judge
Topic pairs for offline testing, while insisting that the actual matcher use
no LLM. [ADR-048](../decisions/ADR-048-llm-evaluation-nonllm-runtime-matching.md)
sets this narrow boundary. The six-source/15-pair assistant judgments are in
an ignored file, separate from the owner's answer and not human gold. The
shadow comparison under `apps/local-service/experiments/r5-pilot/` is
candidate-only; do not activate it as same-Topic joining, tune thresholds
on six records, or change production data without another reviewed decision.
An additional in-memory title-vector comparison with the installed E5 model
was tested on the six pilot titles and the unchanged 32-document synthetic
hard-negative corpus. The six-page blend looked better at the old 0.90
reference cutoff, but the synthetic held-out split passed 10/12 distinct-
Topic hard negatives at title weight 0.25. Seven socket-denied tests and a
read-only Trust review accepted the experiment boundary, not activation.
See [probe notes](../apps/local-service/experiments/r5-pilot/title-vector-README.md).
Do not retain a second vector, use the old cutoff in the new score space or
claim this solves same-Topic identity.

2026-10-05 R5 checkpoint: The owner answered yes to the proposed local
200–250-pair public-page review set with URL/title/provenance, existing-model
vectors and later human labels, without raw page text, private pages,
provider calls or publication. See [ADR-045](../decisions/ADR-045-r5-public-pair-acquisition-checkpoint.md).
This is owner permission for acquisition in principle, but it does not supply
the exact origins, date range, title rights, derived-summary field decision,
Trust disposition or independent people required by the existing acquisition
plan.
At that initial checkpoint no real pair was acquired; do not treat the 6/6
synthetic exercise as the review. The exact pilot and reviewer-timing amendment were subsequently
approved as recorded below; the full R5 task remains separately gated.
No model, threshold, Topic routing or owner DB change follows.

2026-10-05 R5 pilot follow-up: The owner then approved the exact three-origin
24-page/30-pair English-news pilot, short original factual summaries, and
deferring independent reviewer names until before labeling. Trust gave
conditional acceptance: isolated production-reader/E5 capture must not write
the live database; check and record page-level title rights, metadata origin,
publication time, evidence time/digest and accepted/rejected reason. Raw page
text is transient and must not enter web tools, model context, logs or files;
summaries stay blank until an authorized human writes them locally. ADR-045
and the P1.2 continuation narrowly supersede the old pre-acquisition reviewer
staffing gate for this pilot only. The isolated capture harness then passed
10 socket-denied checks and two local Chrome fixtures; Trust accepted the
one-page real path. Three provenance-screened public Source records, one from
each approved origin, are now saved only in the Git-ignored local workspace.
Their three cross-publisher comparisons are unlabeled; no review task, live
database change or committed real data exists. Scale-up, independent labels,
split and AUTO remain gated.
Three additional page-level-screened Sources on the WHO pandemic declaration
and African response brought the ignored inventory to six accepted records.
The two declaration reports score 0.9156 cosine; no pair is labeled or
prepared for blinded review yet. Before labeling, recruit an independent
reader as specified by ADR-045 and the P1.2 plan.

2026-10-05 extension 0.13.2 checkpoint: Insight candidate selection now uses
up to 20 local related nominations on both popup and service, with exact
server-side context reconstruction. It keeps the current Source plus four
non-current slots and at most four anonymous related fetch attempts. Validated
provisional Topic peers retain backend relevance order; a bounded lookahead
prefers host/exact-title variety within same-Topic and related buckets.
It does not classify viewpoints, change Topic IDs or move posts. Trust review
found no blocking data-boundary issue; socket-denied extension tests 914/914,
service 221/225 (four optional skips), and focused reader/context 58/58 pass.
The isolated Chrome smoke was unavailable here (`spawn EPERM`, then local
loopback bind failure on escalated retry); do not record a browser pass.
Reload extension and restart service together. A separate synthetic-only
[subject-rerank probe](../apps/local-service/experiments/topic-cloud/subject-rerank/RESULTS.md)
found better opposing-view rank with small title cues, but 3/12 held-out hard
negatives still led under its strongest rule; a post-measurement correction
precludes a preregistered quality claim. Do not activate the reranker or alter
automatic grouping from this. The 100-Source/Topic cap and owner-data
migration gate remain. Reliable same-subject joins need provenance-approved
real-pair review before a production rule.

2026-10-05 Topic-cloud clarification: Russia/Ukraine was only a test, not a
domain limit. The owner wants a growing, graded and overlapping cloud of pages
for arbitrary subjects. Opposing views on the same subject must remain close
in topical relevance; argument difference is a separate axis. The original
mandatory precise-Topic/Collection hierarchy is withdrawn. Revised
[ADR-044](../decisions/ADR-044-continuous-topic-cloud-and-insight-diversity-proposal.md)
is a proposal, not activation: preserve stable discussion/root/reply identity
while testing overlapping neighborhoods and diversified four-slot Insight
selection. Independent review found history-dependent .92 triad grouping and
ID-/publisher-biased source choice. Read-only aggregates: 92 total Sources/83
total Topics, including 84 learned Sources/70 learned Topics, 57 singletons
and 185 cross-Topic pairs >=.90; these are unlabeled geometry, not merge
targets. The 100-Source/Topic JSON-state ceiling is near. No grouping rule,
schema, data, model, provider call or UI changed. Safe next coding slice is
synthetic shadow evaluation of candidate construction, graded relevance and
diversified selection; no further taxonomy choice is needed for that slice.
Normalized SQLite migration on owner data and any extra retained
representations remain separate approval gates.
The first isolated [synthetic Topic-cloud shadow](../apps/local-service/experiments/topic-cloud/README.md)
is implemented with 9 passing socket-denied tests. It covers overlapping
graded results, deterministic ranking, >100 synthetic nodes and four-slot
diversity, but its deliberately misleading false friend still enters Insight
selection. This is a mechanics checkpoint, not E5 calibration or production
activation. Next, measure existing-vector recall and query cost on a safe
synthetic corpus before proposing a data migration or new representation.
An isolated [normalized SQLite dry run](../apps/local-service/experiments/topic-cloud/sqlite/README.md)
also has 4 passing socket-denied tests: 140 synthetic Sources/vectors persist
across reopen, indexed bounded neighbor/page queries work, edge changes do not
change root/reply identity, and bad batches roll back. It deliberately lacks
the full ADR-023 Forget/withdrawal/legacy-pin lifecycle and an owner-data
migration. Do not point the prototype at `demo.sqlite` or assume its schema
is production-ready. Prepare a complete synthetic legacy-state migration and
recovery design before the explicit owner-data/security gate.
That [migration/recovery design](../apps/local-service/experiments/topic-cloud/sqlite/MIGRATION_RECOVERY_PLAN.md)
is now documented. It maps all retained JSON fields and proposes synthetic
transaction/fault-injection checks, no invented Source lineage, and a separate
decision on one-time backup/shadow versus post-commit recovery risk. It is not
an executable migration or permission to copy/open the owner database. Next
safe slice: implement and verify the synthetic round-trip/lifecycle rehearsal;
then present an exact recovery/cutover package for owner/security approval.
First [synthetic v2 rehearsal](../apps/local-service/experiments/topic-cloud/sqlite/rehearsal/README.md)
now passes 7 socket-denied tests for exact round-trip, injected transaction
rollback, schema refusal and cross-kind ID collision. Independent Trust review
was incorporated: the prototype now checks exact synthetic table definitions
and cleans only its named temporary file/empty directory. This is **not** the
complete migration rehearsal or production DDL; `/v1`, learned/agent cases,
live lifecycle commands, stale-version handling and post-commit recovery
remain. Do not ask for a real owner-data cutover yet without that package.

2026-10-04 HLN Insight diagnosis: For the owner-provided public defence-budget
page, the read-only local catalog has no same-Topic peer. Four of five related
suggestions enter the normal Insight context only as related candidates.
The existing anonymous excerpt reader returned zero excerpts in a Node probe
(two HTTP 403, one HTML rejected by reader, one failed fetch); actual Chrome
behavior is not yet measured. The current service process predates the
2026-10-04 same-Topic prompt revision, so restart it before judging the new
prompt. The owner permitted a provider call, but none was made because this
combination would not test the new instruction. No database mutation or
provider output resulted. Do not infer that a prompt tweak alone can compare
pages whose text was not supplied. A retained excerpt cache or broader source
retrieval would be a new data/security decision.

2026-10-04 extension 0.13.1 popup checkpoint: User Mode no longer presents
manual Topic selection or Start session/Choose Topic calls to action. It
shows an automatic-discovery empty state until matching finds a Topic. The
manual Topic/source and correction controls remain Developer-only. Existing
fresh-session capture preconditions, grants, Stop semantics, provider behavior
and stored data are unchanged. The ambient overlapping rings now visibly
converge/separate every 7.2 seconds and are static under reduced motion.
Full extension tests pass 906/907 (one optional skip), zero secret findings
across 183 files, and the 17-state isolated-Chrome visual check has no overflow
or uncaught errors; direct Chrome sampling measured roughly 27 px relative
movement in 1.5 seconds. Reload the unpacked extension; no backend restart
is required for this UI-only increment. Brand/name choice remains open.

2026-10-04 prompt checkpoint: ADR-043 now prioritizes a supported contrast
between the current-page extract and excerpts mapped to provisional same-Topic
Sources, while retaining related-only and single-page fallbacks. This is a
static prompt-only refinement with no new data/permission/provider scope and
no live quality proof. Full service tests pass 220/224 (four optional skips),
with zero secret-scan findings across 88 files. Restart the local service to
activate it. Panl and reScope remain exploratory naming directions, not a
rebrand.

2026-10-04 recovery and QA checkpoint: Two separately approved one-request
public PEP 8/257/20/7 live ChatGPT quality checks completed without retry or
Share. Both supplied three bounded related excerpts; the first opener did not
show their use, the second, after a narrow prompt refinement, made a useful
PEP 8/PEP 257 contrast. This is fixed-fixture evidence only, not Chrome-flow
or general quality validation. The owner's `Research did not complete` has
no specific code and is not conclusively diagnosed. The normal service now
listens on 127.0.0.1:4174 with current code. Restart initially failed because
persisted learned Sources reused the new-capture URL policy; ADR-040 now
allows its retained-only URL check during startup, retaining exact canonical
URL and operation-digest validation. The actual SQLite snapshot passed a
read-only validation (83 Sources); one historical retained-only Source had
no post origins or anchors. A paired-API post-origin guard prevents new posts
from attaching a retained-only learned Source while preserving the synthetic
reserved-domain fixture flow. The full service suite passes 219/223 (four
optional skips), and the final independent trust re-review found no blocker.
No owner data was deleted or migrated. Current next evidence: reload the
extension in Chrome and try the real-page Insight flow, capturing only a
fixed error code if it fails. Further provider tests or public/store release
require their own approval. Name selection remains open.

2026-10-04 version 0.13.0 owner-local increment: ADR-041 permits up to four bounded
anonymous public related-page extracts only after deliberate Get insights,
default-on but switchable in Settings. The implementation has offline and
isolated-Chrome tests; final independent trust re-review cleared the reviewed
owner-local scope after malformed-HTML/raw-script fixes. Backend must restart
and extension must reload. Do not run live provider QA with excerpts under
ADR-038 alone, which approved only related titles/URLs. The owner's separate
bounded QA approvals have been exercised as summarized above. ADR-042's conversation-first
GUI and ADR-043's one-call topic-sensitive prompt are implemented; the User
view hides the Pages list and puts exclusions in Settings. Matching already
auto-starts on a fresh browser session with saved pairing, HTTPS grant,
authenticated service health and an eligible focused window; Stop still
suppresses capture within that session. No public/store clearance is claimed.
Chrome store disclosure/consent and source-rights review stay
explicit release gates. SimilarSites itself is not a fallback: its API is
paid/domain-audience oriented and its website data is not authorized for
scraped competing reuse. A self-owned page-link discovery experiment can be
considered later without treating candidate links as Topic matches. Current
next evidence is an owner-operated real-page UX check. Brand/name and dynamic
background are exploration only, not yet product decisions; see the brand
direction screen in research/.

2026-10-04 0.12.22 UI polish: The User reply composer identifies the exact
target author and a bounded excerpt, including reply-to-reply, before Post
reply. Pages promotes only strict-policy-safe titles to links; retained-only
URLs remain inert. No matching, capture, provider, post-target or publication
scope changes. Final offline/Chrome evidence is in STATUS. Reload the extension
for this and the 0.12.21 catalog recovery; owner live confirmation is pending.
The full extension suite passes 884/885 (one skipped), focused restricted
discussion panel 36/36, secret scan zero/181; isolated Chrome passes 14 states
without uncaught exceptions or horizontal overflow. Independent trust review
closed two reply accessibility issues and found no remaining blocker; actual
screen-reader behavior remains untested.

2026-10-04 owner popup incident / 0.12.21: The fixed-port service is healthy;
the `Local service unavailable` banner came from strict client rejection of
the catalog after ADR-039's capture guard encountered seven historical
credential/account-host Sources. ADR-040 adds a separate retained DTO URL
validator for catalog/related projections only. The actual read-only local
catalog now validates all 71 Sources/65 Topics and related projections for
all 71 Sources; new capture, post-origin links and Insight context stay
strict. No row was deleted or sent to a provider. Popup-to-background pairing
failure now has its own safe status instead of suggesting a new token. A
synthetic outage/reopen test exercises retained pairing; no owner token was
read. Chrome-reported `relatedChoices.children.forEach` is absent from HEAD;
the undefined `.replace` error is not reproduced. The visual harness now
captures uncaught popup errors on reload and passes 13 states with zero.
The full extension suite passes (880 passed, one skipped), focused tests pass
73/73, and the secret scan reports zero findings across 181 files. Independent
trust review approved the final compatibility boundary after the post-origin
and case-varied query fixes. The owner Chrome popup has not yet been retested.
Owner must use Chrome's round-arrow Reload and confirm the actual popup;
do not rotate pairing on the old error report. The backend needs no restart.

2026-10-04 live Insight QA: ADR-038 records the owner's bounded standing
permission for deliberate public-page provider checks. The opt-in
`apps/local-service/harness/run-live-insight-qa.js` isolates the fixed port
before protected grant restore, uses a fixed signed-out MDN page and one
public related link, and caps each run at one Responses dispatch with no
retry, catalog/SQLite read or publication. One listed GPT-5.5 live request
completed: 76-word current-page opening post, one question, no citations.
This covers the backend adapter and prompt only; the harness's HTML main-
region extraction is not Chrome rendered-document attestation. The normal
service was restarted on 4174. Do not turn the harness into background AI
behavior or use catalog items as public QA fixtures. A read-only catalog
audit found an account/credential-site URL in retained state. Obtain owner
direction before deleting stored data.
The extension's shared page URL policy now rejects exact credential/account
host labels before future capture; an independent trust review and focused
tests passed. It cannot detect private state on generic public hosts, and
old retained rows were not removed. Reload the unpacked extension to apply
the guard. Full extension/service suites and secret scan pass; see STATUS.

2026-10-04 current UI integration (0.12.20): ADR-037 unifies User Mode around
Discussion and Pages. The comment composer offers a small explicit Insight
action; its private result stays in Discussion with distinct Share/Discard.
ChatGPT account/model and research-source choices are behind Settings.
Developer Mode keeps detailed controls. No new provider call, automatic post,
permission, storage path or release scope is authorized. The same 30-minute
RAM-only result recovery and exact-share attestation from ADR-036 remain.
The full extension suite passes 871/872 (one existing skip), the local service
suite 202/206 (four opt-in skips), and the isolated
Chrome visual run passes 13 states without horizontal overflow, and the
synthetic local-service/Chrome smoke passes the post -> insight -> private
reopen -> Share path with no runtime exceptions or external extension requests.
The independent trust review found no new send/publication path; it prompted
a visible private label and accessible completion status. Reload the unpacked
extension after update; the
backend does not need a restart for this UI-only change. Live provider quality,
remote/public deployment and store-policy gates are still open.

2026-10-04 current integration (0.12.19): ADR-036 adds RAM-only, 30-minute
private Insight recovery after popup closure. The local service continues an
already accepted user-triggered request; the reopened popup uses an authenticated
actor-bound summary and the existing result endpoint, only for the same
revision/Topic/Source. It never starts a second provider request or posts
automatically. Share/Discard and account/session invalidation retain their
proof and deletion behavior. The User Mode result is now a clean message card
with inline source icons and Share/Discard. Full offline suites and isolated
Chrome visual/local-service smoke pass; counts and limits are in STATUS. The
normal owner-local service is running on port 4174 with the new code. Do not
claim live-provider recovery or persistent drafts across service restart.

2026-10-03 UI refinement complete (0.12.18): The owner chose one formatted private
Insight preview with a direct Share or Discard action, removing the extra
Preview button and duplicate text. The controller and service retain exact
generated-body and target attestation. The full extension suite, isolated
Chrome visual run and local-service/Chrome synthetic integration smoke pass;
details are in STATUS. The local service is running again on port 4174.

2026-10-03 current integration: ADR-034's immutable, server-attested robot
opener/follow-up path is implemented in the owner-local prototype. A published
human direct question under a generated robot root can invoke Get insights;
only that verified question and parent plus the current bounded public-page
extract are passed for one stateless provider response. The response stays
private until explicit unchanged Share. The service rejects forged robot
posts and consumes an exact completed-operation proof on successful write.
Owner withdrawals retain a tombstone only while visible descendants exist.
ADR-035 now caps the source context at five references total (current page
plus up to four ranked candidates), but related page **text** is not supplied.
One observed completed local-service trace recorded zero web-search calls:
that request did not fetch related-page content; this was not a publisher
access failure diagnosis. Google `related:` is not implemented. The full
local-service suite passes 201 with four opt-in skips, extension suite 858
with one skip, and 13 isolated-Chrome synthetic popup states pass without
horizontal overflow. A separate actual-Chrome temporary-profile service
smoke passes the mocked generated insight -> citation preview -> attested
Share -> withdrawal path with zero runtime exceptions/external extension
requests. It found and fixed a Share busy-transition cancellation race. No
live follow-up or real-account UI verification is claimed. Before testing new
backend logic against the owner's persistent
service, restart the fixed-port service after code changes; do not run a
second credential-restoring process concurrently. Later provider, external
discovery, privacy, release and spending gates remain separate.

2026-10-03 next integration: The 0.12.16 product-first popup is coded and its
thirteen synthetic Chrome visual states pass. ADR-033 narrows the first AI
result to a short current-page forum opener and uses the provider's structured
URL citations for inline source icons rather than a raw URL list. Private
preview and AI-labelled shared posts render validated inline links; human
posts remain plain text. The backend suite passes 190 tests/four optional
Windows skips; restricted extension tests pass 852/852; both secret scans
found zero findings. Read-only trust review's forged-citation finding was
fixed by neutralizing unannotated generated links; edited/shared links have
a neutral label. New shell copy uses English language-pack keys. Final
isolated Chrome rerun passes all 13 synthetic states without horizontal
overflow. Lead diff review found no remaining blocker. Integration rerun could
not bind the fixed port because the normal service was running; previous
loopback 2/2 evidence
remains. The provider's optional
web tool and domain filter cannot guarantee loading the exact candidate URL,
so an inaccessible link is not treated as evidence. This work adds no
follow-up AI reply, automatic Share or publication, and no agent-initiated
post-change provider call was made. The normal fixed-endpoint service was restarted after the prompt
change; persistent pairing remains active.

2026-10-03 19:41 Berlin result: The owner-authorized, single synthetic-public
provider probe succeeded against the saved ChatGPT connection after the
owner's stated reset time: 1,354 private answer characters and one citation.
It made one model-list call and one Responses call, with no retry or Share.
The fixed-port service was stopped before protected-token use and restarted
afterward with durable pairing. The temporary harness/test were deleted; no
raw answer, provider body, account or credential was logged. This is a live
backend/parser success, not an actual popup/real-page UX or quality pass.
The Astra High-led/Sol Medium-coded product popup redesign later passed its
isolated Chrome review. No Google related-page integration has been approved;
Google's old `related:` operator is unsupported and its documented
`relatedSite` API path is deprecated/unavailable to new customers.

2026-10-03 latest: ADR-032 single-profile ChatGPT account switch is implemented
and independently trust-reviewed. Disconnect must complete before Connect;
it clears the protected grant and old non-secret registration, retaining the
host ID. A late restore is epoch-fenced. The local callback page now labels
an OAuth decline as cancelled. Offline service 190 pass/4 Windows opt-in
skips, local loopback 2/2, secret scan zero. The backend was restarted on the
approved fixed endpoint. The owner's old non-secret registration file had not
yet changed on read-only inspection after the latest attempt. Extension
0.12.15 removes the User Mode CSS rule that hid the connected account's
Disconnect control. After reloading the unpacked extension, the owner can
open **AI insights > ChatGPT ready - account settings > Disconnect to switch
account**, wait for **Continue with ChatGPT**, and then choose
the other account in the browser.
No second-account success is claimed. The Astra High/Sol Medium popup
refinement is complete: 84/84 focused UI tests, 28/28 account-access/package
checks, thirteen isolated-Chrome visual checks, no horizontal overflow;
full restricted extension suite 841/841. The three previous temporary raw/trace
diagnostic files were deleted after diagnosis. Do not generate a new provider
request merely to test account switching.

2026-10-03 update: ADR-031 parser now replays the owner's previously captured
complete synthetic-public GPT-5.5 stream offline as a private result (1,666
characters, three citations), without a provider request. The one approved
fresh live probe reached `subscription_sharing_usage_limit_exceeded` and no
answer; do not retry on that account or enable paid credits without a separate
owner gate. A strict headerless SSE failure classifier now maps that exact
provider code to the existing rate-limit state instead of misleading
`response-content-missing` (offline tests pending final integration). The
owner requests a different ChatGPT OAuth account; the current single-profile
registration is bound to the old subject and account-switch correction is in
progress. Official SIWC docs require a new dynamic registration or separate
saved profile, never mixing the old client ID with a new subject. Local pairing
and discussions remain unaffected. No new-account sign-in has occurred yet.

2026-10-03 live diagnostic: The owner authorized agent-readable temp logs,
opt-in raw ChatGPT/page-prefix capture and agent-run tests using the existing
saved ChatGPT connection. ADR-030 scopes the debug mode; no credentials or
browser-wide page data are logged. One agent-run synthetic-public GPT-5.5
request reproduced `response-item-prefix`: eight `output_item.done` items,
assistant message at index 7, terminal `response.completed/status=completed`
with `output: []`. The owner subsequently explicitly approved ADR-031's
complete-stream-only reconstruction solely for a private editable draft;
implementation, adversarial tests and trust review are in progress. Do not
extend it to posting or contradictory terminal outputs. Raw and structural debug logs live only in the
OS user temp directory in explicit `--debug-insight-raw` mode and must be
deleted after diagnosis. Normal mode keeps terminal-only structure trace.
GUI refinement is being orchestrated by an Astra High agent with Sol Medium
UI coding agent(s), synthetic screenshots only; lead owns integration.

2026-10-03 owner request: implement meaningful provider-response diagnostics
without repeating blind Create retries. ADR-029 permits only an ephemeral,
content-free `INSIGHT_TRACE` line in the backend terminal on a deliberate
Create reaching bounded SSE parsing, with fixed event/shape/equality fields and no raw provider/page data,
IDs, URLs, tokens, log file or automatic call. Raw capture remains a separate
privacy gate. Offline service 173 passed/2 Windows opt-in skipped and
extension restricted 838/838; independent read-only Trust review found no
blocker. Earlier transport/format/timeouts give only their fixed code, no
trace. No live result yet. Owner may restart backend and make one deliberate
public-page Create, reporting only the `INSIGHT_TRACE` line and fixed outcome.

2026-10-03 owner result: after 0.12.12, a deliberate Create still returned
`response-final-item-missing`; exact stream shape is unknown because raw
provider output is neither logged nor retained. Version 0.12.13 aligns
ADR-028 with its approved completed-item boundary: `output_text.done` is not
mandatory, but if present must match. Four fixed content-free subcodes now
differentiate remaining rejection boundaries. Offline service 171 passed/2
skipped, extension restricted 838/838. No live success claim, provider call,
auto-retry or auto-share. Next owner action: restart backend, reload extension,
one deliberate public-page Create at most; report only draft or fixed code.
Independent Trust review identified a same-ID prefix type/status contradiction;
the fix and synthetic negative tests were re-reviewed without a blocker.

2026-10-02 current checkpoint: 0.12.12 implements the owner's separate
approvals for ADR-019 C durable local pairing and ADR-028's strict finalized
assistant item private-draft fallback. The old session key is discarded, not
promoted. After one interactive pairing initialization and updated backend/
extension restart, the saved browser token survives later restarts until
Forget, rotate/revoke or confirmed 401. A service outage retains it. The AI
exception imports only one fully finalized, identity-consistent item to a
private editable draft after a terminal completed stream; no delta, retry or
automatic Share. Full offline service 170 passed/2 skipped and extension
restricted 838/838; independent Trust review found and closed five parser
contradictions. Do not claim live provider success or owner-browser restart
verification. Next: owner performs one local pairing migration and at most
one deliberate public-page Create; collect only fixed code/outcome. Later
security/privacy/provider/store/deployment/spending gates remain explicit.
The isolated Chrome smoke has been adapted for durable pairing, but could not
bind fixed port 4174 in the elevated environment; it remains unverified.

2026-10-02 active owner gate update: ADR-019 C durable local pairing was
explicitly approved and is now being implemented. Do not treat this as
approval for provider-output fallback, new public hosting or broader data
scope. The owner's latest insight code is `response-final-item-missing`:
completed assistant item in stream, absent from final completed response.
Current parser rejects it; strict private-draft fallback awaits a separate
explicit answer. No live provider call or owner-data inspection is authorized
for implementation tests.

2026-10-02 owner result: with model “5.5”, Create now returns
`response-no-message`. A completed response carried no final assistant
message. Do not infer a cause or import partial stream text. Structural-only
offline diagnostics and an opt-out for linked-page web research are the next
in-scope increment; the default one-click research remains on. No automatic
provider retry or real-account call was made. Durable local pairing remains
at the separate ADR-019 C approval gate.

Latest owner result (2026-10-02): ChatGPT protected sign-in appears to work,
but the next Create yielded `response-empty-output`. It proves a completed
stream without usable final assistant text, not why. The offline correction
adds content-free structural codes and requests an explicit uncertainty
explanation when evidence is insufficient. No provider retry has occurred.
Await one deliberate owner public-page recheck after backend restart and
extension reload. Persistent local-service pairing remains a separate
ADR-019 C owner/security decision; its exact scope has been asked explicitly.

2026-10-02 update: The separately approved missing-header and protected-refresh
changes are implemented in the local service under ADR-026/027. Offline tests
pass; real-account restart and insight success remain unverified. Ask the owner
to restart the backend, re-pair with its new process token, sign in once if
needed and then check whether a subsequent backend restart resumes ChatGPT.
A single deliberate public-page Create may test the bounded fallback; do not
retry automatically or ask for raw provider data. Extension code/permissions
and session-only local-service pairing are unchanged. Later gates remain.

Updated: 2026-10-02. **S1–S3, ADR-017 and ADR-018 B1–B5 complete.**

Newest owner result: after the 0.12.9 diagnostic, Create reports
`response-content-missing`: a 2xx Responses reply has no `Content-Type`
header. Body/status and root cause remain unknown. Do not request another
provider call yet. The owner asks for auth across backend restarts; current
access/refresh/ID tokens are RAM-only and cannot survive process exit.
The owner separately approved an HTTP-200 missing-header fallback accepting
only a bounded completed SSE body, and OS-protected refresh-token persistence
with sign-out revocation/deletion. Neither is implemented in 0.12.9; implement,
test and review them as separate increments.

Prior owner result: one live Create attempt failed with fixed
`response-content-type`. This means a 2xx `/v1/responses` reply did not pass
the expected SSE media-type check; the actual media type and root cause are
unknown. Version 0.12.9 narrows the next result to fixed
`response-content-json/html/text/missing/other` without reading/importing or
logging the response body or raw header. Valid SSE media-type whitespace is
accepted. Service 152/152, extension restricted 834/834, focused 48/48 and
independent read-only security review pass. Restart backend, reload extension,
then ask the owner for at most one deliberate public-page Create retry and
only its fixed code. Do not make a provider call for the owner, ask for raw
responses/credentials/page text, silently retry or assume a cause.
The new isolated Chrome integration smoke could not bind fixed loopback port
4174 while the owner's service occupied it; the owner process was not touched.

Newest correction: the actual Chrome action popup was about 55 px wide despite
the old forced-width tab test. Removing circular root `max-width` caps restores
a 410 px User body (425 px outer including scrollbar) and 380 px Developer
body. The new harness opens the real action popup; it verifies no horizontal
overflow, text wrapping and a sticky visible Create/model bar. Extension
restricted 834/834 and isolated Chrome smoke pass. Reload the unpacked
extension; no backend restart is needed for this CSS-only correction.
The owner approved the three earlier commits through 0.12.8 to the named
GitHub `main`; that push succeeded. The later width correction was pushed as
`b5c41b4`. The owner grants standing permission to commit/push checked,
in-scope repository changes to `origin/main`. This is not approval for
provider/data egress, spending, deployment, public announcements or app/store
submission; later owner gates remain explicit.

Newest checkpoint: extension/service 0.12.8 implements the owner's two
explicit ADR-025 approvals for automatic matching in a separate public profile
and one-click ChatGPT insights. Pairing plus the existing native HTTPS grant
now starts active eligible-page matching automatically; Stop is sticky until
explicit resume. User Mode keeps Create insight and the model selector visible,
auto-lists models and defaults to the final displayed choice. Create reattests
and sends bounded current-page text plus selected related titles/URLs only;
related bodies/cookies are not sent. Result remains private until an explicit
share. Service 150/150, extension restricted 834/834, indicator/package
571/571, focused tests 48/48, background adapter 88/88, secret scans 0/73
and 0/176, isolated Chrome one-click/layout/background smokes pass. A read-only
Sol Medium trust review found no blocker. The owner's live inference remains
unverified; ask for only fixed status codes after one deliberate Create click,
never account/callback data or page text. First Chrome HTTPS access still needs
its native user gesture. The push of this checkpoint to the named GitHub
`main` was explicitly approved and succeeded. ADR-019 C
durable pairing, private/authenticated pages, legal/store review and later
owner gates remain open.

Prior checkpoint: extension 0.12.7 clarifies the empty manual draft with
next-step and research-result cues, without backend or permission changes.
Restricted extension 819/819, indicator/package 557/557 and secret scan 0/173
pass. The owner need only reload the extension. No live completed inference is
claimed. GitHub push remains blocked pending explicit approval of the named
remote/payload; do not retry it without that approval.

Newest owner result: a populated live model list now works. The empty text box
they subsequently report is the manual draft field, not evidence of a
completed AI response. Model listing does not populate it; only an explicit
completed Create insights operation does. Ask whether that action ran and for
only the fixed AI status, never page text/account data. The 0.12.6 commit
remains local: auto-review rejected GitHub push until the owner explicitly
approves the named remote and payload. Do not retry without that approval.

Current checkpoint: **0.12.6 owner sign-in reports connected, but an explicit
model list returned `catalog-body`; the separate bounded catalog-read and
fixed-code diagnostics are ready for the next owner check.**
Restart the local service, reload the unpacked extension, pair and sign in
again, then click List available models once. Developer Mode > Local diagnostics
can show fixed extension/service codes without sharing account details or
provider bodies. A `catalog-body` report alone did not prove oversize; 0.12.6
separates `catalog-too-large`, `catalog-stream` and `catalog-encoding`, and
raises only the catalog limit to 2 MiB. Service 147/147, extension restricted
817/817 and indicator/package 555/555 pass; secret scans 0/73 and 0/173.
The independent Sol Medium trust-review attempt hit a usage limit and remains
open. No successful live model list or inference is claimed.
ChatGPT insights and compact User Mode remain owner-local. Read ADR-024 and the latest
STATUS section first. The owner approved implementation, ChatGPT connection and
explicit public-text/related-source research. Sol Medium agents handle coding;
the lead reviews/integrates. The owner reports a connected account, but no
independently verified live model catalog or successful inference yet; do not
confuse pasted/edited AI-assisted text with attested provider output.

The public callback originally acknowledged receipt before asynchronous code
exchange and verification, then the popup collapsed any failure to one sentence.
0.12.2 adds nine fixed, non-secret failure stages only to authenticated status,
updates callback wording, and fences late failures after Disconnect. The owner
did retry and reported `identity-verification-failed`. Version 0.12.3 accepts
the client ID in a scalar or single-item audience array, preserves all other
identity checks and adds six fixed identity substages to authenticated status.
After backend restart and extension reload, the owner reports ChatGPT now says
connected. This does not establish the cause of the earlier failure, plan/model
availability or successful inference; never ask for or reuse callback URLs,
codes or tokens. Version 0.12.4 places fixed model-list loading/empty/failure
feedback beside the disabled selector. Ask for that sentence after one explicit
List available models click, not provider response bodies or account details.
Offline extension restricted 807/807, indicator/package 545/545 and secret
scan 0/173 pass. No new provider call or live model-catalog result is claimed.
The owner then reported 0.12.4 “Model list unavailable” while ChatGPT still
showed connected. Version 0.12.5 changes only the explicit catalog path:
the paired service maps known errors to six fixed categories, the extension
strictly projects them and displays fixed guidance beside the picker. Listing
has a bounded 25-second service/30-second extension deadline; research stays
90 seconds. The actual error is still unknown. Both the backend and extension
must be updated for one fresh List available models click; never request
credentials, raw provider bodies or a callback URL. No automatic model call or
provider retry was added.
Offline service 144/144, extension restricted 812/812, indicator/package
550/550, secret scans 0/73 and 0/173, diff check, and independent trust review
pass. Synthetic malformed provider response and stale-list/account-switch tests
cover the new boundary. Loopback/Chrome smoke were not rerun while the owner's
Node process holds port 4174; do not interrupt it.
Synthetic service 139/139, extension restricted 805/805 and indicator/package
543/543 pass; two secret scans and diff check pass. The owner's Node process
still occupies port 4174, so isolated loopback/Chrome tests were not repeated
for this checkpoint. Do not interrupt that process or claim a live sign-in.
Current service/extension/indicator offline tests pass; isolated loopback and
Chrome tests cannot bind port 4174 while the owner's running Node service owns
it. Do not stop that owner process without coordination. See STATUS for counts.

The owner freed port 4174; serial service integration (2/2) and full Chrome
synthetic insight/sharing regression passed, and the lead inspected User Mode
screenshots. Do not repeat foundation/provider approvals. User Mode wording is
also simplified; see STATUS for final verification counts.
The follow-up hardening distinguishes identity-only sign-in from a plan-enabled
account, permits explicit re-consent, preserves temporary refresh failures,
and provides bounded provider-error guidance. Service 132/132, extension
799/799, indicator 537/537, loopback 2/2 and isolated Chrome synthetic insight
pass; independent security review found no remaining code blocker. No live
account/provider inference is claimed. Next the owner can test live
sign-in/research using the browser README. Retain
explicit redaction/credit consent and separate Share; no automatic generation,
publishing, private pages, paid fallback, new model/permissions or remote scope.
The research-only checkpoints below predate these approvals. All later
private/remote/spending/publication gates remain; never repeat completed reviews.

Latest owner direction supersedes external-forum aggregation as the primary
investigation: valuable research by the user's AI about the current page and
other relevant sources, with deliberately shared findings seeding native public
discussions. Read `research/AI_INSIGHT_COLD_START_2026-09-29.md`. This is research
priority, not provider/build approval. Current official ChatGPT OSS/local plan
usage is a candidate; project/license/account/search fit is unverified. No provider
login/call, source-index build, model, search API or publication was activated.
Next proposed evidence: five-page value/sharing pilot after one exact provider/
data/search/quota/privacy gate, not a repeat of 6/6 or the 200–250-pair task.
Current app 0.11.0 and routing/retention contracts are unchanged.

Previous requirement: actual comments readable inside the extension; external
links alone and onboarding many specialist forums do not meet the owner's needs.
The completed feed probe is not a selected product build. Read the opening
clarification in `research/DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md` before
choosing next work. No provider/inline comment acquisition/cache/mirroring or
cross-posting is approved; broad first-user coverage remains unresolved.

Latest research checkpoint:
`research/DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md` evaluates common public feeds
with concrete evidence/confidence levels. Feed presence is not coverage, article
linkage, independent ownership or reuse clearance. The owner has now approved a
small transient format/linkage test, now complete: three public feeds parsed,
ten entries each, two reads/feed. Field presence is established; relevant matches
to visited pages are not. See the note for excluded sources/counters and the
offline-only instrument correction. No API search or retained corpus; do not
start new collection, a scheduler, feed embeddings or app integration from this.
This is not the completed 6/6 or the gated 200–250-pair review. 0.11.0 is unchanged.

Latest clarification: public first-use value, broad subjects and independence
from a few large source operators are required; private friend sharing and a
Hacker News-only start do not solve this. Many independent sources via common
feeds is a hypothesis awaiting coverage/rights/cost evidence, not a selected
integration or collection approval. See the opening owner-clarification section
of `research/GROWTH_LOOPS_2026-09-29.md`; growth strategy remains unresolved.

Newest idea: Reddit/other-community discussion discovery as first-user utility.
Read the external-conversation section of `research/GROWTH_LOOPS_2026-09-29.md`.
Investigate link-first, provenance-labeled external destinations, not comment
mirrors. Reddit API/commercial approval is not available; no provider is selected
or connected. Native participation still needs its own reason to exist.

Latest: owner asks for rapid Source/discussion growth and useful first-install
coverage. Their user-owned AI research-source idea is explicitly exploratory,
not selected or approved. They reject a single-interest audience as a required
launch strategy. Read `research/GROWTH_LOOPS_2026-09-29.md`: independent personal
source utility and web-shareable questions are hypotheses, not approved new features.
Distinguish unverified link candidates from captured vectors and conversation associations.
The accepted sequencing clarification is extension -> readable web -> Android/iOS.
No shared capture/provider/hosting/publication/recruitment/telemetry/migration
approval follows; 0.11.0 is unchanged and concrete routing design is still pending.

Owner asks for a whole-concept review before choosing the next architecture.
Read `research/CONCEPT_REVIEW_2026-09-29.md`: advisory recommendation is automatic
relevance retrieval around stable semantic conversations, not authoritative dynamic
page partitions or an immediate Topic-dropdown/many-to-many migration. No change
to the concrete routing contract is approved/implemented, and no existing automatic
behavior is disabled by this review. Await direction on that contract before code;
preserve current data, cross-site conversations and all existing approval gates.

Latest feedback is diagnosed, not fixed: current adaptive grouping can keep an
above-floor pair separate because other similar Sources veto every pairwise
merge. A pure synthetic .92/.92/.92 triple remains three singletons if all start
separate, but joins when two are already grouped. See STATUS/ADR-023 for this
history-dependent candidate-construction gap and a bounded whole-neighborhood
proposal. No owner data was changed and no new cutoff was activated. Next code
work should address/retest this mechanic, not lower the floor again or assume
the model alone explains the failed pair. Preserve the existing scope and gates.

Owner now additionally proposes overlapping Topics: several memberships per page,
without collapsing those Topics or duplicating posts. This would change the current
single-link/source-root routing model. The proposed canonical Topic per conversation
and multiple Source memberships need an explicit architectural decision before
implementation; this discussion does not approve a new schema migration.

Latest checkpoint **0.11.0** implements owner-approved ADR-023: adaptive grouping,
source-anchored whole subthreads and directly clickable per-post source-page icons.
Root origin controls grouping; reply origin only controls its own link. SQLite v2
migration pins legacy roots without guessing a source. Changed representations
pin old threads; manual Source links override automatic grouping. Forget purges
Source references but preserves comments; Clear also removes learned-origin root
sets moved to fixture/manual Topics. New thread IDs and reply topology stay stable.

Active policy `adaptive-supported-partitions/v1`: .90 floor, .94 supported/sticky
refinement, .04 competing-member margin, .995 duplicate discount and two independent
representatives per supported subgroup. Invented geometry tests are not learned
event/viewpoint accuracy; see experiment README and prior E5 limitations. No new
model/input/payload/permission/provider. Existing owner data was not accessed.
Independent Sol Trust review passes; restricted 763/763, indicator 501/501,
backend 93/93, loopback 2/2 and actual Chrome matching 21 / discussion 20 covered
areas pass. See STATUS for scope, migration/cancellation corrections and gaps.

Next: owner restarts backend, reloads extension, pairs and starts a session to try
the local app. No reset or repeated owner review. Additional model, durable pairing,
private/provider/remote/publication work and the larger corpus retain their gates.

Previous direction: owner declines ADR-022's additional Qwen model because of
size/latency. Defer it; do not download, infer or repeatedly ask for that package.
They ask for lightweight embedding options or a fallback 0.90 threshold. Existing
synthetic pair counts quantify the recall/false-match trade-off (STATUS/ADR-022),
not validation of 0.90 sequential grouping. At that advisory checkpoint 0.94 and
0.04 margin/stable assignments remained; ADR-023 above later supersedes grouping.
The one-vector payload remains. A short
title-focused input test and later same-architecture fine-tuning are proposals,
not completed work or new model/data authority. Future connected-user AI stays gated.

Previous request: implement viewpoint-independent underlying-subject matching and
five toolbar colors. Owner explicitly approved bounded ADR-019 A on 2026-09-29:
article-first/title-plus-leading-text inputs, same installed model and existing
limits, new synthetic opposite-opinion/hard-negative measurements, one retained
vector and unchanged historical links/comments. The experiment found false joins:
the tested reader/input proposal is preserved outside the extension, not activated.
Production reader/input/policy/backend match the preceding checkpoint. See results
under `apps/local-service/experiments/topic-identity/`; no useful safe cutoff found.
Toolbar: red disconnected; gray connected/no current Topic; green Topic; light
blue another learned page shares Topic; dark blue shared Topic with visible posts.
Colors are implemented in 0.10.0. Restricted 753/753, indicator 491/491, backend
69/69, evaluator 6/6, independent Trust 149; Chrome session 19/19 and reader 47/47 pass.
After owner shutdown of their backend, full matching/comment/native-color Chrome
passes 20 covered areas (14 vectors, eight owned documents), legacy discussion 19
and loopback 2/2. All five colors, withdrawal/repost, red/gray on 401/re-pair and
semantic/fallback shared comments across SQLite restart pass. A legacy test-only
storage whitelist now permits the existing exact integer toolbar marker while
unpaired too; no production/data change. See STATUS for evidence limits.
ADR-022's extra local-model synthetic-only experiment was proposed, then declined
by the owner; no download/new-model inference. Read ADR-019 A and ADR-020 follow-up.
No durable pairing, second vector/facts,
historical merging, private/provider/download scope or later gate is approved.

Previous request: diagnose a specific pair of related news articles that have
different Topics. Read-only/query-only SQLite projection confirms both exact
URLs have compatible vectors and distinct provisional links. Current similarity
is above the related cutoff but below the automatic-grouping cutoff. Revisit
preserves assignments; historical inputs/decisions cannot be reconstructed.
No product/data changes, service contact, page fetch or wider corpus inspection.
See STATUS; pair-derived numeric details/identities are not retained in git.
ADR-019 A/C and later gates remain unchanged; diagnosis is not merge authority.
The owner confirms restarting the backend restored the displayed Topic title;
this is not semantic-quality evidence. The formerly pending full 0.9.x browser
flow subsequently passed at the current 0.10.0 checkpoint above.

Previous request: session consent appears required again on new tabs. ADR-019 B
already covers new active tabs in the same window. No lease bug was found; the
popup always showed an unchecked checkbox/Start despite an active lease. 0.9.1
adds separate localized session status, hides/disables redundant Start/consent,
preserves Stop and labels explicit movement to another window. No auto-consent,
new authority/storage/permission or pairing change. Actual Chrome passes 19
session checks including new blank->HTTPS tab, switchback/forward and active
non-last-tab close with unchanged lease; adapter tests cover paired mocked
ingestion and inactive/stale-tab exclusion. Final restricted 675/675, indicator
487/487, actual Chrome eligibility 47/47 and independent Trust 181/181 pass;
normal suite has 674 passes plus one intentional skip. See STATUS for details.
Reload still ends the session, requiring one fresh Start after updating.

Previous request: fix `capture-budget`, with a GameStar example. The owner explicitly
approved [ADR-021](../decisions/ADR-021-bounded-article-container-fallback.md)'s
generic article-container fallback/10,000-step package on 2026-09-29. Version 0.9.0
implements it, preserves legacy region priority, keeps 40 ms/4,096 characters and
adds fixed diagnostics. Two exact capture versions share the unchanged E5 space;
unknown versions fail closed, old Topic links/comments stay stable. No new assets
or permissions. Restricted 659/659, indicator 471/471, backend 69/69, actual Chrome
47 reader/eligibility checks pass. Unmodified reader succeeds 3/3 on an inert
anonymous GameStar snapshot; **not** a faithful live-site or semantic-quality test.
The full matching/shared-comment/backend-restart browser suite was pending at
that checkpoint; it subsequently passed in 0.10.0 after owner shutdown of port 4174.
Never contact/stop the owner's backend or use their database for these tests.
The owner must restart the service and reload the extension for both sides to
accept fallback provenance. This does not approve wider ADR-019 A/C or later gates.

Previous request: a User/Developer popup switch, Topic-first discussion, visible
connection and blue toolbar icon for another learned page in the same Topic.
[ADR-020](../decisions/ADR-020-user-mode-and-topic-indicator.md) defines this
presentation-only increment, implemented and browser-verified as 0.8.0. The owner
freed port 4174: full matching/User/native-icon Chrome checks pass 17/17; Developer
discussion regression passes 19 covered areas and loopback integration 2/2. No
production/harness fix was needed after the implementation checkpoint `b49970a`.
The lead inspected the connected discussion screenshot. See STATUS for exact
evidence and unchanged manual lifecycle/first-dialog gaps. User is the default; persist
only the inert display enum and one trusted-session toolbar tab ID for cleanup.
Capture/permissions/matching/token retention are unchanged. Do not repeat S3/B or
approve A/C by inference. The new User view uses the existing controller/drafts.
That UI foundation is finished; do not repeat its work or approval.

Previous request: implement matching-quality improvements, automatic visits across
sites and pairing across sessions. Read [ADR-019](../decisions/ADR-019-automatic-browsing-and-durable-pairing.md)
first: **B alone is explicitly approved on 2026-09-29**, following the question
about an app-enforced window session and underlying broad Chrome permission.
Implement/review Start/Stop with trusted session-memory authority bound to the
starting normal window. Popup closure/worker suspension retain it; Stop/window
closure/browser restart/reload ends it. Stop retains native access; Remove broad
HTTPS access stops then removes it. A native grant and legacy enabled preferences
never create a lease. Blocked origins persist and override that broad grant.
The B implementation checkpoint was 0.7.0 (current UI version/evidence above).
Its verification: owner freed port 4174; full vector/shared-comment Chrome smoke passed
15 checks, S3 passes 19 areas, and loopback integration passes 2/2. A test-only
detached-target setup fix was independently reviewed; it did not change production.
Actual first-grant/reload/restart manual checks remain. Session Chrome smoke
passes 14 checks including forced worker reconstruction; eligibility passes 32.
**A matching/input changes and C durable pairing remain pending.** B does
not authorize them. Preserve all discussions, manual links and later gates;
do not repeat approved B consent or completed foundation work.

Latest owner direction supersedes the synthetic-only interactive proposal below:
build the actual real-page background-vector/grouping/shared-comment loop, with
asynchronous resolution. [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md)
defines the approved one-time Security/Privacy/Policy package and executable
B1–B5 slices. Do not interpret direction alone as consent to undisclosed broad
permissions or retained URL/title fields. The owner explicitly approved that exact
package on 2026-09-29; work autonomously within it using parallel Sol Medium agents.
Do not repeat its approval. Its historical per-site consent is superseded only
by the approved ADR-019 B session scope above; capture still defaults off.
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
The 0.7.0 matcher also gives failed post-read authorization an honest terminal
off/not-enabled state, without another content read or a relaxed capture fence.

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

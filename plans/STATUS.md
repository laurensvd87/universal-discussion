# Project status

Updated: 2026-10-01. Active direction: ADR-014/015/016 and the product-first roadmap.
ADR-017's synthetic-only local experiment is implemented and measured. The owner
now requests the real-page background -> vector -> local Topic -> shared-comment
loop. [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md) records
the exact expanded Security/Privacy/Policy package explicitly approved by the
owner on 2026-09-29. **B1–B5 are implemented and verified in actual Chrome**.
ADR-019 B now replaces their site-by-site enablement with an explicitly approved
window-scoped session in **0.7.0**; capture still defaults off. Current verification
and remaining gaps are recorded below. The owner's earlier `rights-restricted`
report identified the reader's metadata gate; its exact triggering tag remains
unknown. In response to the explicit-reservation question the owner now directs
proceeding with local vectors under a permission working assumption. Extension
**0.6.5** removes that metadata veto only, preserving the public-only per-site
scope and other guards. This is owner policy/risk acceptance, not established
legal or store clearance. The owner now confirms two real public pages were
ingested but received separate Topics despite perceived semantic similarity.
A pair-scoped read-only diagnostic finds compatible current vectors below the
unvalidated automatic-grouping threshold. Real-page matching quality remains
unvalidated; no automatic association correction or threshold change was made.
Previous detailed chronology is preserved in
[the historical status](archive/STATUS_2026-09-25.md).

## Where we are

We have a tested local service and a usable on-device semantic discussion prototype.
The core product hypotheses—semantic concentration, personal AI utility and
community adoption—remain unvalidated. Stop expanding review infrastructure.
The requested browsing -> local embedding -> provisional Topic -> shared-comment
loop is built. Next gather owner feedback within the approved scope; broader
private/remote/other-provider/moderation work and all external release gates remain separate.

## Latest request: valuable user-owned AI research as the cold-start hypothesis

**0.12.5 model-catalog failure diagnosis (2026-10-01):** after the 0.12.4 owner
check, ChatGPT still reports connected but the explicit model-list action shows
“Model list unavailable.” This confirms the catalog did not reach the picker;
it does **not** establish a provider rejection or explain why. The local service
previously collapsed known catalog errors into HTTP 500, and the extension
collapsed all failed reads into one sentence. The paired model-list route now
returns only a fixed, allowlisted failure category for known internal errors:
access rejected, rate limited, timeout, invalid response, provider unavailable
or busy. Success remains `{models}`; no-plan still fails closed; unknown errors
remain generic. The extension validates the exact response and shows fixed
English guidance beside the picker. Owner-clicked list reads have a 25-second
service/30-second extension deadline; research stays at 90 seconds. This change
does not log or surface raw provider bodies, tokens, request IDs or account
metadata, add an automatic call/retry, or bypass billing/policy gates. A single
fresh owner click after updating both service and extension is the next evidence.
The exact live failure remains unknown; no provider request was made by agents.
Offline service **144/144**, extension restricted **812/812** and
indicator/package **550/550** pass. Secret scans found **0/73** service and
**0/173** extension findings; `git diff --check` passes. An independent Sol
Medium trust review found no blocker after stale-list fencing and a malformed
provider-response test. Loopback/Chrome smoke were not rerun because the owner's
Node process holds port 4174; it was not interrupted.

**0.12.4 model-list visibility (2026-10-01):** the owner reports that ChatGPT
shows connected but clicking List available models leaves the selector disabled
on “Choose a model.” This proves no selectable list reached the popup, not why:
the provider could return no displayable models, the list request could fail or
time out, or the local response could be rejected. The app previously put the
result away from the selector and collapsed all list errors into generic
unavailable. A dedicated fixed loading/empty/failure status is now immediately
beside the selector; generic sign-in and research status remains visible outside
the collapsible account section. No new provider call, automatic retry, token
exposure or scope change was added. Actual account model availability and the
cause of this owner's failed/empty list remain unknown until the owner reports
the fixed status after one deliberate click. Offline verification follows below.
Extension restricted **807/807** and indicator/package **545/545** pass;
extension secret scan found **0/173** findings. The owner's running service was
not touched, and no live model-catalog request was made by this checkpoint.

**0.12.3 identity-verification follow-up (2026-10-01):** the owner's fresh
attempt reached `identity-verification-failed`; the earlier nine-stage diagnostic
cannot identify the exact failing check. Official sign-in guidance requires
signature/JWKS, issuer, audience, expiration and nonce verification, but does not
promise a scalar `aud` claim. The verifier now accepts only the exact client ID
as a scalar or singleton array, rejects other/multiple audiences and mismatched
`azp`, and retains its signature/issuer/nonce/time checks. Authenticated status
may additionally expose one of six fixed, non-secret identity substages; the
extension presents fixed English guidance and clears it on retry/success/
disconnect. No raw token, claim, key, URL or provider response is surfaced.
This is a standards-compatibility correction and a diagnostic, **not** a proven
root-cause fix. Live sign-in, plan permission, model availability and inference
remain unverified. No provider was called for this checkpoint. Synthetic service
**139/139**, extension restricted **805/805**, indicator/package **543/543** pass;
service/extension secret scans found **0/73** and **0/173** findings respectively,
and `git diff --check` passes. Loopback/actual-Chrome tests were not rerun:
the owner's Node process still owns port 4174 and was not interrupted. An
independent Sol Medium trust review found no blocker in this narrow change;
no live provider test is claimed.

**0.12.2 first-live-sign-in diagnosis (2026-09-30):** the owner reports that
OpenAI redirected to the local callback, whose old generic acknowledgment was
shown, while the extension later said authorization failed. The callback
contained the expected non-secret parameter names, but its code was not used
for debugging or saved in this repository. Read-only inspection shows the
acknowledgment precedes asynchronous code exchange, token/identity verification
and registration; all failures were collapsed into one UI message. The local
non-secret registration is not yet completed, so no successful sign-in is
claimed. Exact root cause remains unknown. The owner was advised to use a fresh
attempt and never share a callback URL again.

The service and extension now expose only nine fixed, non-secret failure stages
through authenticated status, with fixed localized guidance; no callback
values or raw provider responses are logged, persisted or reflected. The public
callback page explicitly says verification is unfinished. First-registration
retry and timeout remain bounded; the five-minute lease is unchanged pending
real evidence. A late callback cannot restore stale failure state after
Disconnect. Sol Medium coding agents and independent trust review found no
new secret-exposure blocker. Offline service **137/137**, extension restricted
**802/802**, indicator **540/540** pass. Synthetic loopback integration and
Chrome smoke are pending this checkpoint because the owner's Node service holds
port 4174; it was left running, not terminated. A fresh owner login on the
restarted 0.12.2 backend is still required to identify the failed stage.

**0.12.1 live-readiness hardening complete (2026-09-30):** the owner asked
the lead to continue with GPT-6 Sol Medium coding agents. First-registration
recovery, temporary-versus-terminal refresh handling, and an explicit
identity-only/plan-access distinction are now enforced end-to-end. A connected
account without plan permission cannot list models or start research; only an
owner-clicked Continue with ChatGPT requests consent again. Account sign-in no
longer gets stranded by a page change. Large account model catalogs and a small
set of documented provider failures have bounded, actionable handling without
importing partial answers or exposing provider text. The compact User Mode keeps
model/account setup secondary while showing connection and usage controls.

Evidence after integration: service **132/132**, loopback integration **2/2**,
extension restricted **799/799**, package/indicator **537/537**, focused
cross-layer **23/23**, and secret scans **73/173 files, zero findings**.
Actual Chrome **154.0.8037.58** passed the isolated popup regression with one
synthetic insight, three intercepted fixture documents, zero runtime exceptions
and zero external extension requests. Lead visually checked User Mode top/footer
and a read-only Sol Medium trust review found no remaining code blocker.
`git diff --check` passes. No real ChatGPT account, provider inference or owner
data was used by these tests. First live sign-in, eligible model/web-search
availability, useful output and provider response compatibility remain the
owner's next test; do not claim them from synthetic evidence. The app remains an
owner-local PoC, not provider, legal, store or publication clearance.

**0.12.0 implementation checkpoint:** the owner approved ChatGPT connection and
button-invoked public-page/linked-source research; [ADR-024](../decisions/ADR-024-local-ai-insights-and-chatgpt-poc.md)
records the exact boundary. Sol Medium agents implemented the connection adapter,
service bridge, extension workflow and UI, with lead review/integration. The
owner subsequently requested a minimal, clean User UI: the Topic/discussion and
near-title insight action are prominent; account/model, source details, manual
drafting and browsing-session controls use progressive disclosure. Developer
Mode retains diagnostic access; English strings remain in locale packs.

Implemented: supported ChatGPT OAuth via the paired service, process-memory
tokens, ignored non-secret account registration, account-listed models, explicit
4,096-character article preview/redaction, bounded same-Topic/related source
context and optional human roots, domain-limited provider research, private
result/citations, and separate exact preview/local AI-labelled sharing. The
backend derives agent identity/operator provenance and enforces revision/source
ownership. No automatic provider call or publication, raw-text SQLite archive,
API key, paid fallback, new browser permission or model download. Background
embedding remains local. Research is capped at one concurrent operation and five
starts/hour/process, with a 90-second deadline and no retries. Completed service
results expire after two minutes or are purged after consumption/cancellation.

Review corrections include stale connect/refresh/callback fences, wrong-state
callback handling, bounded response parsing, account-specific model invalidation,
cancel/reset/disconnect late-result suppression, strict safe citations, source
document attestation, and preservation of human versus AI ownership/counts.

Current evidence: service **125/125**, loopback integration **2/2**, extension restricted **795/795**, explicit
indicator suite **533/533**, focused UI/package **33/33**, final mode/label checks
**23/23**, controller
**9/9**; service/extension secret scans **73/173 files, zero findings**. Relative
links checked in the changed Markdown files resolve; whitespace check passes.
After the owner freed port 4174, actual **Chrome 154.0.8037.58** passed the full
isolated action-popup regression: one synthetic insight request, three intercepted
fixture documents, **zero runtime exceptions and zero external extension requests**.
This covers reading public article text while excluding form values, source
context, model choice, explicit cost confirmation, private output/citations,
separate preview/share, AI-labelled cross-source discussion, operator ownership,
withdrawal, persistence/re-pairing and deliberate source-icon navigation. Lead
inspected accurate User Mode top/footer screenshots; account/source/session
details are collapsed, and the Topic/discussion stays prominent. Only disposable
profiles/databases and synthetic transports were used, never the owner database
or a real provider. User Mode uses concise comment/edit/discard/count labels;
Developer wording remains available. Only redundant success text is hidden;
loading/errors and demo identity remain explicit. No matching/capture authority
changes.

No live login/inference is claimed. Next owner check is official ChatGPT login,
account/model/search eligibility and a useful public-page result, following the
[browser guide](../spikes/topic-resolution/browser/README.md#chatgpt-insights-0122).
Included-plan-only spending must be configured at the provider and confirmed in
the UI; the application cannot enforce provider billing. Slow model-list or
revocation calls can exceed the retained five-second HTTP deadline and require
a deliberate status check/retry, not an automatic fallback. Registration remains
after sign-out; reusable tokens do not. This is a local PoC, not production
multi-user auth, provider/legal/store clearance or validated insight quality.
The research-only wording below describes earlier checkpoints, not authority
to repeat completed reviews or ask again for the already approved connection.

The owner now explicitly redirects investigation from specialist-forum aggregation
to users' own AI researching the current page and relevant external sources,
finding useful missing/conflicting context, and deliberately sharing selected
insights into native discussions. This is the prioritized product hypothesis,
not provider/build/publication approval. Read
[AI insight research](../research/AI_INSIGHT_COLD_START_2026-09-29.md).
Lead and two Sol reviews distinguish personal value from actual willingness to
publish; public reusable findings, not private chat alone or AI filler, are the
proposed value. Consumer-plan integration is provider-specific: official ChatGPT
OSS/local plan-use documentation is promising but project/account/search eligibility
is unverified, and no project LICENSE was found. Manual research is a validation
fallback, not the desired final UI. No account, inference, real-page AI pilot,
external search API, capture expansion or app change occurred; 0.11.0 remains.
Next proposed evidence is five public-page insight comparisons, with the exact
provider/data/search/quota/privacy package approved before any real activation.
Do not continue forum-feed or Lemmy integration as the next product work.

## Previous request: first-use coverage through external discussions

Newest owner clarification after the probe: many specialist sources are too much
onboarding/complexity, and comments must be readable **inside the extension**.
An outbound discussion-link panel alone is not the requested benefit. Do not turn
the feed probe into the next product connector. Need broad relevant discussion
supply plus permitted inline comment access; a common discussion-network API is
only a candidate, not a chosen provider or proven solution. No inline fetch/cache,
mirroring, cross-posting, new permissions or publication is approved.

Follow-up feasibility research is complete; see
[independent discussion sources](../research/DISCUSSION_SOURCE_FEASIBILITY_2026-09-29.md).
Primary sources and three bounded Sol reviews support testing common RSS/Atom
formats across several subjects, not a claim of broad useful coverage. Concrete
advertised feeds, dated/unverified candidates, authenticated-feed exclusions,
optional RSS article/comment linkage, costs and access/rights limits are recorded.
The owner subsequently approved testing a few pages. The transient, capped probe
is complete: three public RSS feeds parsed (MacRumors, unknowns, Discourse Meta),
two reads each and ten entries inspected per read. Titles/links/date/description
fields were present; this is not validated article relevance or broad coverage.
Cyclingnews was excluded after terms review; Kretaforum discovery accepted no URL
and no feed was fetched. Ambiguous comments/host counters were excluded after an
offline parser correction; raw responses were discarded, so no corrected live
claim or extra retrieval. The standalone probe and offline checks are recorded.
It is neither the 200–250-pair review nor an owner rating assignment. No API search,
retained discussion corpus or owner browsing data was involved.
No app connector, model, schema, runtime or source-provider decision changed (0.11.0).

Newest constraints: a friend-invitation conversation is not the required public
cold-start benefit; neither a narrow Hacker News launch nor dependence on a few
large platforms is acceptable. Explore many independent operators via common
feed formats rather than bespoke website connectors. Discourse/Lemmy docs support
that technical possibility, not broad coverage or reuse permission. Need coverage,
cost and largest-source-removal evidence before adopting it. No integration,
corpus acquisition, provider choice or extra capture is approved or implemented.

Latest follow-up asks about Reddit/other systems. The discussion-finder hypothesis
links existing canonical external conversations to relevant Sources, keeping native
posts distinct; no mirroring or presumed API access. Primary docs confirm Reddit
search/embeds but require explicit API approval and commercial agreement; Hacker
News's official API and Discourse feeds are other candidates. A cross-source map,
durable native questions and reciprocal community source bundles may create value;
outbound-link utility alone does not prove native participation. Nothing connected.

The owner supports the broad concept-review direction and asks how Sources and
discussions could grow rapidly, especially relevant coverage on first installation.
They explicitly clarify that user-owned AI supplying research sources is thinking
aloud, not an adopted strategy. [Growth hypotheses](../research/GROWTH_LOOPS_2026-09-29.md)
record the owner's rejection of a single-interest launch prerequisite. Latest
hypothesis: independent personal source utility plus deliberately shared questions
that recipients can read/answer on the web without an extension; neither new
feature scope nor a growth strategy is adopted. AI remains optional; discovered
links/provider citations are not compatible captured-page vectors or confirmed
Topic membership. Current
official OpenAI docs establish potential MCP and bounded plan-usage routes, not
a tested connector, project eligibility or provider approval.
The owner accepts extension -> readable web -> Android/iOS sequencing. Public
operation remains separately gated. Coverage, useful replies and returning people
are separate outcomes; capturing URLs does not reach the publisher's whole audience.
This is strategy, not permission for shared capture, hosting, publication, outreach,
telemetry, paid acquisition or a migration. Current implementation is unchanged.

## Previous request: whole-concept review before choosing overlap behavior

The owner requests a candid product reassessment before the next architectural
decision. [Concept review](../research/CONCEPT_REVIEW_2026-09-29.md) records the
lead's recommendation and two independent Sol critiques: retain cross-site
semantic conversations, but separate automatic relevance retrieval from stable
conversation identity. Reconsider automatic historical routing and defer the
primary-Topic dropdown/many-to-many migration until its user-facing purpose is
clear. The owner subsequently supports the direction; the concrete routing/migration
contract remains **not approved or implemented**, and 0.11.0 remains intact.
Cold-start Sources and cold-start participation are separate problems; favor a
small useful, permitted reading/discussion collection for one reachable audience.
No new owner data, capture, model, provider, recruitment, migration or release.
Current primary sources rechecked; review is not user research or policy clearance.

## Previous owner feedback: similar pages blocked by the competing-member rule

- A pair-scoped read-only/query-only diagnostic confirms current v2 state and
  adaptive policy, compatible vectors above the .90 floor, no manual pin or
  retained-tight boundary, but separate Topics. A matching-field-only calculation
  shows the closest outside-member margin is the immediate veto. No unrelated
  URLs/titles, comments, authors or credentials were inspected; no data changes,
  service contact, migration, capture or inference. Pair identities, scores and
  vectors are deliberately not retained in this repository.
- Lead and independent Sol review reproduce a general mechanics gap using only
  invented geometry: three separate Sources with every pair cosine .92 stay as
  three singleton Topics, because every candidate pair treats the third Source
  as a competitor. The same three become one group when two already share a
  Topic. The current pairwise-only candidate construction is therefore history-
  dependent and can block a fully coherent multi-page group. Lowering the floor
  alone would not remove this margin veto.
- Proposed correction: evaluate a bounded, mutually complete-link-compatible
  multi-partition neighborhood before applying the competing margin to genuinely
  outside Sources. Preserve manual pins, supported split boundaries, tightened
  thresholds and atomic thread routing; never use single-link chaining. This is
  a design follow-up, not an implemented or validated rule. Need staged versus
  simultaneous arrival, dense/duplicate, bridge/hard-negative and bounded-work
  tests before changing production. No extra model or expanded data scope needed.
- This turn diagnoses only. It does not prove that the two live articles describe
  the exact same event: direct page reads were unavailable. No automatic/manual
  merge, lower threshold, stored-data write or product-code change was performed.
- Owner follow-up raises overlapping Topics rather than exclusive competition.
  This is a design proposal, not yet an approved many-to-many schema migration:
  a Source could participate in several Topics without merging those Topics;
  each root/reply conversation would retain one canonical selected Topic and
  appear on its member pages without duplicate posts. Resolve root routing and
  posting disclosure before replacing the current single Source-to-Topic link.
  Do not implement either the neighborhood correction or multiple memberships
  merely from this discussion without settling that architectural choice.

## Verified checkpoint: adaptive Topics and clickable post sources — 0.11.0

Owner **explicitly approves ADR-023's local association/migration/regrouping package**
and adds directly clickable source-page icons for individual posts, including
reply-specific provenance independent of the root's grouping anchor. Sol Medium
implements bounded backend, planner and UI slices; lead integrates/reviews and
runs actual Chrome. The following is implemented and verified:

- Strict transactional `demo-state/v1` -> `v2` first-open migration, revision +1,
  preserving legacy/manual Topic roots without guessed page provenance. Corrupt
  old records or serialization failure roll back without reset. Source anchors
  move entire root/reply sets atomically while preserving IDs, text and authors.
- New posts expose the retained Source URL/title through an authenticated local
  DTO. The small native ↗ link opens a new tab only on deliberate activation;
  English language keys, keyboard name/focus, `noopener noreferrer` and no-referrer.
  Replies may have their own origin independent of the root's routing. Changed
  page representation pins old roots; title-only updates do not. Links are live,
  not archived content. Manual Topic-only and legacy posts have no link.
- Forget removes every root/reply association to the Source, preserves comments
  and pins threads; withdrawal removes that post's link. Clear also purges learned-
  origin roots manually moved to fixture/manual Topics. Expected-version fences
  reject stale commands; a refreshed moved selection detaches the unsent draft.
- Active `adaptive-supported-partitions/v1`: .90 floor, .94 refinement, .04
  competing-member margin, .995 duplicate discount, at least two independent
  representatives in each supported subgroup. All-member coherence, manual pins,
  stable Topic reuse and retained tighter boundaries prevent simple chaining and
  immediate split/remerge after support removal. Planning uses at most 100 Sources.
  Orphan/legacy Topic containers are not reused for unrelated new pages.
- The frozen four-case invented-vector mechanics report and 11 planner tests pass.
  The duplicate-flooding case intentionally leaves four false joined pairs in an
  already wrong group: copies cannot fabricate independent split support. These
  are **not learned E5, real event or viewpoint-quality measurements**. Prior E5
  opinion/event overlap remains unresolved; .90 increases false-match risk. There
  is no new model, extraction/input change, second vector, permission or remote scope.
- Independent Sol Trust review identifies and fixes reopened-state corruption
  gaps for the learned-origin purge flag and Source receipt digest. Final read-only
  integration review has no material finding; 22 focused socket-denied checks pass.
  Lead inspects migration, projection, mapper, contract and stale-selection paths.

Final verification (Node 24.19.0, installed Chrome 154.0.8037.58):

- Extension restricted **763/763**, normal **762 passed + 1 intentional skip**,
  focused indicator **501/501**; backend socket-denied **93/93**; loopback **2/2**.
  Offline embedding helpers **54/54** (no model inference/download); both local
  secret scans report zero findings and `git diff --check` is clean.
- Actual Chrome full matching **21 covered areas**: 14 local 384D vectors, eight
  owned intercepted documents, zero fixture raw-text payload matches, extension
  external requests or runtime exceptions. Own-source root/reply links, whole-tree
  correction, Forget link purge, restart/pairing and all five toolbar colors pass.
- Actual Chrome legacy discussion **20 covered areas**, including keyboard
  activation opening the source in a real new tab with null opener/empty referrer;
  three intercepted fixture documents, zero runtime exceptions/external extension
  requests. Native new-tab setup initially stalled because renderer Network/Runtime
  setup preceded resume. The harness now registers Fetch interception first, resumes,
  then enables telemetry; only truly detached setup is canceled, live failures fail.
  Final scheduled work is drained before claiming PASS. Independent review verifies
  the request guard, not a global browser firewall guarantee.

Only temporary profiles/databases and project-created pages were used; owner data
was not accessed/reset. First native permission prompt and browser/extension
restart remain manual boundaries. No new general-web or publication claim.
Owner next step: stop/restart backend, reload 0.11.0, pair and Start once; no reset.
Observe the experimental matching and new links. Existing roots stay pinned;
later normal ingestion/correction/removal may regroup provisional Source links.
All later private/provider/durable-pairing/remote/release and large-corpus gates remain.

### Prior proposal context (superseded by the approved implementation above)

- Owner proposes sparse-to-dense threshold adaptation and regrouping, with each
  whole root/reply thread following the page where its root was started. This is
  a requested revision of stable assignment, not a Qwen/provider expansion.
- Lead/independent Sol Medium code inspection finds no saved originating Source
  on current roots: the command has only Topic/body. Existing roots cannot safely
  be attributed to pages retroactively; proposed migration pins them in place.
- [ADR-023](../decisions/ADR-023-adaptive-topics-source-anchored-subthreads.md)
  proposes stable root identity, Source-or-Topic anchors and a derived current
  Topic view, with entire replies intact. Source-version drift, manual pins,
  deletion/Forget, stale writes and rollback need explicit lifecycle contracts.
- Nearby embedding structure, support and stability should govern refinement,
  not raw site counts/popularity. Opposing opinions can themselves form distinct
  vector groups; density does not guarantee event identity. No production
  algorithm or adaptive range has been validated.
- The original proposal stopped before the new persistence/migration boundary:
  it requested approval for the
  locally retained post-to-page association and whole-subthread reclassification,
  keeping old unanchored threads fixed. No database/service/page access, new
  inference, schema/cutoff/input changes or regrouping in that advisory turn.
  The subsequent approval above now authorizes the bounded implementation.

## Previous direction: no additional local language model

- Owner declines ADR-022's Qwen experiment because of download size/latency;
  defer it rather than repeatedly seek approval. No new model/assets/inference.
  Connected-user AI is only a possible later direction, not approved integration.
- Owner asks for embedding-side alternatives, with 0.90 as a fallback threshold.
  Lead and Sol Medium independently inspect the existing synthetic report:
  current body-prefix held-out pair acceptance changes from 1/6 positives and
  5/60 negatives at 0.94 to 5/6 positives and 8/60 negatives at 0.90. These are
  deliberately difficult synthetic pairs, not general accuracy or sequential
  cluster results. All-member and 0.04 margin guards also affect assignment.
- Lightweight option: test a title-focused, much shorter lead with the current
  model/one vector; title-only ranking is promising but not validated. Longer
  term: task-specific fine-tuning of the same architecture, requiring proper
  labeled data and its later approvals. No guaranteed viewpoint-independent fix.
- Recommendation under discussion: a clearly experimental 0.90-only prototype
  change retaining other guards, manual correction and stable existing links.
  Production still uses 0.94; no new input, training, inference, service contact,
  owner-data access or historical regrouping performed in this advisory turn.
  See [ADR-022](../decisions/ADR-022-subject-verifier-experiment.md).

## Verified checkpoint: five toolbar states and matching experiment - 0.10.0

- Owner explicitly approved ADR-019 A's bounded article-first/title-plus-lead,
  same-model, single-vector upgrade and new synthetic opposing-opinion/hard-
  negative measurements. No raw text, additional retained vector/fact, provider,
  permission or private scope; existing links/comments remain unchanged.
- Sol Medium implements a tested article-first/title-input proposal and freezes
  32 invented documents before 96 offline E5 inferences. Title/lead held-out
  retrieval gets 12/12 partners in top five, but just 3/12 first. Same-Topic and
  hard-negative scores overlap; the current rule makes 1-4 false joined pairs
  across three arrival orders. No useful safe cutoff was established. See
  [results](../apps/local-service/experiments/topic-identity/RESULTS.md), including
  the lack of a pre-inference git checkpoint and narrow synthetic limitations.
- Lead stops activation on this adverse evidence. Proposed reader/input/tests
  remain outside the extension under `experiments/topic-input`; active collector,
  matching input, policy, backend and tags match the preceding checkpoint. No
  old Source/Topic/comment data was changed. The restored backend rejects the
  proposed new tags. Token-only parity against the preserved helper is 32/32.
- Toolbar request is red disconnected, gray connected/no current Topic, green
  current Topic, light blue shared Topic, dark blue shared Topic with visible
  posts. Implemented with fresh version-coherent catalog/discussion evidence,
  authenticated deduplicated popup refresh, stale-response/paint fences and one
  cleanup marker. No new permissions/capture/token retention. Review catches and
  fixes stale Chrome per-tab base colors on off-session startup/focus/activation;
  only the focused normal window's active tab is observed, never a tab scan.
- Final offline checks: restricted **753/753** (includes 74 archived experiment
  checks), normal **752 plus one intentional skip**, indicator **491/491**,
  backend **69/69**, evaluator **6/6**, scans **162 + 56 files, zero findings**.
  Independent Sol Medium icon review passes **149** scoped checks with no blocker.
  Actual Chrome session **19/19** and reader/eligibility **47/47** pass with zero
  external requests/runtime exceptions/model loads/backend contact.
- Owner confirms their backend is stopped. Full **0.10.0 Chrome 154 matching/
  comments/native-color smoke passes all 20 covered areas**, twice; the final run
  adds explicit red-on-401 and gray-after-re-pair assertions with capture stopped.
  All five colors, last-visible-post withdrawal to light blue and repost to dark
  blue pass without additional ingestion. Semantic/fallback layouts share a
  Topic/comment, preserved across SQLite restart. Eight owned intercepted documents
  produce 14 real 384D vectors; zero fixture raw-text matches in inspected API
  bodies, external extension requests, runtime exceptions or abandoned setups.
- Legacy Developer discussion smoke passes all **19 covered areas** after a
  test-only whitelist correction: the existing one-integer toolbar cleanup marker
  is legitimate even while unpaired/capture-off. Exact session keys, inactive
  lease, token shape and empty sync/local-only UI preference stay enforced.
  Separate loopback transport/security/persistence tests pass **2/2**. Owner
  service/profile/database were not contacted or changed; only disposable test
  profiles/databases and injected test tokens were used. No production fix needed.
- Independent Sol Medium QA/Trust review accepts both harness changes, with
  **115/115** focused socket-denied checks and no must-fix finding. Lead reruns
  the complete restricted suite **753/753** and secret scans **162 + 56 files,
  zero findings** after the harness correction. README, handoff and ADR-020/021
  now record the completed full-loop evidence; the model gate remains untouched.
- Native evidence is completed 16/32px bitmap submission and tooltip checks, not
  a screenshot of the OS toolbar or proof of every transient paint ordering.
  No-extra-ingestion assertions are not independent no-reader/inference proof;
  restricted race tests supply those narrower cancellation checks. Existing native
  first-dialog, installed reload/browser-restart and real-page-quality gaps remain.
- At this checkpoint, [ADR-022](../decisions/ADR-022-subject-verifier-experiment.md)
  proposes one additional quantized local model, at most 750 MiB, synthetic-only
  subject-verification measurements and no production/data-flow changes. Explicit
  approval was requested; **no download or new model inference performed**.
  The owner subsequently declines this direction (see latest direction above).
- ADR-019 C durable pairing and all later gates remain pending. Phase 0 and the
  completed 6/6 review are not reopened.

## Latest diagnosis: another owner-supplied news pair - 2026-09-29

- After restarting the backend, the owner confirms a Topic title appears and
  asks why two specific related articles still have separate Topics. A new
  pair-scoped SQLite read-only/query-only snapshot finds both exact supplied
  URLs, compatible normalized 384D vectors in the same model/extractor space,
  and distinct provisional Topic links. Their current similarity exceeds the
  related cutoff but is below the automatic-grouping cutoff; this alone prevents
  either from automatically joining a Topic containing the other under current
  inputs. This is a real stored split, not merely a related-results label.
- Revisit preserves the existing assignment. No historical vectors, original
  captured text or decision ledger exist, so this does not reconstruct the
  first ingestion or establish why the sampled texts produced that distance.
  All-member and competing-Topic safeguards remain additional conditions; they
  are not needed to establish this pair's present cutoff failure.
- Independent Sol Medium code review and six focused socket-denied synthetic
  regressions confirm policy, related labeling, compatibility and revisit
  behavior. No application/data change, page fetch, inference, model download,
  service request, comment access or other browsing-history projection. Raw
  vectors, article identities and pair-derived numeric reports are not committed.
  Existing owner-approved diagnostics do not approve ADR-019 A/C or a regrouping.
- Next: assess input quality and calibrated grouping under the existing gates;
  do not globally lower the cutoff from this single positive example. Manual
  Source correction remains available and does not move existing comments.

## Current increment: same-window tab session clarity — 0.9.1

- Owner reports new tabs appear to need consent again. ADR-019 B already covers
  all eligible active tabs in one normal window. Diagnosis found no per-tab lease
  or tab-triggered Stop, but reproduced an always-visible unchecked checkbox/Start
  even during active sessions. Owner runtime state has not been independently
  reproduced; do not assume every report was solely this presentation problem.
- Sol Medium implements a separate localized session status and hides/disables
  redundant Start/consent while active here or while an enabled session lacks an
  eligible page context. Stop remains usable; unavailable worker state stays honest.
  Other-window Start explicitly moves the session. No automatic consent, persistent
  checkbox, background-tab scan, permission/core-lease/pairing/backend change.
- Root adds three adapter regressions: distinct new blank/loading/HTTPS tab and
  switchback/non-last closure; inactive-tab exclusion; same-URL different-tab
  pending inference cancellation. Adapter **78/78** pass. Separate QA agent adds
  actual Chrome new-tab/navigation/switch/close checks: **19/19** session checks
  pass with the exact same lease revision/window, zero external requests/runtime
  errors/model loads/backend contact. This actual-browser slice stops at the
  unpaired gate; it is not full embedding/shared-comment evidence.
- Final verification: restricted **675/675**, normal **674 plus one intentional
  skip**, indicator **487/487**, secret scan **153 files, zero findings**.
  Independent Trust review finds no material blocker, with **181/181** scoped
  tests. Lead reruns actual Chrome eligibility/reader checks **47/47** alongside
  the QA agent's **19/19** session checks. Existing reload/restart/native-dialog
  evidence gaps remain. Reload deliberately ends the session; the owner must
  Start once after updating, not once per tab.

At this checkpoint the full 0.9.x matching/shared-comment test awaited the owner's
manual shutdown of port 4174. It subsequently passed in 0.10.0 as recorded above.
Prior fallback implementation checkpoint `f9b96d6` is committed/pushed; its
original evidence follows.

## Previous increment: owner-approved generic article fallback — 0.9.0

- Owner explicitly approved **"the bounded generic fallback"** on 2026-09-29.
  [ADR-021](../decisions/ADR-021-bounded-article-container-fallback.md) records the
  exact rule: narrowly marked DIV/SECTION, multiple substantial paragraphs, low
  link density and mostly paragraph text. Existing semantic regions retain
  priority; ambiguity and excluded content abstain. One shared 10,000-step/40 ms
  budget, at most 4,096 sample characters/512 tokens, no whole-body fallback.
- Separate `article-container-prefix/v1` provenance shares the **unchanged** E5
  transform with `main-text-prefix/v1`. Exact allowlists cover reader/client,
  ingestion, SQLite validation, all-member/competing-Topic checks and related
  candidates. Unknown versions remain rejected; legacy records, manual links,
  comments, thresholds and receipt semantics are preserved. Restart the backend
  along with reloading the extension to activate both sides of the new tag.
- Unmodified serialized production reader succeeds **3/3** on the supplied
  GameStar anonymous static snapshot: 3,796 sample characters, 141 title characters,
  8.4/6.4/4.9 ms. Browser scripts/network were blocked and external CSS absent;
  expected URL was `about:blank` in an inert temporary DOM. This is **not** live
  owner-profile, semantic-quality or embedding/Topic evidence. No article/HTML/
  title/attribute text was printed or retained or sent to the model/service.
- Verification: restricted **659/659**, normal **658 plus one intentional skip**,
  indicator **471/471**, socket-denied backend **69/69**, secret scans **153 + 48
  files, zero findings**. Actual Chrome **47 eligibility/reader checks** pass,
  including fallback positives, nesting, ambiguity, hidden/comment ancestors,
  link lists, no-body fallback and legacy precedence. Thirteen synthetic captures,
  zero external requests/runtime errors/inference/model loads. Actual Chrome
  **15 session checks** also pass, preserving prior manual reload/restart/native-
  dialog gaps. Sol Medium implements the bounded slice; independent Trust review
  finds no material blocker (65 scoped checks), and separate QA reviews harness
  wiring. Lead adds explicit mixed-policy restart/comment assertions.
- **At the original 0.9.0 checkpoint, the full embedding/shared-comment/backend
  restart regression was pending**:
  the owner's backend still owns port 4174. Asked for Ctrl+C; no service or owner
  data was contacted, stopped or changed. The harness now includes a semantic/
  generic identical-text pair, shared comment/icon and mixed-policy SQLite restart
  assertions; these new full-loop browser assertions have not run yet. Offline
  tests already cover cross-policy matching, ambiguity, comments and SQLite reopen.

Subsequent 0.10.0 continuation completes matching, legacy discussion and loopback
regressions after the owner stops the service (see current checkpoint). Reload/
restart and live GameStar feedback remain owner steps, not general-web validation.
ADR-019 A was separately approved/measured without rollout; C and later gates
remain pending. Phase 0/6-of-6/S3/B remain finished.

## Earlier narrow attempt: capture-budget diagnosis and efficiency fix — 0.8.1

- Owner asks to fix pages that cannot embed and supplies a public GameStar page.
  Two anonymous bounded reads plus inert, network-blocked Chrome DOM diagnostics
  reproduce the old reader's node-budget failure at 1,501 visits during region
  discovery (about 7.5 ms). The optimized reader still returns
  `capture-node-budget` (about 6.5 ms). Static response: 361,054 bytes, 145 head
  children, 1,389 elements, no MAIN/ARTICLE/role=main/articleBody or Article/
  NewsArticle itemtype marker. This does not establish the owner's live DOM or
  time-limit failure: external CSS/scripts were disabled. No article/HTML/title/
  attribute text was printed or retained; no model/backend or owner profile used.
- Separately reproduced and fixed two generic inefficiencies: scanning metadata
  after the bounded title was already found, and enumerating an entire sibling
  list before reading a usable first paragraph. Lazy depth-first traversal and
  early title completion now accept these fixtures inside all existing limits.
  First eligible region, ordering/whitespace/prefix, exclusions and payload stay
  unchanged; `main-text-prefix/v1` remains justified by parity tests. No threshold,
  credential, permission or expanded region scope change. See the
  [ADR-018 correction](../decisions/ADR-018-background-page-matching-local-poc.md).
- Fixed messages now distinguish `capture-time-budget`, `capture-node-budget`,
  `capture-head-budget`, `capture-attribute-budget` and `capture-failed`, retaining
  legacy `capture-budget` input. Each states no embedding was created for that
  attempt. Identity-based internal sentinels never disclose raw exception/DOM
  details. A final elapsed check prevents slow final reads from publishing late.
- Sol Medium implements the reader, a separate Sol Medium Trust review accepts
  it (89 focused checks), and the lead integrates UI diagnostics and real Chrome
  fixtures. Restricted **641/641**, normal **640 plus one intentional skip**,
  indicator **453/453**; secret scan 153 files, zero findings. Actual Chrome passes
  **37 eligibility/reader checks**, including early-title/large-head and complete-
  prefix/wide-tail recovery plus genuine node/head/attribute-limit rejections.
  Nine synthetic captures, zero external requests/runtime exceptions/model loads.
- **GameStar is not fixed by this bounded optimization alone.** Its static HTML
  lacks the accepted semantic regions. [ADR-021](../decisions/ADR-021-bounded-article-container-fallback.md)
  proposes a generic likely-article fallback and up to 10,000 structural steps,
  retaining 40 ms, 4,096 sample characters, exclusions and on-device/local-only
  processing. The owner explicitly answered **"Approve the bounded generic
  fallback"** on 2026-09-29. The resulting 0.9.0 implementation is recorded above;
  no wider ADR-019 A/C approval is inferred.
- Full embedding/shared-comment regression for 0.8.1 is pending because the
  owner's backend is running on 4174 again. Asked for Ctrl+C; did not contact,
  stop or alter that service/data. Last full-loop evidence remains 0.8.0 below.

This initial attempt established why optimization alone was insufficient. The
approved fallback supersedes only its structural work/region-selection limits;
all later external gates remain intact.

## Previous increment: User/Developer UI and blue same-Topic icon — 0.8.0 verified

- Owner requests a compact mode switch, Topic-first User view, clear connection
  status and blue toolbar icon when another page belongs to the same Topic.
  [ADR-020](../decisions/ADR-020-user-mode-and-topic-indicator.md) records this
  presentation scope. Two Sol Medium slices implement it; the lead integrates
  and a separate Sol Medium Trust reviewer checks the resulting boundaries.
- User is the default. One shared controller preserves drafts, selection and
  actions between modes. English locale keys cover the new UI; visible state,
  keyboard controls and manual/provisional/synthetic cues avoid color-only or
  unqualified matching claims. Connection reflects the last service observation,
  not a token or an always-live heartbeat. Start/Stop/disclosure, blocking,
  native access removal, connection and correction/deletion stay accessible.
- Only an inert display enum is added to local storage. A single trusted-session
  tab ID supports clearing a previous per-tab icon after worker reconstruction.
  No URL/content/history, new permission, input/threshold change, token persistence
  or backend change. Fresh catalog evidence must bind the ready Source ID/URL/
  Topic to another distinct learned Source in that Topic. Related suggestions
  and fixture-only peers never make the icon blue. Invalidations cancel reads
  and serialize icon writes; an API failure retains the cleanup marker and
  prevents new blue, but cannot promise Chrome cleared an existing override.
- Independent scoped Trust review initially reproduced 118 focused checks and
  found no material blocker. Lead visual/integration review caught a transient
  unpaired "Finding Topic" heading and a hash-link shortcut incompatible with
  exact popup sender authentication; both are corrected. Independent follow-up
  accepts the fixes (21 focused checks); actual Chrome confirms the shortcut
  preserves the exact popup URL, keyboard focus and capture eligibility.
- Final checkpoint evidence: full restricted **624/624**;
  normal **623 pass / one intentional guard-only skip**; indicator **436/436**; backend
  socket-denied 67/67; secret scanner 153 files, zero findings. Actual Chrome
  session smoke passes **15 checks**, eligibility/reader **32**. The eligibility harness
  now waits for actual native popup focus before its injected parent-window test;
  immediate assertion failed twice, diagnostic/awaited runs passed. No production
  focus rule or deadline was relaxed. The final unpaired User layout was also
  visually checked in Chrome; no external requests or runtime errors occurred.
- The implementation checkpoint was committed/pushed as `b49970a` with the
  full-service test gap explicitly recorded. Owner then confirmed their backend
  stopped. **The unchanged 0.8.0 passes all 17 full matching Chrome checks**:
  User-default connection/Topic/draft-preserving mode switch, actual native blue
  icon after a second learned page joins the Topic, shared comments across two
  HTTPS origins, neutral on an unrelated page and still neutral after Stop,
  persistence/re-pairing and the
  existing correction/Forget/deletion controls. Six owned intercepted documents,
  ten real 384D vector requests, zero runtime errors/external extension requests
  or fixture raw-text matches in inspected request bodies; no abandoned setup.
- **The Developer-mode discussion regression passes all 19 covered areas**,
  including keyboard, root/reply/edit/withdraw, restart, inert markup and exact
  storage boundaries. Loopback transport integration also passes **2/2**. All
  tests used owned temporary profiles/databases, never the owner's data/service.
  No production or harness correction was needed after freeing the port.
- The lead visually inspected the connected User popup on the second page: the
  Topic title and original comment, green connected text, provisional association
  cue and synthetic identity are visible. Native icon evidence observes successful
  real `setIcon` completion with 16/32px blue/neutral pixels plus tooltip checks;
  it is not an OS-toolbar screenshot. Startup neutral remains default/tooltip and
  unit evidence because instrumentation attaches after startup. This verifies
  owned-page wiring, not real-news matching accuracy or store/legal clearance.
  Separate Sol Medium QA closure review accepts these bounded claims. This run
  did not exercise Stop while blue; clearing active blue on Stop has focused
  adapter-test evidence, not an additional Chrome claim here.

Next: owner can restart their service, reload extension 0.8.0, re-pair and Start
a fresh browsing session to try the User view. Existing first-native-dialog and
installed-extension reload/browser-restart manual checks remain; the new UI's
full-service verification blocker is resolved. ADR-019 A/C and all later external
gates remain pending; completed foundation/owner reviews are not reopened.

## Previous increment: ADR-019 B session-wide browsing — implemented/reviewed; full-loop checks pass

- Owner requests implementation of improved viewpoint-independent matching,
  automatic vectorization on visits, and connection credentials across sessions.
  Current matching already runs automatically on individually enabled sites;
  a global mode removes the first grant per new domain, not a per-page requirement.
- [ADR-019](../decisions/ADR-019-automatic-browsing-and-durable-pairing.md) proposes
  the exact package: bounded article-focused matching work with existing assets;
  one Start per browsing session across eligible HTTPS sites with Stop/site blocks
  and dedicated non-sensitive profile; durable trusted-local browser bearer plus backend verifier and explicit
  revocation. Existing links/comments stay intact. No additional event fields,
  model, raw-text upload, private scope or automatic discussion merges.
- Two Sol Medium read-only reviews identified the permission and credential
  boundaries, wildcard/block-list semantics, version compatibility and stale-401
  race. Broad grants cannot reliably distinguish private pages. Persistent bearer
  storage is not an OS keychain; browser-profile compromise can expose demo access.
- Owner clarifies session-wide consent, not per-website consent, then explicitly
  answers "approved" to the app-enforced window session/broad Chrome permission
  question. **Only B is approved; A matching/input and C durable pairing remain
  pending.** B replaces persistent automatic capture with a trusted session-memory
  lease bound to the browser window where Start was pressed. Stop/window closure/
  browser restart/reload ends capture; popup closure and worker suspension do not.
  Other windows are outside the session. Chrome has no native expiring
  wildcard grant: an underlying grant may remain after a crash, but a fresh app
  session is required to capture. Stop retains native access; the separate Remove
  broad HTTPS access action stops first then removes it. Saved pairing is
  independent and remains session-only in this slice.
- 0.7.0 implements B with Sol Medium core/UI slices and a separate Trust review.
  Trust identified and reproduced two defects, both now fixed: block-list overflow
  could invalidate status while capture remained active; a worker interruption
  between live-lease and block writes could lose the new block. Overflow now
  stops and preserves the bounded list. Block transactions persist an inactive
  lease first, gate concurrent Start, commit configuration, then restore only a
  still-valid unchanged session. Stop shows pending until worker confirmation.
- Final production review accepts B; independently **191/191** focused restricted
  checks pass. Full restricted **571/571**, normal **570 pass / one intentional
  guard-only skip**, indicator **389/389**, service **67/67**; secret scan 144 files,
  zero findings. Actual Chrome's **32 eligibility/reader checks** pass, including
  inert legacy enabled preferences. The separate session smoke passes **14 actual
  Chrome checks**: real Start/native grant, cross-domain routing without another
  Start, popup retention, blocks, other-window exclusion, bound-window closure,
  Stop retaining access, explicit access removal, and forced worker reconstruction.
  Three owned intercepted documents; zero blocked requests, runtime exceptions,
  model loads or inference targets. It stops at the real unpaired gate, not a
  vector/ingestion claim. The native dialog is not automated: test setup prepares
  only the exact Chrome-management target before the real product request.
- Actual extension reload/browser restart remain **unverified by this headless
  harness**: action reopening after runtime.reload ended the pipe/process, and
  same-profile restart did not restore the CDP-loaded worker/action registration.
  No production lifecycle/permission guard was weakened to work around it.
  Unit reconstruction with empty session storage passes; natural idle suspension
  and crashed-process cleanup are not claimed. Owner manual check: start in the
  dedicated test profile, reload the extension, then separately restart Chrome;
  each must show capture off until fresh Start. Native HTTPS access may remain.
- Owner subsequently confirmed their service was stopped. **The updated full
  two-domain Chrome smoke now passes all 15 checks in two consecutive runs**, including real browser E5
  vectors, shared comments on another HTTPS origin without a new grant, unrelated
  separation, Stop/new Start, accepted metadata, excluded forms, SQLite/service
  restart with explicit re-pairing, correction/Forget and confirmed deletion.
  Each run: six intercepted owned documents, ten 384D vector requests, one
  actually detached setup canceled; no external extension request, runtime error
  or fixture raw-text body match in inspected API requests. This is wiring and
  fixture evidence, not validated real-news matching quality.
- The first runs exposed a **test-harness** race, not a production regression:
  `Runtime.enable` timed out ten seconds after its exact CDP session had detached
  before setup completed. A per-session lifetime now cancels only that vanished
  target's unfinished setup. Live setup errors and all Fetch/payload checks remain
  fatal. Start/removal await confirmed state; pending tasks/errors are checked
  before PASS. Separate Sol Medium QA/Trust review accepts the correction after
  catching and fixing a same-turn error-ordering edge; **6/6** focused tests pass.
- The historical discussion Chrome smoke also passes **19 covered areas** on
  0.7.0, with zero runtime exceptions/external extension requests; loopback
  transport tests pass **2/2**. Full restricted suite is now **577/577**, normal
  **576 pass / one intentional guard-only skip**; secret scan **146 files, zero
  findings**. Only
  harness/tests/docs changed in this follow-up; no production, owner profile/
  database, model assets, pairing credentials or matching-policy changes.
  Phase 0 and the 6/6 review stay complete; broader gates remain unchanged.

See [the ADR-019 B review](../research/ADR019_SESSION_REVIEW_2026-09-29.md) for
scope, corrections, exact evidence and storage-failure limitations. Next: owner
can restart their service and test 0.7.0; obtain manual first-grant and reload/
restart evidence. No renewed B approval is needed. A/C remain separate.

## Current owner feedback: similar pages split into Topics — 2026-09-29

- Owner reports two public news pages receiving separate Topics. Read-only local
  diagnosis selected only those article records, not other browsing data or
  comment bodies. Current vectors use the same 384D model/extractor space and
  have similarity below the frozen 0.94 cutoff; both links are provisional.
  No raw vectors, article URLs/titles or pair-derived report are committed.
- The heuristic additionally requires the cutoff against every Topic member and
  a 0.04 margin over competing Topics. Existing URLs retain their Topic on
  revisit, even if their vectors change. Thus reloading cannot repair this split.
  Current vectors explain a present grouping barrier, not a reconstructed past
  decision: the service intentionally has no historical ingestion/vector ledger.
- Separate Sol Medium read-only review confirms a potential sampling weakness:
  the first eligible main/article region wins, including an enclosing main before
  its nested article. Visible generic teasers can occupy the bounded prefix.
  The head title is a label, not direct model input. Neither actual captured text
  nor event dates were verified; a site-specific extraction fault or same-event
  ground truth is not established. Raw sampled text is deliberately not retained.
- Restricted focused checks: four matcher regressions and 17 reader/embedding
  regressions pass. No product change, model run/download, backend request/write,
  Topic merge, comment move, browser-profile access or new permission. Attempts
  to open only the owner-supplied public pages with the research browser failed;
  no access-control bypass or product web-search feature was introduced.
- Next improvement direction: assess article-focused bounded input and calibrate
  the provisional policy against positive and confusing-negative cases. One
  reported similar pair is not sufficient to choose a global cutoff. The 6/6
  review stays complete; any later provenance-approved 200–250-pair task still
  needs approval. Existing manual Source-to-Topic correction is available for
  the immediate owner test and does not move existing comments.
- Owner further clarifies that opposing political framings must be able to share
  the same underlying event Topic, and suggests tightening with catalog growth.
  Recommendation: use measured quality and ambiguity among relevant candidates,
  not total Topic count, to govern caution. Adding unrelated Topics should not
  redefine an existing event. The current all-member minimum can only stay the
  same or decrease as members are added; simply tightening it could exclude
  diverse views. ADR-018 records the proposed retrieval/identity separation and
  its limits. No cutoff, grouping rule, payload, model or existing link changed.

## Completed owner feedback: local vector-processing assumption — 2026-09-29

- Owner explicitly directs assuming permission for the core local vector-matching
  experiment after the earlier question about freely readable pages with explicit
  reservations. The [ADR-018 amendment](../decisions/ADR-018-background-page-matching-local-poc.md)
  supersedes the proposed three-preview allowlist. Do not ask the same question
  again or mistake the working assumption for legal/store clearance.
- **0.6.5** removes only robots/googlebot/tdm-reservation parsing/veto from the
  current real-page reader, including negative/unknown/malformed declarations.
  No per-page advisory field, metadata egress or new retained state. Head/title
  bounds, visible main-region exclusions, focus/document fences, consent,
  permissions, exact payload and deletion remain unchanged. The frozen metadata-
  only experiment and legacy unsupported-reason projection remain unchanged.
- The English disclosure states the owner-only assumption. Already enabled sites
  remain enabled under this expressly requested amendment; new sites still need
  consent. No private-page capture, access-control bypass, automatic grant,
  external tester, provider, remote processing, download or publication approval.
- Verification: restricted suite **525/525**, normal suite **524 pass / one
  intentional guard-only skip**, indicator suite **343/343**. Separate Sol Medium
  Trust review accepts product/tests/docs and both harness changes; independently
  passes **86/86** focused checks. Secret scan: 140 files, zero findings.
- Actual Chrome 154 passes **32 eligibility/reader checks**: the existing 21 plus
  seven exact synthetic captures and four retained exclusions. Only owned DOM in
  a disposable profile was sampled using the packaged isolated-world reader via
  action access. Zero external requests, runtime exceptions, inference or model
  asset loads; no optional host grant, backend or owner profile/data access.
- The full matching smoke now expects metadata-bearing pages to ingest vectors
  without raw text, while forms remain excluded. It was syntax/code reviewed but
  **not rerun this slice**: port 4174 is occupied. The existing listener was neither
  used nor stopped. Earlier full-loop evidence remains historical, not a pass for
  this amended harness. No model acquisition or asset change was needed.
- Owner next step: reload **0.6.5**, reopen on the enabled public article and retry
  if needed. The metadata gate alone can no longer reject it, but other structural,
  identity or resource checks may. No backend restart or data reset. No claim of
  all-public-site support, legal permission or confirmed success on this article.

## Historical owner feedback: disabled site controls — 2026-09-29

The pending policy questions/proposals below are historical and superseded by the
explicit 0.6.5 local amendment above. Earlier test counts retain their dated scope.

- Latest owner direction: **all freely accessible pages should be allowed**.
  Treat this as the product coverage goal, not an unambiguous instruction to ignore
  explicit TDM/AI reservations or to grant sites automatically. Recommended split:
  documented Search-only directives do not by themselves prohibit local matching;
  explicit supported processing objections and unknown/malformed signals retain
  conservative handling. Clarify the explicit-objection case with one concrete
  example before implementation. No code or permission change this turn.
  Public URL syntax is not reliable public/private/authentication detection.
  [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md) records
  primary-source evidence and the unresolved policy boundary. The earlier narrow
  three-preview proposal is not silently recorded as exact package approval.
- Current owner evidence: **`rights-restricted`** on a public news article.
  This identifies the reader's head-metadata gate before main text is sampled,
  not a legal determination or proof of a paywall. Do not repeat Enable/focus
  diagnostics. The article could not be accessed with the research browser;
  its exact robots/googlebot/TDM value remains unverified. No bypass attempted.
- Read-only Sol Medium diagnosis reproduced **32 synthetic assertions** against
  the actual collector under the external-capability guard; existing reader tests
  pass **7/7**. `robots`/`googlebot` currently reject every token except `all`,
  `index`, `follow`, including `max-image-preview:large`, `max-snippet:-1` and
  `max-video-preview:-1`. Official Google documentation describes those as larger
  or unbounded Search previews, not extraction permission or a blanket reuse ban.
- Pending narrow policy correction: explicitly accept only those three additional
  documented preview declarations in the existing parser, with negative/unknown/
  empty/malformed values, mixed contradictory tags and TDM handling still denied.
  No broader denylist, per-site exception, permission, input, payload, model or
  retention change. See the [ADR proposal](../decisions/ADR-018-background-page-matching-local-poc.md).
  **Stop before implementation and ask for this exact owner policy approval.**
  This proposal may correct a false positive but does not establish the owner's
  exact page will pass. No product code, extension version or data changed.

- Previous owner report: the public site's origin is displayed and **Enable is
  clickable**, but its activation leaves "No eligible public main-region context".
  That generic report has now been superseded by the specific restriction code.
- Historical 0.6.4 implementation evidence follows.
- Confirmed code bug, independently reproduced with capability-denied mocks:
  null foreground published `unsupported/invalid-url` before any content read;
  a later status showed an eligible origin but never restarted matching.
  **0.6.4** reports `no-focused-page` accurately and schedules the existing fenced
  400 ms refresh only when fresh foreground, enabled preferences and selected
  origin agree and the prior failure has no tab/URL. Immediate invalidation means
  repeated polling cannot defer the refresh. Reader rejections never trigger it.
- The popup now displays allowlisted unsupported guidance and fixed diagnostic
  codes instead of claiming every failure means no main region. Unknown reasons
  are not echoed. Extraction, rights rules, the 500 ms focus bound, permissions,
  backend payloads and retention are unchanged. The owner's actual reason is not
  yet known; a confirmed generic recovery bug is not a confirmed site diagnosis.
- Full restricted suite **523/523**, indicator suite **341/341**; separate AI Trust
  review accepts the slice and independently passes **177/177** focused checks.
  Normal suite: 522 pass / one intentional guard-only skip. Secret scan: 140 files,
  zero findings. Actual Chrome 154 passes **21 eligibility
  checks**, now including stale foreground recovery without a browser event and
  the retained real host-permission gate. Only disposable synthetic preferences
  were seeded/removed. No external requests, exceptions, model loads, content
  capture or backend access. No owner browser/profile/service/data touched.
- Completed owner action: reload **0.6.4**, reopen on the enabled public article, and
  report the specific unsupported message/code if it remains. No backend restart,
  data reset or repeated owner-review task. Successful matching is still unconfirmed.
- Separate reproduced follow-up, not fixed by this slice: a transient failed
  `authorized()` observation after a successful read can leave `processing/reading`
  without recovery if no lifecycle event follows. It prevents ingestion but may
  strand the UI. Address with a separately tested cancellation/state transition;
  do not broaden this limited initial-foreground retry into repeated content reads.

- Previous owner report on 0.6.2: **context-unavailable** ("Chrome could not identify
  the current browser window"). This did not isolate a window failure: mock
  reproduction showed valid focused popups with loading/pending/incognito tabs,
  navigation and an expired focus witness could all produce that generic text.
  No particular one is yet established on the owner's browser.
- **0.6.3** separates missing/query-failed/changed windows, tab-query failures and
  identity changes, focus expiry/lifecycle changes and normal tab eligibility.
  Invalid initial tabs are classified before fallback revalidation; an invalid
  rechecked window stops before another tab query. Acceptance is equivalent or
  stricter; the 500 ms focus deadline, per-site consent and capture fences remain.
  Only fixed enums cross to the popup; no raw errors, logs, permissions or storage.
- Actual Chrome 154 passes **19 eligibility checks**, including four injected
  tab-query fault/recovery pairs with a real focused popup and simulated unfocused
  parent. No external requests, exceptions, inference, assets or backend access.
  Full restricted suite **484/484**, indicator suite **302/302**, separate AI
  Trust review's focused suite **109/109**. Normal suite: 483 pass / one intentional
  guard-only skip. Secret scan: 140 files, zero findings.
  These are regression results, not reproduction of the owner's OS/site failure.
- Previous owner action: reload to **0.6.3**, reopen on the public article and report
  the exact message still shown after a few seconds. Do not repeat the old focus
  instructions as a presumed fix. Keep the existing backend/data; no restart or
  reset is needed for this diagnosis. Owner success remains unconfirmed.

- Historical 0.6.2 follow-up and evidence:
- Follow-up: owner confirms **window-unfocused** while using the action popup.
  The extension must account for foreground interaction with its own focused
  popup, not equate the parent-window flag with all browser interaction. The
  0.6.2 correction is implemented: fresh bounded authenticated popup focus,
  visibility and parent-window checks; no positive focus cache or wider scope.
  Real Chrome 154 testing found popup port sender document IDs are optional and
  absent here; retain exact-ID validation when available, otherwise authenticate
  the live own-extension/exact-popup/no-tab port and trusted responder. The
  [ADR refinement](../decisions/ADR-018-background-page-matching-local-poc.md)
  states the exact package assumptions. Do not claim headful reproduction or
  owner success from an injected parent-focus flag in headless Chrome.
- Actual Chrome 154 passes all **11 eligibility/focus checks** after the fix,
  including the injected false parent flag with real popup focus, injected blur,
  focus restoration and wrong-window rejection. No external requests, runtime
  exceptions, model loads or backend access; temporary profile cleaned. The
  focused restricted suite passes 46/46 and the indicator suite 253/253; separate
  AI Trust review accepts the scoped correction. Full restricted suite 435/435;
  normal suite 434 pass / one intentional guard-only skip. Secret scan: 140 files, zero
  findings. The earlier 0.6.1 diagnostic commit is now committed and pushed.
- Previous owner action: reload to **0.6.2**, revisit the public article, reopen the
  popup and try Enable. Keep Developer mode enabled; the DevTools window is a
  separate thing. This is a tested handling of the reported focus condition,
  not confirmation that the owner's exact browser behavior is already resolved.

- The owner reports all four matching controls disabled with checked consent,
  first on an internal Chrome page and then on a public HTTPS article. The
  supplied HTTPS address passes the syntactic URL policy; article extraction
  happens later and cannot explain a missing eligible origin at this stage.
- A fresh-profile actual-Chrome probe confirms temporary action-popup access
  supplies the HTTPS URL to the worker before an optional host grant. Enable
  becomes available with consent on the owned synthetic article. This does not
  reproduce or establish the cause of the owner's public-site failure.
- Patch 0.6.1 exposes a bounded foreground-context reason beside Enable, clears
  stale site details on worker failure and replaces the misleading disabled
  wait cursor. Focus, active-tab, URL, completion, permission and consent gates
  remain unchanged; no wider capture, logging, persistence or permissions.
- Focused tests pass 45/45; complete restricted suite 399/399; normal suite
  passes with its intentional guard-only skip; indicator/client suite 217/217.
  Secret scan: 138 files, zero findings; 57 local documentation links resolve.
  Separate AI Trust review found no material defect. Actual Chrome 154 passes
  the seven-check HTTPS eligibility regression, including visible rejection
  guidance, disabled cursor and consent-before-grant behavior. One owned article
  and its favicon were fulfilled locally; no external requests, exceptions,
  inference contexts, model loads, service listener or owner data access.
- The 0.6.1 diagnostic request is complete: owner supplied `window-unfocused`.
  Do not repeat it or request tokens, storage dumps or private page material.

## New owner direction and next gate — 2026-09-29

- Owner answered **"approved"** to the complete ADR-018 package. Browser inference,
  bounded main-content extraction and backend ingestion/matching are assigned to
  separate Sol Medium agents; the lead owns integration, security review and QA.
- Owner approves connecting learned matching and asks for a testable real-page
  browsing loop with background vectors, durable backend grouping and comments
  shared across similar pages, allowing asynchronous resolution. Work should
  continue autonomously except at genuine approval/information boundaries.
- Owner explicitly reiterates parallel subagents. Two Sol Medium read-only
  inspections ran in parallel: browser/background implementation and Trust/data/
  matching review. The lead reconciled a single ADR-018 approval package and B1–B5
  plan, rather than another synthetic-only UI milestone or per-module interview.
- Approved scope: optional per-site background read/WASM permissions,
  public main-content sample, persisted URL/title/vector payload on this PC,
  deletion controls and fallible provisional automatic grouping. Private inboxes,
  off-device transfer, deployment and publication are excluded from this package.
- No new model download is inherently needed; approximately 150 MB of existing
  assets are now packaged locally. Actual browser WASM execution passed B1;
  cross-runtime/mobile parity remains unverified. The exact package
  has now been approved; the completed 6/6 review stays finished.
- Separate AI Trust review found the package coherent for one bundled approval
  request; sensitive URL rejection and complete matching-state deletion remain
  focused implementation checks. The earlier documentation-only preparation
  checked 55 local links and changed no product code; implemented evidence follows.

## ADR-018 implementation completed

- B1 packaged browser E5 is implemented and actually tested in Chrome
  154.0.8037.58: direct inference plus background -> offscreen -> dedicated worker,
  finite normalized 384D outputs, zero external extension requests and zero
  runtime exceptions. Cold direct run about 3.6 seconds; three worker samples
  about 1.3 seconds combined. These are one-PC mechanics, not mobile benchmarks
  or quality validation. The browser space stays distinct from Node.
- Nine pinned assets copied locally (149,832,250 bytes); experiment plus extension
  footprint 1,614,594,675 bytes, below 2 GiB. No new acquisition. Generated assets
  remain ignored; redistribution/license/store approval is not implied.
- B2 main-region capture, document attestation, default-off site preferences,
  foreground coordinator and cancellable inference are implemented. Separate
  Trust review found and verified fixes for delayed pause/revocation writes,
  stale enable-after-pause, unbounded queued text and 401 pairing cleanup.
- B3 ingestion, conservative provisional grouping, persistent current vectors,
  correction/forget/delete/clear are implemented. Service tests 67/67 passed at
  this checkpoint; client ingestion checks pass without raw-body or score DTOs.
- B4 delayed popup resolution and controls are implemented. Review identified
  and verified fixes for orphan learned-Topic deletion visibility and keyboard
  focus across polling; focused UI/client tests passed. Final UI hardening also
  preserves dropdown options and clears destructive confirmations on context
  changes. Full spike restricted suite passes 396/396; indicator checks 214/214.
  No remaining material issue in the separate
  AI Trust review; this is not independent-human/legal/store certification.
- B5 passed all 14 real-Chrome checks: popup-closed inference, two paraphrased pages
  sharing a Topic/comment, unrelated page separation, Pause/Resume, rights/form
  rejection, SQLite restart/new pairing, correction preserving old comments,
  Forget, confirmed deletion/clear and site removal. Four 384D vectors, six owned
  intercepted documents, zero raw-text API payloads, external extension requests
  or runtime exceptions; latest full run about 11.7 seconds. Original S3 browser
  smoke also passed its 19 categories. Temporary profiles/databases/listeners
  were cleaned; no existing owner data was touched. The owner stopped their
  preexisting listener with Ctrl+C to free port 4174; transport tests passed 2/2.
- [Implementation review and retained limits](../research/ADR018_IMPLEMENTATION_REVIEW_2026-09-29.md)
  records evidence. Real HTTPS optional-permission prompts and matching accuracy
  on owner-selected websites remain owner testing, not results inferred from
  intercepted fixtures. No new approval is needed for the already-approved scope.
- Final normal suite: 396 tests, 395 pass and the intentional restricted-guard
  skip. Both secret scans found zero findings (137 spike / 48 service files);
  all 67 checked local documentation links resolve and `git diff --check` passes.

| Capability | Actual state |
| --- | --- |
| Exact URL/fingerprint resolution | Implemented on synthetic fixtures; not semantic similarity |
| Chromium URL lookup | Bundled example.com/example.org mappings only |
| Metadata capture | Controlled loopback fixture and one pinned MDN route only; explicit button, no body/egress/storage |
| Review/evaluation tooling | Implemented mechanics; no real larger corpus or held-out model results |
| Synthetic owner review | Finished: 6/6. Do not repeat |
| Related-page discovery | Service ranks retained compatible learned Sources; fixture recommendations remain separately labelled; no web search |
| Discussions and replies | Local human Topic create/select, roots/replies/edit/withdraw implemented in service and extension; no private/AI/moderation controls yet |
| Local persistence | Memory and SQLite adapters; app DB ignored. Pairing token only in trusted session storage; drafts only popup memory |
| Current-tab auto-load | Paired popup loads catalog and delayed selected-site page resolution; older reserved-domain fixture lookup remains when matching is off |
| Learned embeddings/general same-Topic matching | Browser E5 + bounded main-region extraction and local provisional grouping implemented; actual shared-comment and lifecycle smoke passed; no validated production AUTO |
| AI handoff/import/provider | Planned; no inference or real credentials |
| Local backend | S1–S3 fixed loopback service, SQLite, session-paired thin client; actual socket and Chrome checks pass |
| Real accounts/mobile/hosting/stores | Not implemented, deployed or submitted |

## Local embedding experiment completed 2026-09-29

- Frozen corpus/scoring committed and pushed at `821baf7` before inference.
  Measured lexical, full/sliced float32 static controls, two compact int8 packs
  and E5. Source assets, derivative packs, vectors and reports stay ignored/local.
- Model/runtime archives were pinned and byte-verified. Offline installation
  disabled every lifecycle script; the CPU runner disables JavaScript network,
  DNS and subprocess APIs. No service listener, extension change, new permission,
  real-page input, upload, search or provider was activated.
- Acquisition accounting: 802,637,843 bytes including a 64 MiB metadata/HTTP reserve;
  measured full workspace footprint about 1.47 GB, below 1 GiB transfer / 2 GiB
  installed caps. This is a development workspace, not an end-user app size.
- Lead review favors E5 as the contextual quality reference for the next bounded
  on-device prototype; the compact static model remains a size alternative.
  Neither supports automatic Topic joins based on this smoke test. English and
  cross-language metrics, difficult distinctions, no-match diagnostics, CPU and
  whole-process memory are recorded separately in ignored reports. No global
  language-quality, mobile runtime or production-model selection claim.
- Focused checks 54/54; actual-asset integration 4/4; existing service regressions
  51/51. Spike normal/restricted/indicator suites pass (normal retains its one
  intentional guard-only skip); both secret scans report zero findings. No new
  listener or browser smoke was needed for this isolated CLI-only increment.
  The experiment remained isolated from the then-fixture-only interactive app.
- Its next step was the owner-reviewed browser/device packaging and interactive
  input plan, now approved and implemented as ADR-018 above.
  The completed 6/6 task and later provenance-approved R5 review remain untouched.
- Separate AI review returned qualified accept of the acquisition/runtime and
  evidence interpretation. A final review finding was corrected and regression-
  tested: a missing ledger-recorded artifact now stops before any new request.
  This review is not independent-human, legal or store certification. All 56
  checked current-document links resolve; `git diff --check` passes.

Earlier approval/research chronology:

- Owner answered **"approved"** to the revised ADR-017 package. Begin the bounded
  local compact-static/E5 experiment; preserve source/derived-data locality,
  1 GiB download / 2 GiB installed caps and all later gates.
- Lead owns acquisition/dependency review/integration; GPT-6 Sol Medium agents
  receive bounded non-overlapping encoder and fixture/evaluation tasks. No
  repeated Phase 0 or 6/6 owner review. Earlier research evidence follows.
- Prepared the frozen 64-descriptor corpus/evaluator and bounded static-table
  parser/quantizer. Initial focused offline tests: 33/33 pass. Acquisition review
  requires concurrency, path and cumulative metadata-limit corrections before
  model downloads. No model inference has run. Runtime lock generation fetched
  registry metadata only, with installation scripts disabled.

- Researched official model cards, licenses, artifact sizes and runtime releases.
  The first Granite/E5 shortlist is superseded by a size-focused comparison:
  compact multilingual static variants versus E5-small and a lexical baseline.
- [Research and options](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md) and
  [approved exact package](../decisions/ADR-017-local-embedding-experiment.md)
  describe revised assets/runtime, download bounds, 64 synthetic multilingual descriptors,
  local-only inference, retained local artifacts and later review gates.
- Owner clarified global scope with English the first priority. Preserve one
  compatible multilingual space across users/platforms; unrelated language
  models are not interchangeable. [Size-focused research](../research/SMALL_EMBEDDING_FOOTPRINT_2026-09-29.md)
  distinguishes English-only tiny models, estimated 16.5/30.1 MB static packs,
  contextual-model footprints and unsupported zero-download native shortcuts.
  No compact pack is built or quality-tested; small size alone cannot choose it.
- The revised comparison needs approximately 572 MB of source assets before
  dependencies, still capped at 1 GiB download / 2 GiB installed for development.
  End users would receive one selected pack, not the whole experiment or Node.
- The owner's privacy question prompted an explicit deployment distinction:
  today's PC-local process is on-device; future hosting must not silently move
  raw-content processing there. Separate local derivation from remote matching;
  sensitive vector transfer still requires its own approval (ADR-013).
- Read-only code review and synthetic 384/768/1,024-dimensional ranker/state
  probes passed. This is structural compatibility only, not actual model quality,
  speed, memory use or browser/mobile inference evidence.
- No model/package installation, inference, listener, real-page capture or new
  permission. Product suites were not rerun for this research/documentation work.
  This describes the earlier research stage; the owner has now approved the
  bounded package above. S4 and expanded inputs remain unapproved.
- Earlier documentation checks: `git diff --check` passed; all 47 local Markdown
  links across five documents resolved before the size/global-language revision.
- Earlier separate AI Trust/architecture review returned qualified ACCEPT of that proposal;
  clarified total-token accounting and public-catalog local matching. This is not
  owner activation approval, a dependency audit or independent legal/store review.
- A bounded platform investigation found no documented common built-in embedding
  space across Chrome/Android/iOS. Native APIs do not remove model compatibility
  or download concerns; extension model-data delivery/CSP still needs exact review.
- Revised documentation checks: `git diff --check` passes; all 53 local Markdown
  links across six documents resolve. Size arithmetic and the 64-item language
  allocation were independently checked. Separate AI Trust/architecture review
  found no blocker; clarified vector-space identity versus runtime provenance,
  retaining parity certification before cross-platform comparisons. No model ran.

## Reassessment completed 2026-09-27–28

- Audited code against documentation and ran the current suites. Preserved
  completed experiment evidence without claiming product readiness.
- Recorded provider-neutral matching without a crawler, content-kind-aware
  Topic granularity, optional local embeddings and user-confirmed associations.
- Researched official AI-host connectors and manual handoff for subscription
  users without API keys. No provider integration or subscription proxy built.
- Corrected mobile policy requirements: personal user blocking, reports and
  moderated public UGC; selected private AI-output reporting without broad
  moderator access. Qualified retention, account-rights and appeal claims.
- Replaced the per-module approval sequence with a bounded local envelope and
  explicit meaningful external/data gates. Preserved old records as history.
- Implemented metadata lifecycle invalidation for the post-attestation same-URL
  reload race. Pending and resolved snapshots clear on source-tab changes;
  listeners are removed on reset/retry/disposal. No new permissions or capture.
  Code commit: `f8947a2`.

Research: `research/PRODUCT_RESET_2026-09-27.md` and
`research/PRODUCT_RESET_POLICY_2026-09-27.md`. Decision: ADR-014.

## Related-source increment completed 2026-09-28

- Owner accepted personal utility before community volume and proposed related
  pages as a standalone reason to use the app. ADR-015 prioritizes early real
  embeddings and source discovery alongside R1; no fake populated forum.
- Implemented a bounded browser-neutral candidate ranker, deterministic duplicate
  handling and strict model/dimension compatibility. Similarity never assigns a
  Topic. Existing same-Topic associations and related reading render separately.
- Added an English message pack and an isolated zero-post demo panel. Six bundled
  synthetic Sources have explicitly hand-authored vectors, not learned embeddings.
  No source-tab observation, network, storage or additional permission enters it.
- Researched provider-independent known-source ranking, ordinary-search handoff,
  Brave/Exa pricing and reuse restrictions, and Common Crawl tradeoffs. No provider
  selected; no API request, download, paid account or external integration made.
- Follow-up research covers recurring Brave/Tavily/Parallel free allowances and
  on-visit background lookup feasibility. Neither a provider nor passive browsing
  observation is approved or activated by the owner's feasibility question.
- Updated only generated unit-test digest snapshots for the expanded provenance
  manifest. The actual owner ledger and its completed 6/6 task are untouched.

Evidence: `research/RELATED_PAGE_DISCOVERY_2026-09-28.md`; ADR-015.

## Service-first orchestration completed 2026-09-28

- Owner deferred external search and requested a cheaper-model implementation
  handoff with explicit return-to-GPT-6-Astra checkpoints.
- Owner requested embeddings, linked pages and application state on a local
  server now to simplify later hosting. ADR-016 supersedes the canonical
  extension IndexedDB plan: one Node service, replaceable repository/embedding
  adapters, SQLite locally, versioned API and a thin extension client.
- [IMPLEMENTATION_HANDOFF](IMPLEMENTATION_HANDOFF.md) froze the now-completed S1/S2 block:
  pure domain/catalog, memory/SQLite repository and secured in-process handler.
  No listener, new extension permission, model asset or real input is activated.
- The first stop was Astra review and explicit owner approval of the exact
  loopback/pairing/permissions/payload/retention package before S3 integration.
  Both checkpoints are now complete; see the S3 approval record below.
  Later model, data, provider and deployment gates remain explicit. Returning to
  Astra is a review checkpoint, never a substitute for owner approval.
- Checked Node 24.19.0 and an in-memory `node:sqlite` probe (SQLite 3.53.3).
  No disk database or socket was created. The built-in module has release-candidate
  stability; the adapter isolates it and hosting requires revalidation.

The orchestration-only baseline was `9e48916`; S1 was committed as `324163e`.

## Local-service S1/S2 completed 2026-09-28

- Added `apps/local-service` with no external dependencies. Its pure domain owns
  separate Sources, confirmed Source links, Topics, Discussions and Contributions.
  The catalog reuses six project-created fixtures and the existing pure ranker;
  vectors remain labelled hand-authored demo coordinates, not learned embeddings.
- Implemented create Topic, human root/reply/edit/withdraw, grouped deterministic
  views, ownership checks, revision purge on withdrawal, synthetic actor registry,
  resource bounds and generation/revision compare-and-swap. Related suggestions
  never create Topic links; API DTOs expose neither vectors nor similarity scores.
- Added interchangeable memory and built-in `node:sqlite` repositories. SQLite
  uses prepared statements, transactions and one bounded `demo-state/v1` record.
  Reopen, concurrent stale writes, rollback, reset, unknown schema, malformed and
  structurally manipulated state are covered. Logical deletion is not claimed as
  forensic erasure; unknown/corrupt databases are never silently overwritten.
- Added a transport-neutral `/v1` handler and dormant composition point. Exact
  Host and bearer are mandatory; supplied Origin must match, preflight is narrow,
  request/response shapes and sizes are bounded, errors are generic, and arbitrary
  URL/path/model/provider operations do not exist. The handler was tested only
  in-process under the existing socket/DNS/fetch/subprocess denial harness.
- No HTTP server implementation or `.listen()` call exists. `test:integration`
  is an intentional failing approval gate. No extension file/permission, real
  page input, model asset, external request or disk database in the repository
  was added. At completion the stop was Astra/Trust review plus explicit ADR-016
  owner approval; both are now complete, as recorded below.

## S3 owner approval recorded 2026-09-28

- After the corrected S1/S2 review, the owner answered **"ja"** to the explicit
  local-connection approval request. The exact approved package is in ADR-016:
  `127.0.0.1:4174`, random manual pairing in trusted `storage.session`, narrow
  loopback/storage permissions and exact-port CSP, synthetic IDs/actors and
  deliberate demo contributions retained in the local DB until manual deletion.
  Loopback and browser integration tests are included. No cloud, cost, real
  captured page data or model acquisition is authorized by this approval.
- The next cheaper-model block is S3: listener, pairing, thin extension and
  human discussion UI. Do not repeat the same owner approval or completed 6/6
  review. The handoff provides S3a/b/c increments and the next Astra checkpoint.
- That approval-recording continuation changed documentation only. Its baseline was
  `818dd6e`; it had no listener, connected client or new permission.
  New transport/permission changes need focused Trust/Quality review and actual
  loopback/browser evidence. Return to Astra after S3, or earlier if an unresolved
  architecture/security issue or a new approval boundary is reached.

## Verification and residuals

S3 execution started (2026-09-28): the owner selected GPT-6 Sol Medium coding
subagents with Astra orchestration/review in the same conversation. Independent
transport, client-adapter and UI slices have explicit file owners. The lead owns
integration/security review, shared documentation and verified commits; manual
model-switch handoffs are no longer required. No wider capability is authorized.

S3a completed and reviewed (2026-09-28): fixed `127.0.0.1:4174` transport, manual
terminal-only random pairing token, random persistent IDs, bounded raw headers/
stream/deadlines, shutdown and separate local integration guard. The six Harbor
Sources are unchanged; two explicitly project-created reserved-domain Sources
bridge the old URL fixture IDs to a separate shared Topic, with null embeddings.
Pre-bridge databases stay unchanged until deliberate reset. Service tests:
51/51 offline; 2/2 actual loopback integration; secret scan 30 files, zero findings,
six self-tests. The lead reproduced the socket suite after transport review;
all test listeners are closed. S3b/c and real-browser evidence follows below.
Details: [S3 implementation review](../research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md).

S3b/c completed and accepted (2026-09-28): extension 0.5.0 is a session-paired
thin client with automatic fixture-only lookup, Topic create/select, human roots,
replies, edit/withdraw/reset and service-ranked related Sources. English message
keys, inert rendering and actual human/AI counts are separate from old diagnostic
fixtures. Drafts remain memory-only; navigation detaches rather than retargets
them. Focused review corrected async pairing/lifecycle races and keeps writes
blocked after uncertain outcomes until a fresh service reload. A separate
read-only Trust pass accepts the corrected scope, not production security.

Final lead-reproduced verification after all corrections:

- Spike: 330 normal tests (329 pass, one expected skip), 330/330 restricted,
  148/148 indicator. Service: 51/51 offline, 2/2 actual loopback.
- Actual Chrome 153.0.8010.53: PASS across 19 UI/integration categories, including
  pairing, service Source ranking, CRUD/reopen/restart, shared fixture Topic,
  inert markup, keyboard and session-only storage. Zero JavaScript exceptions or
  unapproved extension requests observed. Two reserved-domain pages were served
  entirely from intercepted project-created HTML, not fetched from real websites.
- Secret scans: 113 spike files and 30 service files; zero findings, six scanner
  self-tests each. Syntax/inventory/capability checks and `git diff --check` pass.
- Test-owned profiles/databases/listeners are cleaned up; no demo service is left
  running. The interactive CLI token is shown only in the user's own terminal.
- S3a is committed as `9bfe9d5`. The S3b/c completion commit contains this record;
  inspect git history for its hash. README/startup and active decisions agree.
- Separate documentation consistency review found and corrected a stale blanket
  server STOP line; only ADR-016's already approved fixed-loopback exception is
  permitted. All later expansion gates remain. No completed review was repeated.

S3 completion is the current stop: no R2 model acquisition or S4 activation yet.
The exact model/runtime/license/assets/input proposal is now prepared in ADR-017
and awaits the owner. No manual model switch or independent human reviewer is
needed now.

Historical S3 approval/handoff documentation checks (2026-09-28): `git diff --check` passes;
all 41 local Markdown links across the 12 changed documents resolve. Approval,
implemented capability and later gates were reconciled across active documents.
No product tests, loopback listener or browser smoke were run for this docs-only
continuation; the S1/S2 results below remain the last executed code evidence.

Astra/Trust review of S1/S2 (2026-09-28): qualified ACCEPT of the corrected offline
core; the owner subsequently approved ADR-016's local S3 activation package. The
[review record](../research/S1_S2_REVIEW_2026-09-28.md) lists reproduced failures,
fixes and the concrete S3 transport/client requirements.

- Fixed multiline bodies, write-before-response overflow, repository successor/
  reset version checks, non-atomic initial database creation and full-state
  application mutation returns. Memory and SQLite share these contract checks.
- Service suite: 39/39 pass; secret scan: 25 files, zero findings, six self-tests.
  The prior 28-test result below describes the implementation before this review.
- Existing extension/spike code is unchanged; no fresh browser/loopback claim.
  The review accepts the offline core only. New S3 transport and
  permissions still need their focused checks/review during S3 implementation.

Documentation-only service handoff checks (2026-09-28):

- `git diff --check` passes; all 37 local Markdown links across 16 changed/new
  documents resolve. No product test rerun is claimed for this documentation change.
- Separate AI Trust/Quality review returns qualified ACCEPT after correcting
  missing-Origin handling and requiring the existing network-denial harness for
  service tests. ADR-016, handoff and active documents agree on placement and gates.
  This accepts the plan, not service security, durability, browser interoperability,
  learned matching or store readiness. The later implementation evidence follows.

S1/S2 implementation checks (2026-09-28):

- Local service `npm test`: 28/28 pass under the external-capability denial harness.
- Local service `npm run check:secrets`: 22 files, zero findings, six scanner self-tests.
- Existing spike `npm test`: 294 total, 293 pass and one expected restricted-only skip.
- Existing spike `npm run test:restricted`: 294/294 pass.
- Existing spike `npm run indicator:test`: 112/112 pass.
- Existing spike `npm run check:secrets`: 101 files, zero findings, six self-tests.
- Syntax checks pass for every local-service JavaScript file; `git diff --check`
  passes. No loopback integration or browser smoke was run because S3 is gated.

2026-09-28 post-discovery-increment checks:

- `npm test`: 294 tests, 293 pass, one expected restricted-harness-only skip.
- `npm run test:restricted`: 294/294 pass.
- `npm run indicator:test`: 112/112 pass (overlaps the full suite).
- `npm run check:secrets`: 101 package files, zero findings, six scanner self-tests.
- Separate AI Trust/Quality review accepts the bounded navigation correction.
  This is not independent-human, legal or store approval.
- Separate AI Trust/Quality review accepts the isolated related-page demo after
  correcting the stale synthetic digest expectations. No live discovery or
  learned-embedding usefulness is claimed. Real-browser panel smoke is pending.
- Cross-document review found a conflicting blanket ban on private-draft
  persistence. It is corrected: local demo drafts may persist as scoped, while
  credentials and automatically captured source context may not. Active links
  and local/external approval boundaries were checked; the reviewer verified
  the correction and returned qualified ACCEPT with no remaining doc blocker.
- Follow-up ADR-015/current-document review accepts the implemented/planned
  distinctions and retained gates; all 23 checked local Markdown links resolve.

The new lifecycle wiring has automated mocked-browser/race coverage, but no
fresh real-Chromium smoke yet. Earlier owner smoke remains complete for its old
version; it does not cover this change. Event delivery is asynchronous, not an
atomic guarantee of DOM freshness; any source-tab update conservatively clears
the metadata and may require retry. The MDN experiment expires on 2026-10-23.

## Next work and authority

R0 reassessment/hardening and documentation reconciliation are complete.
R2's first fixture-only related-source increment and R1 handoff S1–S3 are complete.
Astra review and explicit owner approval of ADR-016's exact activation package
are complete. The listener and paired extension loop are implemented and locally
tested; do not repeat S3 or its unchanged approval. Keep the default offline guard.
Synthetic identity is a testing device, not real login/security isolation.

The owner approved the first bounded embedding experiment in ADR-017 on
2026-09-29; that package is now implemented and measured. The lead handles the
review here, without a manual model switch. ADR-018 separately approved the exact
public selected-site browser inference and local URL/title/vector retention
package; its implementation and tests are recorded above. Broader private inputs,
off-device transfer and new model assets remain gated. External search is deferred.
Provider/data egress, real accounts/testers, deployment, purchases, public posts,
recruitment and store submission each retain explicit applicable approvals.

The 200–250-pair provenance-approved review is deferred to R5. Stop and ask before
acquisition/review becomes required; give the owner a concrete assignment for an
independent person then. No independent person is needed for the next local code
increment. Completed synthetic labeling is not real-world accuracy evidence.

## Important decision status

- ADR-014: active sequencing and local engineering envelope.
- ADR-015: related pages as first-user utility, early embeddings, provider-neutral
  discovery with explicit coverage/rights/cost limits; no provider activated.
- ADR-016: active local-service-first architecture; S1/S2 reviewed, exact local
  S3 activation package owner-approved; listener/client/UI implemented. Supersedes IndexedDB
  placement; no wider data/network permission follows from the approval.
- ADR-017: bounded synthetic-only local comparison completed;
  no interactive model activation or real inputs. Hosting does not inherit
  permission for raw content or vectors.
- ADR-018: exact owner-local real-page background matching package approved on
  2026-09-29; B1–B5 implemented and Chrome-tested, no wider private/remote/release scope.
- ADR-001/004: frozen baseline/editorial evaluation evidence; unchanged.
- ADR-009: NO-AUTO remains for production/shared resolution; ADR-018 supersedes
  it only for the approved fallible owner-local provisional grouping experiment.
- ADR-010/011: existing exact URL/metadata boundaries unchanged by this reset.
- ADR-012: prior design retained with policy corrections; exhaustive lifecycle
  features are phased with actual capabilities, not all prerequisites for R1.
- ADR-013: sensitive body-derived matching remains separately gated; local
  transformation does not establish anonymity, website rights or store approval.
- ADR-003/005: backend/correction candidates, not deployed infrastructure or
  permission for global merges.

During ADR-018 preparation, no additional data/model acquisition, provider call,
spending, deployment, announcement, store submission or public discussion
occurred. The earlier approved ADR-017 model/runtime acquisition is recorded above.

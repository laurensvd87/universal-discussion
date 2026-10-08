# Project status

Updated: 2026-10-08. Active direction: ADR-014/015/016 and the product-first roadmap.
ADR-017's synthetic-only local experiment is implemented and measured. The owner
now requests the real-page background -> vector -> local Topic -> shared-comment
loop. [ADR-018](../decisions/ADR-018-background-page-matching-local-poc.md) records
the exact expanded Security/Privacy/Policy package explicitly approved by the
owner on 2026-09-29. **B1–B5 are implemented and verified in actual Chrome**.
ADR-019 B replaced their site-by-site enablement with an explicitly approved
window-scoped session in **0.7.0**; the later owner-local build auto-starts a
new session only when saved pairing, HTTPS access, service health and an
eligible focused window are present. Current verification
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

**2026-10-08 real multilingual research gate and first result:** The owner
approved [ADR-065](../decisions/ADR-065-local-multilingual-corpus-research.md)
for local-only offline evaluation of GlobeSumm, not publication, provider
transfer, product training or publisher-rights clearance. The 14,972,999-byte
JSONL corpus is in a private Temp directory outside Git (SHA-256 in ADR-065).
The content-free adapter structurally checked 370 events/4,687 articles in
26 languages and deterministically scored 1,192 articles in 96 whole events;
3,495 articles/274 events were marked unscored due a test compute budget,
not a Topic-size cap. The offline E5 title+lead/complete-link-0.94 baseline
joined only **14/7,049** same-event pairs and one different-event pair,
leaving 1,177 groups. One cross-event exact duplicate suggests a gold-label
overlap, so the lone false pair needs careful interpretation. Viewpoint and
precise adjacent-event gold are absent. This is strong evidence against the
baseline's multilingual usefulness, not evidence that a replacement is safe.
The first same-event partner ranked in the top three for 1,141/1,192 scored
articles, so candidate retrieval is promising; top three is diagnostic, not
a fixed Source/Topic limit or a join rule. Aggregate details are in the
[private-corpus evaluation result](../apps/local-service/experiments/topic-encoder/real-event-eval/RESULTS.md).
No live matcher, saved Topic, discussion or extension asset changed.

**First train-only real-pair follow-up:** An isolated regularized pair
classifier trained on 749 selected reports and scored 150 event-disjoint
validation reports. It admitted 20/803 true pairs and zero of 10,372 false
pairs, versus 0/803 true for cosine-0.94 on that slice. Another 293 selected
test reports remain untouched. Pair recall is only 2.5%, so this is not a
usable Topic matcher and was not activated. No learned weight was saved or
shipped. A train-only contrastive projection is the next offline hypothesis;
fresh independent validation and rights clearance remain necessary.

**2026-10-08 related-discussion visibility (extension 0.13.27):** A read-only
popup bug hid useful conversations when the first four related Topics were
empty. The popup now reads candidates in four-request batches until four
nonempty cards are found or the existing related-result list is exhausted.
Failures of an optional related read do not hide later candidates; stale
navigation/version responses cannot attach old cards. The primary Topic and
post routing are unchanged. The 49 focused controller tests, 744 indicator
tests and 1,039 restricted tests pass; the secret scan found zero issues in
183 files. This reduces empty-forum presentation but is not broader related
retrieval or a new matcher.

We have a tested local service and a usable on-device semantic discussion prototype.
The core product hypotheses—semantic concentration, personal AI utility and
community adoption—remain unvalidated. Stop expanding review infrastructure.
The requested browsing -> local embedding -> provisional Topic -> shared-comment
loop is built. Next gather owner feedback within the approved scope; broader
private/remote/other-provider/moderation work and all external release gates remain separate.

## 2026-10-08 precision-first Topic matching research (ADR-064)

The owner clarified that a missed automatic match is preferable to a false
match. The current catalog-wide 0.04 neighbor lead does not scale with a large
catalog, but deleting it alone makes an adjacent-event false join. A new
offline, source-record-only benchmark now scores whole Topic partitions,
opposing-view pairs, same-entity/different-event negatives, unmatched pages,
input order and catalog growth. It does not alter the live matcher or owner DB.

The live baseline joined 0/84, 0/24, 0/24 and 0/48 true pairs across the
frozen Luna train/validation/test/challenge splits, with no false joins. All
48 challenge positives were above the live 0.90 vector floor; 22/1,492
different-Topic pairs were too. A first explicit title-cue candidate also
joined 0/24 validation positives with no false joins. A less strict group-local
cue candidate joined 15/24, but made four false pair joins by conflating a
vehicle's navigation-software issue with a charging-port issue. It fails the
owner's precision-first requirement and remains inactive. Its held-out
test/challenge have not been scored. Details and exact reproduction commands
are in the [offline benchmark](../apps/local-service/experiments/topic-encoder/topic-benchmark/README.md)
and [candidate report](../apps/local-service/experiments/topic-encoder/topic-method/README.md).

The design direction is a bounded same-event evidence graph for primary Topics
and a separate related-page/discussion overlay for ambiguous neighbors. Shared
brand, actor or embedding closeness is candidate evidence, not proof of same
event. The owner additionally rejects a static global catalog-size limit:
decision evidence should adapt to *competing developments in a local
neighborhood*, while a crowd of reports about one event should strengthen,
not veto, it. Related discussions can reduce empty-forum UX without falsely
merging the primary Topic. No second retained vector, historical migration,
live regrouping or release is authorized by this research. The precision-first
retained-data candidate has been frozen and scored; no production acceptance
claim follows from synthetic labels alone.

An [ephemeral title/lead shadow](../apps/local-service/experiments/topic-encoder/topic-focus-shadow/README.md)
compared a second locally computed E5 vector, made from the title plus 384
lead characters, on train/validation only. Plain 0.90 complete-link got
24/24 validation true pairs but made 12 same-entity false joins on training.
A train-zero-false lexical/product/action gate cut validation recall to 9/24
with zero false joins there and on training; adding the body vector did not
help. This is an English synthetic diagnostic, not a production method. The
focus vector and lead terms were not saved, and the held-out article texts
were not used to tune this experiment.

**Frozen holdout result:** The retained-data V3 candidate joined 7/24 true
Luna test pairs and 6/48 opposing-view challenge pairs, with zero false
joins in those invented sets. The ephemeral focus/facet candidate joined
10/24 and 33/48 respectively, also zero false. Both kept all test/challenge
singleton no-match pages separate. A separately authored 24-page, four-family
multilingual challenge exposed a major gap: both candidates joined **0/24**
same-development translated pairs (zero false). Yet focus E5 ranked a true
partner first for 22/24 articles and both true partners first/second for
21/24; the admission logic, not just retrieval, needs multilingual work.
Body E5 ranked a true partner first for 15/24 and had three wrong reciprocal
first-neighbor pairs. These are small synthetic labels, not a real-web
precision guarantee. See the [one-shot report](../apps/local-service/experiments/topic-encoder/topic-benchmark/RESULTS.md).
The scored holdouts are no longer available for tuning those frozen methods.
A second independently authored multilingual challenge was frozen for the
later method below. No live matcher activation, owner-data regrouping or
second retained vector follows from this checkpoint.

**Later same-day check:** The new focus graph v4 was frozen before a fresh
48-page multilingual challenge was scored. It found 44/48 English Luna
challenge true pairs with zero false joins, but **0/72** translated true
pairs on that fresh set (zero false). Its authoring agent corrected the
new corpus to genuinely English/Dutch/German/French/Spanish articles before
freezing it and never saw the matching code/results. Focus E5 still placed a
correct partner in the top three for 46/48 multilingual articles; the
admission logic remains the bottleneck. A hash-pinned real-language CDEC-WN
storyline proxy gave 33/54 same-storyline joins and zero cross-storyline
joins, but it is single-publisher and not atomic discussion Topic gold.
Moreover, v4's triangle rule still compares against any outside page, so it
can recreate the scaling failure for dense crowds. It remains **offline and
unapproved**. All results and commands are in the [report](../apps/local-service/experiments/topic-encoder/topic-benchmark/RESULTS.md).

**Count-independent grouping research checkpoint (ADR-064, offline only):**
The new five-language development corpus contains 120 invented articles over
24 developments with entity families separated between train and validation.
An independent 60-article, five-language v3 challenge is hash-frozen and has
not been used for tuning or scoring. [V5](../apps/local-service/experiments/topic-encoder/topic-event-v5/README.md)
made 21/80 true pair joins and zero false joins on multilingual validation,
but its reciprocal top-three seed and complete-link split 20 varied reports
of one event into ten groups. [V6](../apps/local-service/experiments/topic-encoder/topic-event-v6/README.md)
removed the fixed group/exemplar count: 100 gradually varied same-event
reports stayed together beside three adjacent-event reports, with no mix.
However two weaker true reports stayed separate (100+2), and multilingual
validation was unchanged at 21/80 true, zero false, with zero complete gold
Topics recovered. Its 100-page synthetic run took about 0.3 seconds here,
but it still materializes all Source pairs and repeatedly rescans groups.
Neither method is live, scalable to a large catalog or validated on
cross-publisher real web pages. The next offline experiment targets unseeded
cross-language evidence and competing event hypotheses. Do not change the
owner database, retain another representation or infer an activation approval.

**Follow-up offline checks:** [V7](../apps/local-service/experiments/topic-encoder/topic-event-v7/README.md)
eliminated the fixed seed count and held a 102-report synthetic event
together without adjacent mixing, but joined 0/80 translated true pairs in
multilingual validation. An attempted shared-anchor bridge made false joins
and was removed. A [small learned diagonal metric](../apps/local-service/experiments/topic-encoder/multilingual-metric-v1/README.md)
did not improve E5: both rank a true partner first for 38/40 multilingual
validation articles and admit only 1/80 true pairs at a train-zero-false
cutoff. An [offline exact retrieval cursor](../apps/local-service/experiments/topic-encoder/expandable-retrieval/README.md)
returns expandable ranked batches; work-budget exhaustion is unresolved, not
a singleton. Six focused tests, including a 137-report crowd and exact
brute-force rank comparison, passed. The favorable 5,000-item speed check
used unrealistic two-active-coordinate vectors and is not a production
latency claim. None of these experiments changes the app. Stronger training
data and event-specific cross-language evidence remain necessary; the
independent v3 multilingual holdout remains sealed.
A stronger [rank-eight learned projection](../apps/local-service/experiments/topic-encoder/multilingual-projection-v2/README.md)
raised multilingual validation admission from 1/80 to 31/80 true pairs, but
also made six adjacent-event false pair admissions; it is frozen and rejected
for live use. All settings/cutoffs came from train, not that validation.
An independently authored [v2 synthetic corpus](../apps/local-service/experiments/topic-encoder/multilingual-train-v2/README.md)
is now hash-frozen before the next projection score: 180 original short
reports, 36 precise developments, five languages, with eight training and
four disjoint validation entity families. Its corpus-only integrity check
passes. These author labels are not real-web accuracy evidence.

**Post-freeze v2 validation:** The [hard-negative rank-eight projection](../apps/local-service/experiments/topic-encoder/multilingual-projection-v3/README.md)
joined 0/120 true and 0/1,650 false pairs among 60 fresh multilingual
articles; the prior v2 projection joined 9/120 true and zero false there,
but had made six false adjacent-event joins on earlier v1 validation. A
separate [two-view pair classifier](../apps/local-service/experiments/topic-encoder/multilingual-pair-v4/README.md),
frozen before that same fresh slice, joined 2/120 true and zero false, with
0/12 whole events recovered. It failed to make usable Topics, despite
passing its focused tests. Neither candidate is active. The owner-approved
local-only real multilingual benchmark and first result are recorded above.

## 2026-10-08 Topic-focused embedding shadow (ADR-063)

**Latest independent shadow checkpoint (2026-10-08):** A GPT-6 Luna Low
author created 120 original, split-family-isolated English article snippets
and then a separate 56-article challenge. Labels deliberately include
opposing views of the same precise development and same-entity/different-
development hard negatives. A 6,144-weight dual-view E5 metric head was
trained on CDEC-WN real Wikinews storylines, another on the Luna training
split, and a single-pass title/lead head on both training splits. The
single-pass head failed its predeclared validation promotion gate and was
not scored on the 56-page challenge. On that challenge, unchanged E5 with
**title + lead** retrieved a correct same-Topic partner for **48/48** paired
queries and accepted **40/48** true pairs at a validation-selected cutoff,
with **0/72** same-entity/different-Topic hard false pairs and **8/8**
separate-family unmatched pages abstaining. Raw E5 body accepted 18/48;
the CDEC-trained head 24/48 (46/48 rank-1); the Luna-trained head 32/48
but made one hard false join. Independent read-only QA reproduced the pair
counts and scores. The eight abstentions do *not* test a new development of
an already represented entity. These are synthetic assistant labels, not
human or cross-publisher-web evidence. No new cross-publisher real-web
benchmark was completed. Training a
full E5 LoRA replacement is technically possible but would require a new
roughly 118 MB browser model and stronger labeled real-page evidence; no
framework/model was installed or downloaded. **No learned candidate or
title/lead input change is active in the app.** See the
[frozen results](../apps/local-service/experiments/topic-encoder/real-model/README.md).

**Owner-selected contrasting-view real-page check:** The Guardian opinion
and Fox News report about Trump's 2 April 2025 reciprocal-tariff
announcement are two different, provisional singleton Topics in the owner's
read-only local catalog. Direct inspection confirms the same announcement
despite contrasting framing. Their current body-E5 cosine is **0.90963**,
above the 0.90 floor but below the 0.94 tight gate. The planner still
refuses a merge because its global competing-neighbor rule requires a
0.04 margin over every other saved page, whereas another nearby page scores
**0.91400** against one member. A Google Search result was also among the
nearby saved Sources. Replaying the pure planner read-only kept them separate;
no owner database or Topic link was changed. This is concrete evidence that
the global margin can suppress genuine same-event joins as the catalog grows.
Do not simply lower the cosine floor: nearby different developments also
exist, and the synthetic challenge shows a trained candidate making a hard
false join. A candidate fix needs a frozen multi-page event benchmark and
separate provisional grouping vs. related-page presentation rules.

**Follow-on grouping shadow:** The owner rejects the catalog-wide 0.04
competing-page margin as non-scalable. A six-test, socket-denied
[invented-vector comparison](../apps/local-service/experiments/topic-encoder/grouping-shadow/README.md)
confirms that seven mutually compatible same-event pages remain seven
singletons under the live rule (0/21 joined pairs), while removing the margin
and using 0.90 complete link joins 21/21. But a three-page case shaped like
the observed true pair plus a 0.91400 different-event neighbor joins the
wrong pair when the margin is simply removed. An intentionally narrow
title/date cue succeeds only because its fabricated headlines expose the
event explicitly; the owner's real headlines do not. ADR-023 now retires
the global margin *as a future design requirement*, while retaining the
current production policy until a tested replacement and routing review.
No owner data, Source link, root thread, vector or running matcher changed.

**Follow-on 2026-10-08:** The owner explicitly directed a longer autonomous
attempt at a new topic-focused model and permitted local training tooling. A
supervised 384D, 768-parameter E5-plus-local-title/lead projection is now
frozen and repeatably trained on 242 invented documents, with 68 disjoint
synthetic validation documents. Its artifact is 15,667 bytes JSON (3,072
bytes of float32 weights). No PyTorch install or new base model download was
needed; this is an actually trained projection, not a new language model from
scratch. On a frozen 30-document unseen set, raw E5 and the projection both
ranked the right same-development partner first for **24/24** matched queries;
both accepted **0/12** true pairs at validation-zero-false cosine cutoffs. On
a second independently authored 95-document / 19-family challenge, both got
**76/76** rank-1; the reciprocal-nearest-margin rule made **two false joins**
with the projection and two with raw E5 (one with title+lead E5), despite none
on validation. Thus the candidate has no safe automatic-join result.

A separate, attribution-required [CDEC-WN research dataset](https://github.com/adithya7/cdec-wikinews)
(CC BY 4.0; Pratapa et al., 2021) gave a limited real-language check: the
frozen synthetic-trained projection retrieved a same-storyline article first
for **165/176** in the full gallery, versus **168/176** raw E5 body and
**169/176** title+lead E5. The curated 48-document test subset was 48/48 for
all three. These are Wikinews disaster storylines, not independently verified
atomic discussion Topics, cross-publisher viewpoints, or no-match tests. The
downloaded 573,230-byte archive is hash-pinned and ignored under the
experiment's `.work/`; only aggregate results and original code are tracked.
No raw dataset text, owner browsing material, URL, vector, provider call,
service DB write, production vector change, threshold change or discussion
migration occurred. The experimental model stays inactive. Details and exact
digests are in [the follow-on report](../apps/local-service/experiments/topic-encoder/next-eval/RESULTS.md).

The owner asked for a project-owned, English-first Topic encoder rather than
semantic-cosine-only matching. An isolated experiment now trains a small
rank-12 residual head over the already-packaged E5 vectors on 240 invented
documents / 60 subjects; whole families are disjoint across train/validation.
Its second frozen, independently generated English holdout has 80 documents /
40 unseen subjects, with differing views and same-entity/different-development
hard negatives. Both datasets are synthetic, not real-page or human gold. No
provider request, model download, live DB read/write, extension asset,
retained vector, threshold or Topic routing changed.

First independent held-out result: raw E5 places the same subject first for
**48/80** queries; the learned head gets **40/80**. A separate fixed text-cue
hybrid gets **61/80**, but it uses both pages' body leads, which the current
service does not retain. A validation-selected zero-false-pair cutoff accepts
**0/40** positive holdout pairs for all three approaches. Thus the head is a
negative result, while the hybrid is only candidate-retrieval evidence and
not a safe/deployable same-Topic join. The experiments and frozen digests are
in `apps/local-service/experiments/topic-encoder/`; 14 offline checks passed
before the additional fused-vector work. An independent read-only review found
no production/egress path and flagged synthetic transfer, the hybrid body-text
gap, an ignored synthetic-data commit risk and training workload bounds; the
trainer now has a 30-second budget, and only explicit synthetic files will be
force-added. A client-computed 896D fused one-vector variant and a third frozen
104-document / 52-subject English holdout were then tested. Raw E5 found the
same-subject partner first for **76/104** queries; the residual head got
**63/104**, the fused vector **46/104**. At validation-selected strict cutoffs,
raw E5 accepted five correct/three false pairs, the head three/two, and the
fused vector zero/zero. The V2 hybrid gain failed on V3 (43/104 for the
title+lead variant). These deliberately synthetic tests do not establish
real-page accuracy or a safe automatic join. The custom representations stay
inactive. See the [measured report](../apps/local-service/experiments/topic-encoder/RESULTS.md).
An additional read-only check of the six already-approved public R5 pilot
Sources and 15 separate assistant judgments found same-development top-1
nominations for **2/6** raw-E5 queries versus **1/6** with the head. No page
fetch/provider request, raw body, DB write or individual Source result was
produced. The two same-development pairs and assistant labels are too few for
calibration; no human-validation claim or production change follows.
Final offline checks: **22/22** Topic-encoder tests pass; the unchanged
local-service suite reports **262 pass / 4 platform-optional skips / 0 fail**.
The service secret scan reports zero findings, and the four deliberately
force-staged synthetic corpus files separately have zero key-pattern matches.
No actual browser/integration smoke is claimed because no runtime app path
changed. Production vector dimensions, saved Source associations and all
existing Discussions remain untouched.

## Latest request: valuable user-owned AI research as the cold-start hypothesis

**2026-10-08 dynamic Topic Atlas refresh (ADR-062):** The owner requested a
true Refresh button and then preferred dynamic map updates. The separate
dashboard now keeps a read-only revision watcher running after `npm start`,
atomically writes only its allowlisted local `snapshot.js`, and the browser
loads that sibling file periodically and on Refresh without rebuilding the
whole view. No network listener, service API, extension permission or
provider is added. The terminal must stay open for new snapshots; the last
snapshot remains readable after it stops. Synthetic watcher/browser and
owner-data verification: **8/8** restricted tests pass for the private
file bridge, SQLite generation/revision watcher, retry and Stop. A synthetic
headless-Chrome smoke passes with dynamic replacement, preserved selection,
search and zoom, and a same-timestamp content change. The owner database
one-shot export still reports 110 pages / 95 represented Topics and writes
both HTML and sibling JS without touching SQLite. A real `npm start` remained
active for ten seconds without an error and was then stopped with Ctrl+C;
an actual owner-db-change-while-open was not performed. Security review found
no high/medium issue; its timestamp-collision note was addressed by comparing
the complete allowlisted snapshot, and the manual button briefly waits for
the one-second watcher poll before checking the latest file. Owner visual
confirmation remains open.

**2026-10-08 standalone Topic Atlas (ADR-061):** The owner requested a visual
dashboard of stored pages, their Topic neighborhoods and clickable originals.
A read-only SQLite check found **118 Sources**, **110 learned public Sources**,
**95 Topics represented by those pages** and **132 total Topics**. The separate
`apps/topic-dashboard` program exports only learned public URL/title/host,
current Topic links, approximate PCA coordinates and original-vector cosine
neighbor scores into a self-contained local HTML file in the OS temporary
directory. No vector, page body, comment, account credential or provider data
is exported. It adds no listener or remote request and never writes SQLite.
The report is a moment-in-time file; rerun to refresh, delete its temp file
when no longer needed. Five synthetic tests passed under the repository's
network/process-denial guard; the real database read-only export completed in
under one second with 110 pages and 253 neighbor edges. `npm start` generated
the owner-local report and invoked the default-browser opener successfully.
A separate synthetic
headless-Chrome smoke verified rendered nodes, links and the restart hint, and
an owner-data screenshot was reviewed then deleted together with its temporary
Chrome profile. Trust review found no critical injection, listener or provider
issue; a predictable temp-directory ownership concern was addressed with
canonical-path and owner/mode checks (Unix) and the report remains owner-local
on Windows. Owner visual feedback is still open; no store/legal/remote release
is implied. The dashboard explicitly
refuses more than 1,000 learned pages rather than silently truncating its
all-pairs graph; that is not a catalog storage limit.

**2026-10-08 bound-window auto-rebind (extension 0.13.26, ADR-060):** The owner
approved automatically continuing matching in the next focused eligible normal
window of the same separate public-only profile after the bound window closes.
Window closure now releases and fences the old lease without setting the sticky
explicit-Stop state. Missed close events during worker reconstruction and
snapshot validation follow the same missing-window rule. Explicit Stop,
permission loss, unpairing, site blocks, incognito and inactive/other-window
exclusion remain. The 40/40 session tests and 107/107 adapter tests cover
explicit and missed close events, site-block/Stop races, access loss and
failed persistence. The restricted suite passed **1033/1033** and the secret
scan found zero issues. Actual owner Chrome confirmation after extension
reload remains open. No new permission,
provider call, data field or capacity increase. The local catalog has no fixed
page-count cap: a read-only check found 110 learned Sources (118 total), a
1,038,423-byte snapshot against the 8 MiB ceiling and a 76,481-byte catalog
projection against its roughly 1 MiB ceiling. These are finite size and
processing limits, not a 100-page quota; reaching them currently stops new
ingestion rather than evicting existing pages.

**2026-10-08 owner Chrome diagnosis and off-state clarity (extension 0.13.25):**
The owner reported no automatic Topic on a public De Standaard article, then
found **Matching off** and confirmed it works after Resume. A read-only exact
SQLite check found the supplied article absent before Resume, then stored and
Topic-linked afterward. The fresh-session default is already auto-start after
saved pairing, native HTTPS access, local health and eligible focused tab;
explicit Stop intentionally persists for the current browser session. The
reason the owner session was off was not proven. The grey toolbar tooltip now
says matching is off and names the Resume action, rather than implying the
current page simply has no Topic. No capture scope, permission or data policy
changed. The current owner service remains on 127.0.0.1:4174 with the same
Origin and persisted data. Focused toolbar/background checks passed **132/132**;
the restricted extension suite passed **1015/1015**, harness syntax and
diff checks passed, and the secret scan found zero issues. Owner verification
of the new tooltip remains open.

Two attempted isolated-Chrome smokes stopped before matching because their
old UI selector and pairing-completion expectation no longer matched User
Mode; the harness was repaired but has not been rerun end-to-end. Importantly,
its temporary service uses the same fixed loopback port as the owner's live
extension. While the owner browser is active, do **not** replace the live
service with that synthetic instance: a concurrent request could receive a
401 and clear durable pairing/Stop capture. Use a truly isolated test
environment or explicit owner coordination before another fixed-port smoke.

**2026-10-08 popup-closed transient recovery (extension 0.13.24):** The owner
reported that page processing appeared to start only when opening the popup.
The worker previously tried one authenticated service/foreground observation
per navigation, while popup status polling made a later attempt. Bounded
background retries now cover short service, foreground and matching failures
for the active eligible page, with all existing session, site-block,
permission, focus and document-attestation checks. Explicit Stop, block,
window closure, access removal, unpairing and navigation cancel/replace a
pending attempt. Failed authenticated health clears a stale grey connection
indicator to red. This does **not** detect same-URL in-place DOM changes,
capture inactive tabs, guarantee retries after MV3 worker suspension, or
backfill pages visited during a long outage. Focused adapter tests and trust
review found no privacy-scope blocker: **105/105** adapter tests, **5/5**
package checks, **1014/1014** restricted extension tests and a zero-finding
secret scan passed. The owner has now confirmed matching on one public article
after manually resuming an off session; popup-closed behavior after a fresh
auto-start remains to be verified separately.

**2026-10-08 popup-closed capture audit (no scope/code change):** The owner
asked whether each new page can be embedded and uploaded while the app is
not actively used. This already happens for eligible **active** tabs in the
one focused, leased normal window after saved pairing, the existing Chrome
HTTPS grant and authenticated local-service health. Popup use is unnecessary;
navigation/activation events wake the service worker and schedule bounded
read, local E5 embedding and URL/title/vector ingestion. Focused
`background-adapter` tests passed **89/89**, including blank-new-tab ->
navigation, switchback, popup-closed auto-start and inactive-tab exclusion.
The reader can abstain and a stopped/unavailable local service prevents
ingestion. Inactive tabs, other windows and pages visited while the service
is down are not silently queued for later scanning. ADR-025's active-tab,
one-window owner approval remains the boundary; processing inactive tabs
requires a new explicit privacy/product decision. No new permission or
automatic provider call was introduced.

**2026-10-08 visual loading scene (extension 0.13.23):** The owner wanted an
attractive loading state without visible prose. User Mode now shows two
subtle blue/lavender and warm-mustard conversation placeholders that breathe
gently only during active resolution/read. The status remains a polite live
region but is visually clipped; placeholders are hidden from assistive
technology. `prefers-reduced-motion` removes animation. Ready, idle, error
and stale-read states hide the scene. Isolated Chrome screenshots/overflow
and reduced-motion checks passed. Full restricted extension **998/998** and
secret scan zero. No provider, permission, persistence or posting-boundary
change.

**2026-10-08 discussion-first loading UI (extension 0.13.22):** The owner
requested removing the misleading page-title Topic header and "looking for
topic" copy. User Mode now presents **Loading discussions…** for active
resolution/read and no Topic title. A new root draft may be typed once a
specific Source and Topic are selected but the discussion GET is still
pending. Post remains blocked until the ready snapshot and existing mutation guards;
navigation detaches the staged text. **Get insights** is visible but disabled
until both discussion and related-page snapshots arrive. Unsupported or
unselected pages do not gain an attachable draft. A read-only Trust review
found the posting boundary intact; its detached-draft editing concern was
fixed before release. Full restricted extension **998/998**, secret scan zero,
and isolated Chrome visual/overflow check passed. The visual check showed
neutral loading copy and clearly disabled Post/Insight buttons. No provider
request, permission or stored-data change follows from this UI adjustment.

**2026-10-08 Insight presentation and comparison prompt (extension 0.13.21):**
The owner rejected visible numbered/question-mark citation badges. All rendered
Insight source links now use a small raised `↗`; accessible labels and the
visible unverified-source qualifier remain. The opener prompt now makes a
concrete, supported addition or different interpretation from a reachable
selected article the main point when available, without a canned phrase,
invented omission, or forced contradiction. If hosted search cannot provide
usable evidence from the exact selected page, it still falls back to the
current extract. Full restricted extension **996/996** and local-service
**262 passed/four optional skips**; both secret scans found zero. The normal
service was restarted with unchanged Origin, pairing and SQLite state. One
owner-authorized public PCGames/GameStar QA with the revised prompt completed
on `gpt-6-luna`: 68 words and one selected `[refN]` link in a private result,
with no Share or raw answer logging. This shows a cross-source link was
returned; it does not establish that the exact article was read or that the
comparison is factually useful. Owner browsing remains the quality check.
No automatic provider retry,
permission, data transfer, or automatic Share was added.

**2026-10-08 owner-approved model refs ([ADR-059](../decisions/ADR-059-model-reported-selected-links-unverified.md),
extension 0.13.20):** The owner explicitly accepts `[refN]` as a
**model-written, unverified** link hint, with `ref1`–`ref5` mapped only to the
five server-selected public URLs. It is not a claim that ChatGPT read or
verified those pages. The service no longer requires an exact URL in the
tool's consulted-source list for these hints, but still requires a completed
search, rejects unknown/malformed IDs and foreign provider annotations, and
does not auto-share or retry. The popup and any later explicitly shared agent
post render the distinct `1?`-style link plus a visible unverified-sources
note. The unnecessary full search-source-list response include was removed.
After the owner-format `[refN]` prompt change, **one** public PCGames/GameStar
live QA returned a private 78-word result with one selected model-ref link;
no answer text or raw provider data was logged, and nothing was shared. This
shows the one-shot flow can finish; it does not validate the Insight's factual
quality or selected-page access. The normal service was restarted on 4174
with unchanged Origin, pairing and SQLite. Full suites and security scans
passed: extension **996/996**, service **262 passed/four optional skips**,
both secret scans zero; independent read-only Trust re-review found no
blocker. No automatic second provider call or broader store/publication
approval follows.

**2026-10-08 selected URL IDs ([ADR-058](../decisions/ADR-058-selected-web-reference-ids.md),
extension 0.13.19):** The owner directed `ref1`–`ref5` links only to the
five supplied public URLs, not same-publisher substitutions. The service now
assigns those IDs and accepts a model's `[[webref:n]]` only when a completed
web search reports that **exact** selected URL in its consulted source list.
Foreign provider URL annotations still reject; a ref by itself is not proof.
The popup renders attested markers as its existing clickable superscripts.
Two further one-shot PCGames/GameStar live calls tested this: the first still
cited another GameStar article; the stricter prompt in the second produced
one `webref` but **zero** selected-URL source hits. Both were correctly
rejected, with no raw page/provider data logged or post shared. Thus the
owner's ref-only idea did **not yet fix PCGames at that checkpoint**;
an automatic retry, model-only source assertion or unselected-source link
was not approved there. ADR-059 later approves model-only refs as visibly
unverified hints. The normal service was restarted with unchanged Origin,
pairing and SQLite. Full restricted extension **995/995**, local service
**259 passed/four optional skips** after the final error-detail refinement;
focused service tests **78/78** after the strict prompt. Both secret scans
reported zero findings. Independent read-only Trust review found no blocker. A tool
source entry is not proof the full page or a specific claim was checked.

**2026-10-08 PCGames citation reproduction and multilingual title PoC:** The
owner's repeated `response-web-citation` was classified from the running
service trace as `unselected-url` after completed search/output. A fixed
public PCGames plus one selected GameStar QA case reproduced the same failure
in three owner-authorized, one-shot Responses calls; none cited the exact
selected URL or its stable article-ID alias. The final bounded diagnostic
identified another GameStar article, not the selected one; the first two
probes did not distinguish which of the two known hosts was cited. No raw
response, page text or token was logged and nothing was shared. The exact-URL
rule remains active. [ADR-057](../decisions/ADR-057-hosted-search-citation-scope-open.md)
records the diagnosis; the owner's subsequent strict-ID choice is in ADR-058. The
service was restored on port 4174 with unchanged Origin, pairing and SQLite.
The isolated [non-LLM title PoC](../experiments/topic-titles/README.md)
passes 12 network-denied checks. A read-only aggregate replay found 85 learned
Topics (71 singleton, 13 pairs, one triple); conservative shared phrases
appeared in **zero**, while existing-vector representative selection would
change six headings. This is a viable narrow proof of concept but not a
general multilingual abstract title solution or production activation; see
the [research update](../research/NON_LLM_TOPIC_TITLES_2026-10-07.md).

**2026-10-07 citation rejection diagnostic and non-LLM Topic-title review
([ADR-056](../decisions/ADR-056-insight-citation-display-metadata.md)):** A
provider citation to an exact selected URL with a missing or unusable display
title was incorrectly rejected as `response-web-citation`; the parser now
uses the already validated local Source title in that case. Exact selected
URL and span checks remain strict. A fixed, content-free trace v2 identifies
whether a later rejection is an invalid URL/span, the current Source URL, or
another unselected URL. The owner's specific failure was not captured, so
the root cause remains unconfirmed; canonical/redirect/current-Source URL
relaxation is **not** approved or implemented. Full service 255 passed/four
optional skips, loopback integration 2/2, secret scan zero, independent Trust
review no blocker. One deliberate public-page live QA attempt stopped before
any Responses call because the protected ChatGPT plan was unavailable. The
local service was restarted with unchanged Origin and retained state. The
[non-LLM naming review](../research/NON_LLM_TOPIC_TITLES_2026-10-07.md)
recommends evaluating a stable representative headline from current Topic
members; embeddings can rank labels but cannot generate words. No Topic
title behavior changed yet.

**2026-10-07 article-aware Insight source selection (extension 0.13.18,
[ADR-055](../decisions/ADR-055-insight-specific-source-selection.md)):** The
owner asked to remove duplicate article URLs, rank candidate sources for the
specific event before choosing five (including the GTA 6/Game Informer case),
and show a small no-outside-source cue. The shared pure context builder now
collapses exact/tracking URLs and same-host alternate slugs with a stable
article ID, skips recognizable search-result tabs in Insight source selection,
and uses distinctive title plus weaker URL-path overlap to rerank candidates.
The original embedding order remains the fallback when terms do not overlap;
up to five such uncertain sources remain available to avoid losing translated
or differently framed reports. This is not a verified same-event classifier
and cannot guarantee a citation or publisher access. A read-only replay of
the owner's public catalog selects only the matching GameStar Game Informer
article for the PCGames GTA 6 page. The Kyiv page has no confirmed same-event
outside source in the local pool and can still offer broad vector candidates
for the model to reject. The generated private draft shows **No outside sources
cited** when it has zero validated outside citations, rather than claiming
the provider never inspected a link. It does not change post text. The five
provider URLs remain a subset of the locally reversible 20-source pool after
exclusions, and the service independently reconstructs the same choice.
An isolated Chrome smoke exposed a previously intermittent coherent Source-
switch issue: the old Insight cleared but the new ready Source was not
immediately prepared, hiding Get insights until another discussion update.
The controller now prepares the new Source synchronously after clearing stale
state, without any AI call; focused tests and Trust review cover that fence.
Full restricted extension **994/994**, service **253 passed/four optional skips**, loopback
integration **2/2**, both secret scans zero. The isolated Chrome smoke **PASS**
after the Source-switch fix, with zero runtime exceptions or external extension
requests; three earlier runs timed out at the same late compact-view check
and prompted the fix. The service is restored on 127.0.0.1:4174 with unchanged
Origin, pairing and SQLite. No live ChatGPT request, new permission, Topic
merge or retention change was made. Reload extension 0.13.18 for owner
real-page verification.

**2026-10-07 owner-directed related-source research revision (extension 0.13.17,
ADR-054, implemented locally):** The owner now wants related-page content obtained only through
ChatGPT, not anonymous extension/service fetches. The current tab's bounded
visible extract remains the Insight subject. Select up to five related public
HTTPS URL candidates after user exclusions and existing sensitive-URL filtering;
do not spend slots on known rejected paths. The local catalog does not retain
paywall/access status, so publisher reachability cannot be known from URL alone.
This change removes the direct related-page read-first Insight path; hosted
search remains one explicit Get insights request with exact selected-URL
citations for external claims and no automatic retry/share. The owner further
directed that if no selected related page is accessible, a current-page-only
private draft is allowed after a completed search; that cannot guarantee
perfect factual grounding. A local 20-choice list keeps exclusions reversible;
the extension and service independently rebuild/validate the post-exclusion
five-source request. Excluding all visible choices cannot silently introduce
an unseen 21st Source. Old-client related excerpts are rejected, and turning
research off strips related URLs/titles from the provider payload. Independent
Trust review found no remaining blocker. Restricted extension 981/981,
service 253 passed/four optional skips, loopback 2/2, both secret scans zero,
and isolated Chrome smoke PASS on second run (first timed out at a late UI
wait). One additional owner-approved public PEP ChatGPT request with
`gpt-6-luna` produced a private PEP-257-cited draft without local related
extraction; **seven** Responses research requests total, no draft shared.
The local service is restarted with the same Origin, pairing and SQLite data.
Owner Chrome extension reload and real-page confirmation remain open.

**2026-10-07 bounded provider-source fallback (extension 0.13.16, ADR-053):** The owner
clarified that caching only this user's visited pages does not solve the
cross-user source problem and explicitly authorized up to 100 ChatGPT HTTP
research requests, preferring fewer. This reverses ADR-052 only for a
deliberate Get insights action with missing selected public-source excerpts.
Four isolated GPT-5.5 Responses requests found that hosted search works for
PEP 8/257 (both exact pages cited) and cited RD in an RTL/RD news pair, but
could not read the De Standaard Kyiv article: the provider reported a
fetch/cache error and robots.txt block, with no citation. Two further
Responses requests through the production Insight parser using an account-
listed `gpt-5.6-luna` model each produced a private PEP 8/257 draft with one
validated PEP 257 citation, including under the final strict parser. An
attempted GPT-5.5 production QA stopped at model-list preflight and sent no
Responses request. **Six actual Responses requests** were used; no draft was
shared. Search runs only after an explicit Get insights click, for up to four
missing selected eligible public URLs, with source exclusions preserved.
The strict result path accepts provider citations only for those exact URLs,
requires a completed web-search call plus at least one such citation, and
rejects unannotated links. This can fail on a publisher block or canonical URL
variation; it cannot prove a full article was read. Independent Trust re-review
found no remaining blocker. The three fixed no-source/unsafe-citation error
codes also propagate to the popup without raw material. Full restricted
extension 976/976, service 248
passed/four optional skipped, loopback integration 2/2, isolated web-probe
3/3, isolated Chrome synthetic smoke PASS (zero runtime exceptions/external
extension requests), and both secret scans with zero findings. The Chrome
smoke's stale first-`ul` selector was corrected to target its Related-Pages
list before the passing rerun. The owner service was restarted with the same
Origin and durable pairing on port 4174; extension reload is still needed.
No change to retained owner data, Topic grouping or store/publication scope.


**2026-10-07 no-provider-search direction (extension 0.13.15, ADR-052):** After a
De Standaard Kyiv Insight had no links, the owner explicitly directed that
ChatGPT must make no web-search calls and asked to supply the main text of
related pages. The current app already sends up to 4,096 characters from the
active public article and up to four anonymously fetched related-page excerpts
of 2,048 characters each when accepted; it does not send whole related
articles or retain them for later visits. A read-only replay of this page's
four selected catalog URLs accepted zero excerpts (three fetch/HTTP/redirect,
one parse/short). The catalog's same-Topic candidate shares the article ID
under another slug; other selected candidates are broader military stories.
The two recent successful content-free service traces show zero web-search
calls, but are not conclusively tied to the owner's exact click. ADR-052
records disabling the provider search tool unconditionally. The backend now
sends `tools: []` even for legacy true flags; the extension hides the old
search setting and sends false. Full restricted extension suite 973/973,
service suite 238/242 (four optional skips), loopback integration 2/2 and
both secret scans pass. Independent read-only Trust review found no blocker.
The service was restarted with the same Origin and durable pairing; reload
the extension to remove the old control. No live provider request was made.
Do not infer permission for longer/cached related texts or more anonymous
fetch attempts; the owner was asked separately about a bounded session cache.

**2026-10-07 claim-level excerpt attribution and related discussions (extension
0.13.14):** The owner specified that the model, rather than the UI, chooses
where each external source supports a claim. For an actually supplied bounded
related-page excerpt it emits `[[ref:n]]` beside that claim; the local service
resolves `n` against the exact validated excerpt array to a selected Source
URL, and the popup renders a clickable superscript number. Arbitrary model
URLs cannot become links through this path. Existing provider web citations
remain supported. The prompt excludes broad-theme or uncertain excerpts from
the current-page Insight. A separate read-only **Related discussions** view
appears beneath the current Topic threads, without joining Topics or changing
post origins. This is not a guarantee of factual accuracy or same-subject
judgment, and inaccessible related pages still supply no excerpt. See
[ADR-051](../decisions/ADR-051-inline-source-attribution-and-related-discussions.md).
The current Topic renders without waiting for supplementary related-discussion
reads. Full restricted extension suite 973/973 and service suite 238/242 (four
optional skips) pass; both secret scans report zero findings. Independent
read-only Trust review found no remaining citation-link or cross-Topic posting
blocker. Loopback integration passed 2/2 after briefly stopping the service
that occupied port 4174; it was restarted with the same Origin, durable
pairing and owner SQLite database. No new live provider call was made for
this change. The current Topic algorithm and owner SQLite data are unchanged.
Owner real-page quality confirmation after extension reload remains open.

**2026-10-07 related-text verification and Topic-matching shadow (extension
0.13.13):** The owner reports that Insights still appear not to use reference
pages and wants quicker, density-adaptive Topic matches. The related reader had
a concrete parser bug: an `<article>` token inside a script/hidden area could
make it ignore an otherwise usable visible `<main>`. The corrected bounded
reader selects only visible regions; a socket-denied through-controller test
now proves that its excerpt reaches exactly one explicit Insight request.
Extension restricted suite 967/967 and independent read-only Trust review pass.
No fetch, provider, retention or publication limit changed. A read-only test
of the owner's HLN catalog entry found 20 vector nominations and inspected
its selected four via anonymous Node fetch: Telegraaf and De Standaard returned
403, Google redirected, and Vietnam.vn returned 200 in a later check; the
bounded reader then accepted one 2,048-character Vietnam.vn excerpt. The
first four-page attempt accepted zero; its coarse diagnostic grouped all
failures as fetch/HTTP/redirect, so their exact causes were not established.
These are terminal-path observations, not a Chrome-page attestation. One
separately requested live, public PEP QA sent one Responses request with three
accepted related excerpts (5,567 characters); its private 65-word result
used a concrete PEP 8/PEP 257 contrast. No result was shared. The service was
restarted with the same durable pairing afterward.

An offline synthetic [whole-neighborhood shadow](../apps/local-service/experiments/topic-cloud/adaptive-neighborhood-README.md)
passes 5/5: it joins three mutually .92-similar pages the current planner
leaves separate, but also falsely joins an intentionally distinct .93 pair.
No production Topic threshold, Source link, discussion, schema or owner data
was changed. “Related” remains a candidate relation, not proof of identical
Topic. An always-available *related discussion suggestion* without merging
Topics is the safer next UX/data proposal; automatic identity changes need
graded real evidence and ADR-044/049's lifecycle, Trust and owner-data gates.

**2026-10-07 private Insight stability (extension 0.13.12):** The owner reported
that Insights appeared to refresh repeatedly and Share often required multiple
clicks. The immediate causes were repeated unchanged page/resolution projections
and ADR-036's global catalog-revision invalidation of an otherwise unchanged
private Insight. The owner explicitly approved the narrower rule in
[ADR-050](../decisions/ADR-050-stable-private-insights-across-unrelated-catalog-changes.md).
The extension now avoids redundant identical page ingests and resolution
renders, retains a running/completed private Insight through unrelated catalog
writes and transient discussion reloads, and uses a fresh coherent revision at
explicit Share. The service rechecks the Source stamp/title/link, Topic,
ChatGPT account, and any follow-up target/body before its existing atomic
Share write; material changes still reject. No extra provider request, auto-
retry/share, new retained page text or pairing reset was introduced. Full
extension restricted suite 964/964, service suite 235/239 (four optional
skips), loopback integration 2/2, and both secret scans pass. Independent
read-only Trust review found no blocking publication/authorization issue. A
same-title vector recapture may briefly leave Share visible in the popup,
but the service rejects it. The fixed service was restarted on the same
Origin with durable pairing; the owner must reload extension 0.13.12. Real
Chrome confirmation of the reported workflow remains open.

**2026-10-07 101st-page client compatibility correction (extension 0.13.11):**
The owner's next page did save at SQLite revision 378 (101 Sources, 101 Topics,
13 contributions), proving the service-side fixed-count removal worked. The
popup then showed `Local service unavailable` because `readCatalog` still
rejected more than 100 Topics/Sources; related-source ranking and Insight
context had the same stale catalog count assumption. No data disappeared and
the durable pairing verifier/Origin remain active. Client catalog,
prior-discussion and cleanup-result readers now use bounds derived from the
existing 1 MiB HTTP response maximum, while related ranking accepts
snapshot-sized candidates and still returns at most 100; Insight context
retains its five-source display/provider scope. Regression tests cover 101+
entries, malformed final entries and 120 related candidates. Full extension
restricted suite 956/956 and service suite 232/236 (four optional skips) pass.
A separate read-only projection of the owner's actual SQLite snapshot passes
the updated client catalog parser (101/101 at diagnosis; 102 Sources/101 Topics
at revision 381 after restart) and related-result parser without printing
URLs, vectors or tokens. Owner browsing advanced the revision; tests did not
edit owner data. Independent read-only Trust review found no blocker, noting
that larger related scans can still block synchronously near technical limits.
The service was restarted with the same Origin and durable pairing; the owner
must reload extension 0.13.11 for the client fix. Owner Chrome confirmation
remains open. The longer-term scale/migration gate in ADR-049 is unchanged.

**2026-10-06 catalog capacity correction (extension 0.13.10):** The owner
reported that new pages no longer found Topics and explicitly rejected an
arbitrary catalog count limit. Read-only inspection found the live SQLite
document at revision 377 with exactly 100 Sources/100 Topics but only
862,696 bytes; existing discussions were not removed. ADR-049 removes the
fixed Source/Topic count checks without changing the schema or matching
threshold. Writes still fail atomically at the 8 MiB snapshot, 1 MiB catalog
response, or 10-second global planner work budget; the popup now identifies
capacity separately from connection failure. The service's synthetic SQLite
test saves/reopens a 101st Source while preserving the older discussion,
tests 101 Topics and rejects an unreadable oversized catalog before commit.
Service restricted suite: 232 passed, four optional skipped; extension
restricted suite: 952 passed; loopback integration 2/2 and both secret scans
passed. Independent read-only Trust review found no blocking data-integrity
issue. Owner data remains untouched by tests (revision 377, 100/100 and 13
contributions after service restart). This removes the immediate fixed-count blocker, **not**
the snapshot/global-replanning scale bottleneck. A normalized/indexed store,
candidate retrieval, pagination and rehearsed live-data migration are a
separate owner/trust gate; no migration is authorized. The service was
restarted with the existing Origin and durable pairing; owner Chrome
verification after extension reload remains pending.

**2026-10-06 conversation-first thread layout (extension 0.13.9):** Owner
confirmed the earlier Golem message is visible and requested a clearer
discussion hierarchy plus brighter colours. User Mode now starts with a
new-thread composer/Insight action, then compact root-message cards with
reply counts, expandable nested reply branches, per-message author/time and
retained-origin page link. Long openers have Read more; deleted ancestors keep
their surviving descendants. Short open/close bubble transitions honor Reduced
Motion. Developer Mode remains available. The backend already allowed human
reply-to-reply and exposed `replyToId` in its flat DTO; no API or migration was
needed. Persisted-state validation now rejects corrupted cyclic parent links,
with memory/SQLite nested/deleted-parent tests. No owner data was migrated or
new provider call/permission introduced. Independent review caught two edge
cases before handoff: disabled/removed thread actions lost keyboard focus, and
the client accepted cyclic reply DTOs. Both now fail safely, with regression
checks. Extension restricted 951/951, service 231/235 (four optional skips),
loopback integration 2/2, both secret scans and isolated synthetic Chrome
visual/focus checks pass. The updated service was restarted with the same
extension Origin and durable pairing. The Chrome harness covered 410px/320px,
long text, nested out-of-order replies,
busy-to-ready focus and no horizontal overflow. Owner UI feedback after
extension reload remains open.

**2026-10-06 missing Golem message follow-up (extension 0.13.8):** The owner
reported that the shared message was not visible from either open tab. Read-only
SQLite inspection at revisions 363–365 confirmed one non-withdrawn agent root
still projects in the earlier Topic and passes the extension discussion DTO;
the Source is present under a newer empty Topic, and the backend prior view
returns the earlier Topic with one page-started root. This rules out deletion
but does not prove the owner's popup state. The popup previously discarded
prior-topic metadata without notice whenever separate discussion/prior GETs
straddled a service revision; local revision advanced during diagnosis.
The controller now retries one bounded catalog/discussion/related/prior read
after such a mismatch, keeps the current discussion readable if prior lookup
fails, and shows a small retry status rather than silently hiding the path.
Stale tab/manual-selection and authorization fences remain. Extension restricted
tests pass 943/943, including race, late-selection, failure and visible-status
cases. Actual Chrome confirmation from the owner remains pending. No Source,
Topic, contribution, embedding or provider data was changed. The owner database
currently has 100/100 Source slots and 97/100 Topic slots; new-page capacity
is a separate local PoC limitation to address before broader testing.

**2026-10-06 same-page earlier-discussion correction (0.13.7):**
Read-only inspection of the owner's local SQLite state found the reported Golem
post intact under an earlier Topic, anchored to the exact current Source ID;
the current Topic has no roots. A changed URL/vector/extractor stamp during
same-URL ingestion pins prior roots under ADR-023. URL and extractor version
were unchanged, so the vector differed, but old input/vector was not retained:
the exact reason for the change is unproven. Repeated E5 inference on identical
synthetic inputs was bitwise stable; a changed live DOM sample is plausible.
An authenticated, read-only prior-discussion route and compact popup path now
make earlier Source-started root threads discoverable without moving them.
Selecting an entry opens the whole earlier Topic, which may contain other
Sources' threads; UI counts only roots started from this page. Forget and
withdrawal clear discoverability appropriately. A source/stamp policy change
would require its own decision; none is made here. Focused synthetic SQLite
coverage includes recapture/restart, auth/Origin/Host, Forget, withdrawal and
stale popup state. Independent Trust review found a misleading count/open-topic
label, corrected to say it counts only threads started here. Service tests
229/233 (four optional skips), loopback integration 2/2, extension restricted
940/940 and both secret scans pass. The updated service is listening again on
the fixed loopback port; an owner Chrome reload/UX check remains.

**2026-10-06 stale-model recovery (0.13.7):** A service restart
empties its in-memory account-model set while an already-open popup may still
hold the prior model selection. This reproduces the owner's
`model-unavailable` message before any Responses dispatch. The service now
rebuilds an empty catalog once, without page text, during a deliberate Insight
request; a missing model sends no research. The popup refreshes its picker on
that fixed failure and requires a new deliberate Insight click. Provider
research is never auto-retried. Focused offline service/controller/panel tests
pass with the full suites above. The service was restarted with the same
Origin; no live ChatGPT request was made for this change.

**2026-10-06 Insight opener style refinement:** The owner reported a GTA 6
draft that raised a potentially useful related-source detail but sounded
formulaic and ended in a broad question. The static opener now prioritizes
one supported addition from a related excerpt, explains why it matters for
the current page, and uses a short, natural forum voice without a compulsory
question. It still cannot infer a full-page omission from the bounded current
extract or claim a contradiction without comparable evidence. No source,
provider, storage, citation or Share scope changed. Focused socket-denied
provider-envelope checks and the full restricted local-service suite pass
(222/226, four optional skips); the service secret scan found zero findings.
Independent read-only review found no data/provenance boundary regression.
The verified local service was restarted with the same extension Origin and
durable pairing, so the new prompt is active; live model quality is not yet
re-tested.

**2026-10-06 related-text and custom-embedding checkpoint:** The explicit
Get insights path already passes the current article prefix plus up to four
validated, anonymously fetched related-page excerpts to the connected model;
focused extension and service checks passed 77/77 and 63/63. The unchanged
96 KiB/4,096-token reader skipped some large public pages before their
article starts. The owner then explicitly approved the exact 768 KiB/8,192-
token owner-local expansion and one separate live provider quality test under
ADR-041. Extension 0.13.5 applies only those reader ceilings; the four-attempt,
2,048-character-per-excerpt and five-second bounds remain. The synthetic
583,306-byte late-main and over-cap cancellation tests pass. Independent Trust
review found no blocker, and the restricted extension suite passes 925/925.
The local-service suite passes 221/225 with four optional skips; both secret
scans found zero findings.
An anonymous check of the previously supplied Vietnam.vn public candidate
accepted one 2,048-character excerpt, with no text saved or printed. The
single approved live ChatGPT QA attempt stopped before a Responses request:
the protected connection could not be restored (`Connected ChatGPT plan
unavailable`). The verified local service was restarted with the same Origin
and durable pairing; port 4174 was listening again. After the owner
reconnected, safe diagnostics found that default-sandbox DPAPI reads failed
but elevated reads succeeded. The old named model was not in the account's
current list, so a tested one-shot `auto` option chose an actually listed
model. Exactly one Responses request then completed using fixed public PEP 8
current text and three bounded PEP 257/20/7 excerpts (5,567 characters).
The private 71-word result made a concrete PEP 8/PEP 257 comparison; there
were no provider citations, retries or Share. The local service was again
restarted with the same Origin and durable pairing. This validates one
backend/provider path, not Chrome-rendered capture or arbitrary news-page
quality. The owner also requested a small custom Topic embedding trial. An
isolated, dependency-free 256-dimensional
hashed text encoder learned diagonal weights from 20 project-created synthetic
documents and was evaluated on 12 held-out synthetic documents. Rank-one
same-subject retrieval was 5/12 for both learned and unweighted variants;
this negative result does not justify replacing E5 or changing Topics. Its
[experiment](../apps/local-service/experiments/learned-embedding/README.md)
has three socket-denied tests; no real content, owner database, provider,
download or extension asset was used. A larger model/training-data package
and any production activation retain their separate ADR-044/048 gates.
The follow-up trained a 384-dimensional project-owned diagonal projection
on the already-packaged multilingual E5 vectors, with the same frozen
synthetic split and no new asset or retained vector. On 12 held-out queries,
unmodified E5 and E5 plus the learned head both ranked the same-subject
partner first for 2/12 and a distinct-subject hard negative first for 10/12.
The head adds 1,536 float32 bytes but offers no held-out improvement; the
existing E5 model/tokenizer remain about 135 MB together. Four combined
socket-denied tests and the guarded E5 runner pass. This is a small
negative feasibility result, not multilingual calibration or a production
matching change.

**2026-10-06 cost-sensitive Insight default:** The owner prefers the cheapest
available model and suggested the bottom of the catalog. Extension 0.13.6
applies this preference. Official OpenAI Docs preserve catalog order but do
not define it as a price ranking; they describe Luna as cost-efficient. The
extension and one-shot QA now prefer an actually
listed Luna model when there is no valid explicit selection, preferring
`gpt-6-luna` when present; otherwise they retain the last-listed fallback.
Manual selections remain stable while available. This is a heuristic for the
owner-local ChatGPT-plan workflow, not an absolute price or usage guarantee.
It made no additional provider request. Focused socket-denied controller/QA
checks pass, and the full restricted extension suite passes 926/926. The
local-service suite passes 222/226 with four optional skips. Independent
read-only review found no provider or data-scope blocker. It identified a
manual-vs-automatic selection ambiguity, now fixed with a controller-local
manual marker and a refresh regression; no selection is retained across
account changes or disconnects.

**2026-10-06 related-Insight availability diagnosis:** The existing local
catalog already nominates real vector-related Sources, and an explicit
Insight request can include up to four anonymously fetched excerpts. A
previously supplied public Vietnam.vn candidate is 583,306 bytes, with its
`<main>` beginning after roughly 239 KiB. The current 96 KiB reader therefore
cannot reach the article: an anonymous bounded run reported one eligible,
one attempted, zero accepted, with a size/type rejection. An in-memory-only
768 KiB/8,192-token variant accepted one 2,048-character excerpt, without a
provider request or saved text. This is evidence for that public page in the
Node path, not a Chrome or Insight-quality pass. ADR-044 requires a separate
owner/Trust gate before activating the eightfold fetch-size expansion; a
specific approval and one optional live provider QA approval are pending.
Meanwhile, the unchanged-cap reader now reports only bounded eligible,
attempted, accepted and fixed failure counts in Developer Mode popup memory;
User Mode stays clean. No URL, title, page text or exception is logged or
added to provider input by this diagnostic. The live 96 KiB limit remains.
Extension 0.13.4 packages this diagnostic; its full test suite passes
922/923 with one optional skip, and the secret scan reports zero findings.

**2026-10-06 extension 0.13.3 and isolated cloud-rehearsal checkpoint:**
The User Mode first-run connection card now keeps the token field and Connect
action visible without horizontal scrolling at 410 and 320 px popup widths;
Enter uses the same pairing action. Plain disconnected text no longer repeats
under that card, while actual errors remain visible. The main Insight action
has honest setup/processing states, including related-source preparation; it
does not launch research before the existing connection and plan gates.
The full extension suite passes 633/633, the local service suite passes
221/225 with four optional skips, and isolated Chrome visual states pass.
This is a UI-only extension increment: reload the unpacked extension; the
local service need not restart for it.

Two further **offline-only** probes support later scale decisions. The
[synthetic v2 rehearsal](../apps/local-service/experiments/topic-cloud/sqlite/rehearsal/README.md)
now exercises learned-Source Forget atomically with revision/generation checks,
root pinning and origin cleanup; 11/11 socket-denied tests pass, including
failure rollback. The
[near-copy nomination probe](../apps/local-service/experiments/topic-cloud/related-retrieval-README.md)
retains same-Topic peers while preventing invented duplicate-title/vector
related nominations from monopolizing a 20-candidate list; 4/4 socket-denied
tests pass. Neither probe is imported into production. Real retrieval quality,
full deletion/withdrawal/recovery, owner-data migration and matcher activation
remain unapproved/unverified under ADR-044; no owner DB or provider data was
used in these probes.

**2026-10-05 R5 review-set approval checkpoint:** The owner approved in
principle assembling 200–250 local public-page pairs with URL/title,
provenance, existing-model vectors and later human labels until manual
deletion; no retained raw text, private pages, provider calls or publication.
[ADR-045](../decisions/ADR-045-r5-public-pair-acquisition-checkpoint.md)
records this as acquisition permission in principle without inventing an
independent rating or repeating the finished 6/6 exercise. The older R5
collection contract still requires exact permitted origins/date range/fields/
method/rights evidence, Trust disposition and real independent reviewer
staffing before a completed benchmark. Those specifics were not in the
initial approval; the pilot follow-up below resolves the narrow acquisition
scope, not the later review or scale-up gates. A source-policy scan found
licensed English Wikinews plausible for a pilot but insufficient alone for
viewpoint diversity; institutional open-license pages are not editorial-news
substitutes.

**2026-10-05 R5 pilot follow-up:** The owner explicitly approved all three
specifics: up to 24 public English editorial pages (2020–2026) from English
Wikinews, Global Voices and original VOA reporting, up to 30 candidate pairs,
the short project-written factual-summary field, and deferring independent
reviewer names until *before labeling*. Trust conditionally accepted this
scope with isolated capture and page-level rights/provenance checks.
[ADR-045](../decisions/ADR-045-r5-public-pair-acquisition-checkpoint.md)
records the exact fields, exclusions and operational conditions. Summaries
will stay blank at acquisition; an authorized human may write them locally
later, without sending article text to an AI provider. The first three real
Source records are now saved as described below; no live database was touched
and no reviewer labels exist. The
pilot's 24/30 limits are not approval to scale to the 250-candidate R5 task.

**2026-10-05 R5 first real capture:** The isolated one-URL harness passed
10/10 socket-denied synthetic checks and 2/2 actual-Chrome local fixtures
(packaged reader/E5, blocked subresource and redirect). Trust accepted one
real page subject to its per-page rights screen. We then saved three approved-
origin public Source records locally: Wikinews, Global Voices and VOA original
reporting on different angles of the February 2022 invasion. Each has
page-level operator-declared rights/provenance evidence, one 384-vector and
an input digest; Wikinews's source date has `day` precision. No raw article
body, summary, label or production DB write was made. The ignored inventory
count is 3. The three cross-publisher cosine scores are 0.9099, 0.9042 and
0.8907, but no same-Topic conclusion follows from scores alone.
One empty temporary pilot folder left by an earlier sandbox-denied Chrome
test was verified empty and removed; the successful captures closed their
own Chrome profiles. Continue only within the approved 24-page pilot;
independent reviewer recruitment is required before any labeling, and full
R5 scale-up requires a separate owner/Trust decision.

**2026-10-05 R5 second-theme increment:** Three more screened public Sources
were saved in the same ignored pilot inventory: Wikinews and original VOA
reports on the WHO pandemic declaration, and a Global Voices article on
African pandemic responses. The inventory now has six accepted Sources and
15 possible, still-unselected/unlabeled pairs. The two declaration reports
score 0.9156 cosine even though their publication dates differ by three days;
the VOA declaration report versus the broader Africa-response article scores
0.9010. Those scores illustrate why a fixed threshold cannot be treated as a
human Topic judgment. No reviewer task, label, changed threshold, live DB
mutation or provider call followed. Further capture remains within the exact
pilot scope; ADR-046 subsequently supersedes the independent-reader
prerequisite for owner-only exploratory ratings. Full 200-250-pair scale-up
and AUTO remain separately gated.

**2026-10-05 R5 reviewer decision:** The owner explicitly says he alone is
sufficient for this local PoC. [ADR-046](../decisions/ADR-046-owner-only-exploratory-r5-review.md)
opens an owner-only exploratory rating lane and supersedes the earlier request
to recruit an independent person merely to label the pilot. No labels have
been recorded yet. Because the owner has seen some pilot similarity scores,
future rating views must hide scores and disclose this limitation; his answers
must not be represented as a blinded independent secondary review. The
distinct-role P1.2 completion contract remains only for a later independently
validated corpus or AUTO-quality claim. Full 200–250-pair scale-up, production
rule changes and all later privacy/security/provider/store gates remain open.

**2026-10-05 R5 owner task prepared:** Five socket-denied synthetic checks
and read-only Trust review accepted the create-only owner-review preparer.
The ignored local snapshot now freezes six Sources and 15 pair IDs, bound to
the inventory and canonical task digest. A read-only check confirmed these
counts without printing real metadata. The view contains public title, URL,
date and blank Label/Rationale fields only. No human labels, independent
review claims, threshold change or production data change were made.

**2026-10-06 R5 obvious-pair triage:** The owner answered frozen
`review-item-001` as `different-topic` and directed the assistant to handle
obvious examples instead of asking him all 15. The answer is stored locally
under the frozen task digest. [ADR-047](../decisions/ADR-047-metadata-only-llm-triage-for-r5-pilot.md)
records metadata-only LLM triage of the other 14: eight suggested different,
two suggested same and four uncertain. The title/date suggestions and owner
answer live in separate Git-ignored files; a read-only check verified each
file's task binding and counts. No article body entered model context for
this step. Prior score visibility means these are not blind labels or a
matching-quality metric. No production routing, thresholds, provider app
integration, independent-review claim or full-scale gate changed.

**2026-10-06 R5 content-based evaluation and non-LLM shadow:** The owner
explicitly authorized the assistant to read the six already-approved public
pilot articles to judge Topic overlap offline, while requiring the runtime
algorithm to stay non-LLM. [ADR-048](../decisions/ADR-048-llm-evaluation-nonllm-runtime-matching.md)
records the exception to the earlier title-only restriction. Fifteen
assistant-only judgments, bound to the frozen task and kept separately from
the one owner answer in Git-ignored local files, found two same atomic
developments, four related-but-distinct developments, and nine unrelated
pairs. They are not human gold; one broad survey is an especially imperfect
atomic-Topic example. No raw article body was retained. The isolated
[non-LLM shadow](../apps/local-service/experiments/r5-pilot/shadow-README.md)
compares the unchanged adaptive planner against vector-floor, title-token,
publication-time and top-three-vector-neighbor *candidate* signals. The
current 0.90 pair floor catches one of the two assistant-same pairs and three
of the four assistant-related pairs; the unchanged fresh six-Source planner
joins none. The strict title-token channel adds no pilot candidate. Top-three
neighbors find both assistant-same and all four related pairs, but also four
of nine unrelated pairs: useful for graded retrieval, not automatic Topic
identity. These tiny, score-exposed pilot findings do not calibrate a new
threshold. No production rule, stored data, Topic ID or discussion moved.

**2026-10-06 ephemeral title-vector check:** The existing packaged E5 model
embedded only the six approved public pilot titles in memory; it neither saved
a second vector nor changed the live one. Predeclared title weights of 0,
0.25, 0.5 and 1 were compared with the retained body-prefix vectors. At the
old, uncalibrated 0.90 reference cutoff, the six-page 0.25 blend surfaced
both assistant-same and all four assistant-related pairs, with no unrelated
pairs in that tiny two-theme set. A separate fixed 32-document synthetic
hard-negative challenge contradicted a safe join interpretation: at 0.90 the
body baseline passed 5/6 held-out positives and 8/12 hard negatives, while
the 0.25 blend passed 6/6 positives and 10/12 hard negatives. Most families
still had positive/negative score overlap. [Experiment notes](../apps/local-service/experiments/r5-pilot/title-vector-README.md)
and 7 socket-denied tests plus independent Trust review support only this
failure-mode finding. No blend, second vector or revised cutoff was activated.
Read-only source discovery identified a possible Kabul/Ghani-flight
cross-publisher same-development pair at [Wikinews](https://en.wikinews.org/wiki/Afghan_Taliban_occupies_Kabul_as_president_Ghani_flees_the_country)
and [original-reporting VOA](https://www.voanews.com/a/south-central-asia_ghani-leaves-afghanistan-taliban-enter-kabul-set-take-control/6209601.html),
plus an earlier [VOA Kabul-arrival report](https://www.voanews.com/a/south-central-asia_taliban-arrive-kabul-await-power-transfer/6209598.html)
as a possible distinct-outcome hard negative. This is a candidate shortlist,
not an accepted Source, label or rights clearance. A proposed quake article
mixing VOA and wire material was excluded from the shortlist, not captured.
Further one-by-one capture remains
within ADR-045's existing pilot approval; preserve the frozen six-Source task
and its diagnostics when designing the next inventory increment.

**2026-10-05 bounded source-selection increment (extension 0.13.2):** The
paired popup and service now request 20 local related nominations, but the
validated Insight context still includes only the current Source plus up to
four non-current Sources; anonymous related-page reading still attempts at
most four. Provisional same-Topic peers use the backend's validated ranking
instead of ID fallback. A deterministic three-alternative lookahead favors
different hosts and exact-title variety within each Topic/related bucket;
same-Topic priority remains. No provider call, new stored representation,
automatic Topic grouping or owner-data migration was added. Host/title variety
is **not** stance detection or independent corroboration. Trust review found
no blocking boundary issue. Socket-denied checks: extension 914/914, service
221/225 (four optional skips), focused related-reader/context 58/58. Reload
extension and restart local service; actual owner-page quality is unverified.
The isolated Chrome smoke could not complete in this environment: first Chrome
spawn returned `EPERM`, then an escalated attempt could not bind the approved
loopback endpoint. No browser-pass claim follows; the owner can test after
reload, or rerun the smoke where Chrome and the loopback port are available.
The isolated [title-cue rerank probe](../apps/local-service/experiments/topic-cloud/subject-rerank/RESULTS.md)
measured the unchanged 32-document invented corpus with the packaged E5. On
12 held-out query directions, an opposing-view partner ranked first in 2
body-only cases versus 7/9 with two title-cue weights; distinct-subject hard
negatives still ranked first in 5/3 cases. A post-measurement negation fix
makes these exploratory, not preregistered validation. Its three socket-denied
tests pass. The production matcher and 100-Source/Topic cap remain unchanged.
The next semantic-identity evidence requires a separately approved
provenance-reviewed real-pair task before claiming reliable automatic joins.

**2026-10-05 cloud-first topic clarification (proposal, no activation):**
Russia/Ukraine was a test case, not a product domain limit. The owner wants an
unbounded, graded cloud of related pages across arbitrary subjects, including
high topical proximity for opposing views of the *same* subject. A mandatory
precise-Topic/Collection hierarchy is therefore withdrawn; a Collection can
later be a view, not the storage ontology. The revised
[ADR-044](../decisions/ADR-044-continuous-topic-cloud-and-insight-diversity-proposal.md)
separates topical affinity, argument difference and stable discussion identity,
and proposes overlapping neighborhoods without transitive topic merges.
There is no further taxonomy decision before synthetic shadow tests. The
current single-vector algorithm and 100-Source/100-Topic cap remain unchanged;
the cloud, scalable SQLite schema and stance-aware quality are **not yet
implemented**. Migration of retained owner data and any additional stored
representation still require their separate gates.
An isolated [synthetic shadow](../apps/local-service/experiments/topic-cloud/README.md)
now exercises graded overlapping neighbors and four-slot diversity without
production imports or owner data. Its 9 socket-denied tests pass, including
an over-100-node catalog, opposite views, multi-subject overlap, duplicate
flooding and arrival-order invariance. Invented coordinates also rank one
unrelated false friend above a relevant counterview; this deliberately shows
that current-vector semantic reliability is unproven. It does not remove the
production cap, migrate discussions or validate real multilingual recall.
A separate [normalized SQLite dry run](../apps/local-service/experiments/topic-cloud/sqlite/README.md)
persists 140 synthetic Sources/vectors across reopen, returns bounded indexed
neighbors and paginated Sources, preserves discussion/root/reply IDs during
edge changes, and rolls back invalid batches. Its 4 socket-denied tests pass.
It is **not** a migration: source-anchor/Forget lifecycle, legacy pins, real
owner-data backup policy, API pagination and query-quality scaling still need
design and review before any production switch.
The [synthetic-only migration/recovery plan](../apps/local-service/experiments/topic-cloud/sqlite/MIGRATION_RECOVERY_PLAN.md)
now maps every current JSON field and identifies why the first SQLite prototype
cannot be promoted unchanged: current Discussions are Topic-based, historical
anchors and revisions must survive, whole-root routing and Forget require
controlled mutations, and rollback after commit needs an approved recovery
method. The plan specifies a synthetic transactional conversion/rollback rehearsal,
fault injection, lifecycle and pagination checks. No owner database was opened
or copied; the full migration implementation and owner-data/security gate remain.
The first [synthetic v2 normalization rehearsal](../apps/local-service/experiments/topic-cloud/sqlite/rehearsal/README.md)
round-trips a valid invented state with source-root/reply provenance, a
Topic-pinned legacy root, revisions and a withdrawn root. Seven socket-denied
tests pass, including seven injected pre-commit failures, unknown schema/
altered definition refusal, cross-kind ID collision rejection and safe cleanup
retry. Independent Trust review found missing `/v1`, learned-Source/AI
fixtures, full lifecycle,
stale-version handling and post-commit recovery; these remain open and are
listed in the rehearsal README. The actual local service and owner DB remain
unchanged.

**2026-10-04 Topic architecture review (proposal, no activation):** The owner
requests a same-Topic algorithm that remains useful as embedded pages grow,
joins opposing views of the same subject, and gives Insights a diverse four-
page comparison set. Independent Astra architecture review and Sol code/
aggregate audit found that current cosine complete-link/margin grouping is
arrival-order dependent, while the Insight selector can choose provisional
peers by ID and redundant pages from one publisher. Read-only local aggregates
show 92 total Sources/83 total Topics, including 84 learned Sources in 70
learned Topics (57 singletons, 12 pairs, one triple), and 185 cross-Topic
vector pairs at cosine >=0.90. These are not
semantic labels or proof that those pairs should merge. The local catalog is
also near the hard 100-Source/100-Topic PoC ceiling; merely lowering 0.90 or
raising constants cannot meet the growth objective. The original ADR-044
proposal separated candidate retrieval, identity verification and diverse
Insight selection but prescribed precise Topics within broader Collections.
The 2026-10-05 owner clarification above supersedes that hierarchy. Near-term
safe work remains synthetic shadow testing of the documented three-page
margin bug and source diversification; normalized SQLite and any additional
retained representation/provider call/real review corpus retain their gates.

**2026-10-04 owner-provided HLN Insight diagnostic (read-only):** The public
Russian-defence-budget article supplied by the owner exists once in the local
catalog, but its assigned Topic has zero other Sources. The current ranker
finds 18 vector-related suggestions above 0.85, returns five, and the normal
Insight context includes the first four as `relatedSources`, not
`sameTopicSources`. Those four are the owner-visible Telegraaf, Vietnam.vn,
Google Search and De Standaard candidates. A bounded anonymous run through
the existing related-excerpt reader, outside Chrome, yielded zero accepted
excerpts: the first and fourth returned HTTP 403, the second returned HTML
but did not pass the reader, and Google fetch failed. This is evidence about
the anonymous Node path, not proof of the owner's Chrome result. The service
currently listening on 4174 started at 22:02, before the revised prompt file
was written at 22:24; it therefore needs a restart to activate that prompt.
No provider call was made despite the owner's permission: the running process
has the old prompt and the sampled comparison input is empty, so a request
would not test the new contrast instruction. No local catalog or user data
was modified. This is primarily a context-availability/grouping problem,
not evidence that the revised prompt ignored available same-Topic excerpts.
The next useful check is after a safe service restart: inspect the actual
Chrome request's content-free counts for same-Topic and accepted related
excerpts before spending a provider request. Any new retained page-text cache
or expanded source collection requires its own data/security review.

**2026-10-04 extension 0.13.1 User Mode cleanup:** The owner confirmed that
manual Topic selection and the initial Start browsing session/Choose Topic
calls to action do not belong in the normal product flow. They are removed
from User Mode; no-Topic status now describes automatic discovery and hides
the empty composer. Manual Topic/source creation and correction remain in
Developer Mode. The existing fresh-session auto-start preconditions and Stop
behavior did not change. A mustard overlapping-ring background now visibly
converges and separates on a 7.2-second loop, stays behind content, and stops
under reduced-motion preferences. An isolated Chrome measurement found about
27 px of relative ring movement in 1.5 seconds. Full extension tests pass
906/907 (one optional skip); the secret scan has zero findings across 183
files. The isolated Chrome visual check passes 17 states, including 410 px,
320 px, 120% text zoom and reduced motion, with no horizontal overflow or
uncaught popup errors. Reload the unpacked extension to see this extension-
only increment; the backend needs no restart for it. The owner-local status
and all provider, source-rights and store gates are unchanged. Naming remains
exploratory, not a rebrand.

**2026-10-04 same-Topic contrast refinement:** The owner wants Insights to
surface useful differences between other pages of the same provisional Topic,
not mainly restate the current article. The static opener prompt now examines
bounded excerpts mapped to same-Topic Sources first, keeps the current page
central, and falls back when no supported contrast exists. It does not turn
related-only pages into same-Topic evidence. No source fetch, permission, provider request,
automatic Share or grouping behavior changed. Offline prompt/provider-contract
tests pass (220/224; four optional skips); the secret scan found zero findings
across 88 files. An independent trust review found no blocker and its recommended
hostile-excerpt contract fixture is included. No fresh live model-quality test
was run. The local service must restart to use the new prompt. Brand exploration
continues; neither Panl nor reScope is selected or cleared.

**2026-10-04 live related-text QA and startup recovery:** The owner approved
one additional fixed public-page GPT-5.5 test after the first PEP probe. Both
used one Responses request, a 4,096-character PEP 8 current-page extract and
three public PEP 257/20/7 excerpts totaling 5,567 characters, with no retry
or Share. The first 78-word post made a useful PEP 8 point but showed no clear
use of related text. A revised prompt asks for one supported cross-source
contrast when useful, without forcing it. The second 80-word post compared
PEP 8 with the excerpted PEP 257 convention/tooling angle and asked a relevant
question; it had no provider citation. This is one positive fixed-fixture
quality observation, not general related-page or rendered-Chrome validation.
The owner's generic `Research did not complete` did not include a code; old
backend/extension version skew remains a hypothesis, not a proven cause.
The normal service initially failed to restart because its persisted-state
validator used the new-capture URL policy for one historical retained-only
Source. SQLite integrity was OK; a read-only actual-state check found 83
Sources, one retained-only URL and no historical post origins or root anchors
using it. [ADR-040](../decisions/ADR-040-retained-source-projection-compatibility.md)
now extends retained-only validation to persisted learned Sources while still
checking canonical URL and operation digest. An independent trust review
identified and then cleared a paired-API post-origin gap after a strict service-
side guard and regression; new ingestion, provider context and post origins
remain strict for learned Sources; reserved-domain demo fixtures retain their
synthetic posting behavior. No owner row was changed. The full service suite
passes 219/223 with four optional skips, and the secret scan found zero
findings across 88 checked files; the normal service is again listening on
127.0.0.1:4174 with the current code. Reloading the Chrome extension and
owner-operated real-page Insight feedback remain next. Store/privacy/source-
rights gates remain open. Brand screening rejected a second set of occupied
exact names; no name or dynamic-background motif was selected.

**2026-10-04 version 0.13.0 owner-local Insight/GUI increment:** The owner asked
for related-page text in Insights as a default-on Settings option without
repeated consent screens. [ADR-041](../decisions/ADR-041-owner-local-related-page-excerpts.md)
records the bounded explicit-click, anonymous public-page fetch and the
separate store disclosure gate. The extension and local-service implementation
passed offline tests and an isolated-Chrome visual run; ADR-038's narrower
title/URL permission alone did not authorize related-text QA. The owner gave
separate bounded permission for the two fixed requests described above. Astra High supplied
the conversation-first GUI specification in
[ADR-042](../decisions/ADR-042-conversation-first-popup-redesign.md) and the
evidence-first topic-sensitive prompt strategy in
[ADR-043](../decisions/ADR-043-evidence-first-topic-sensitive-insight-prompts.md).
Sol High implemented both. Independent Astra visual review found no blocker
at 410/380/320 px, 120% text zoom and reduced motion; the one-view User popup
puts Topic, composer and messages first, with linked-page controls in Settings.
This is an owner-local tested build, **not** a store-ready release.
[The SimilarSites assessment](../research/SIMILAR_SITES_FALLBACK_2026-10-04.md)
finds that its paid API returns audience-similar domains, not matching
articles; simply scraping/reusing its site as a competing fallback is outside
its published terms. A separate owned page-link/semantic-candidate experiment
is a possible later task, not an active Google/SimilarSites dependency or
same-Topic resolver.
An independent read-only trust pass reproduced four related-text blockers:
off-during-attestation still sending an attached excerpt, hidden text from an
explicitly paywalled fixture, an uncancelled rejected response stream, and
storage-read failure falling back to on. It also found that same-Topic text
could be fetched without the per-source exclusion offered for related-only
candidates. Sol High corrected these and subsequent malformed-HTML/raw-script
leaks, with synthetic regressions. Final independent trust re-review found no
remaining blocker within this owner-local scope; 83 focused tests passed.
The static reader cannot compute external-CSS visibility or identify every
publisher restriction, so this does not authorize public distribution.
The owner then requested automatic browsing on each new browser session and
that related pages stop occupying a User Mode view. The existing
`background.js`/`capture-session.js` already auto-starts on a fresh session
after saved pairing, an existing Chrome HTTPS grant, authenticated local
health, and a focused eligible normal window; offline background-adapter tests
cover that path. Stop still suppresses capture for the rest of the same browser
session, and a closed bound window is not silently rebound to another window.
No capture scope change was made; the GUI removes the User Pages tab and keeps
source exclusions in Settings and source links on posts. This version has no
Google/SimilarSites fallback. Next evidence is an owner-operated real-page
usability test; additional live provider QA needs a new explicit scope.
Brand exploration (including a reactive overlapping-background metaphor) has
not selected or cleared a name; no rebrand was applied.

**2026-10-04 live QA preparation (completed above):** The owner explicitly approved one
controlled public-page/provider test with up to four related excerpts. A
fixed PEP 8 + PEP 257/20/7 one-shot harness option is implemented and its
7 focused offline tests pass; full service suite passes 216/220 with four
skips. The PEP 8 current extract is 4,096 characters; related PEP HTML
passes the bounded text extractor in anonymous preflight. The owner approved
interrupting the long-running service, the two fixed QA requests completed,
and the service restarted with the protected credential. The earlier
protected-credential/model-list check while the old service was active may
have affected it; this is not proven as the generic failure's cause. Brand
criteria and preliminary collision findings are recorded in
[the brand direction screen](../research/BRAND_DIRECTION_2026-10-04.md);
there is still no selected name.

**2026-10-04 version 0.12.22 conversation usability:** The User reply composer
now identifies the selected target author and a bounded plain-text excerpt,
including reply-to-reply; the action says **Post reply**. A missing target is
reported rather than guessed. Safe related-page titles become the primary
links in Pages, with the hostname underneath; retained restricted URLs remain
inert. This is presentation only: post targets, matching, capture, provider
and publication boundaries are unchanged. Offline and isolated-Chrome evidence
passes: full extension suite 884 passed, one skipped, zero failed; focused
restricted discussion panel 36/36; secret scan zero findings across 181 files.
The isolated Chrome popup passed 14 visual states (including Reply and Pages)
with zero uncaught exceptions or horizontal overflow at 410 px User / 380 px
Developer content width. Independent trust review found two reply accessibility
gaps and verified their fixes: the text box describes its target, and a missing
or deleted target disables Post with guidance. Focused panel/controller/policy
tests pass 71/71. Actual screen-reader behavior was not exercised. Owner live
popup confirmation is still needed after Chrome Reload.

**2026-10-04 version 0.12.21 catalog recovery and connection clarity:** The
owner saw `Local service unavailable` after a service restart. The service
responded on 4174 and passed the configured Origin's CORS preflight. A read-
only projection check found the actual cause: ADR-039's new-capture host guard
also rejected seven *historical* Source URLs in the 71-Source/65-Topic local
catalog, so the strict client discarded the entire otherwise healthy catalog.
[ADR-040](../decisions/ADR-040-retained-source-projection-compatibility.md)
separates retained catalog/related DTO validation from new-capture eligibility.
Actual local catalog validation now passes (71/71 Sources), as do related
projections for all 71 Sources; no stored row was changed, and no URL/content
was printed. New capture, post-origin links, and ChatGPT context still reject
the credential hosts. A separate popup-to-background pairing failure now has
its own safe status and no longer presents a misleading token field. A
synthetic service-outage/reopen test covers durable pairing without touching
the owner's token or fixed port. The owner still needs to reload the unpacked
extension and confirm the live popup.

Chrome also listed `relatedChoices.children.forEach is not a function` and
an undefined `.replace` error. The first expression is absent from current
HEAD (`Array.from(...)` is used); current locale keys/draft modes do not
reproduce the second. These may be stale loaded-code or retained Chrome
error entries, not the established catalog failure. A focused HTMLCollection
regression and an isolated Chrome check now capture uncaught runtime errors
on popup reload; startup and 13 states pass with zero exceptions and no
horizontal overflow. The full extension suite passes (880 passed, one skipped,
zero failed); the focused retained/pairing/controller/panel tests pass (73/73),
and the secret scan found zero findings across 181 files. Independent trust
review found and closed the new-post origin and case-varied OAuth-query gaps;
it approved the final read-only compatibility boundary. The actual owner
Chrome popup remains unverified until the extension is reloaded. Do not rotate
pairing or delete state on this evidence.

**2026-10-04 bounded live Insight QA:** The owner explicitly authorized up to
two deliberate live Responses requests per relevant Insight change, using
only public signed-out pages, at most 4,096 characters of current-page text
and four public related titles/URLs; no retry, private data or automatic
Share. [ADR-038](../decisions/ADR-038-bounded-owner-live-insight-qa.md) records
that gate. A standalone opt-in harness acquired the fixed port before using
the protected ChatGPT grant, did not read the local Source catalog, and
completed one real-public MDN HTTP Overview probe with the listed GPT-5.5
model: one Responses request, 76-word private forum opener, one relevant
question and zero external citations. The current-page observation was
specific and plausible; related context was not verified or cited. Four
focused offline checks pass. This is a live backend/prompt quality sample,
not a rendered-Chrome or popup E2E quality pass. The normal local service
was restarted on 4174 afterward. A read-only catalog audit exposed at least
one previously retained account/credential-site URL despite the public-only
profile policy; its content was not read or sent to the provider.
[ADR-039](../decisions/ADR-039-credential-host-capture-guard.md) records a narrowly
scoped extension guard rejecting exact password/account/auth/login/SSO host
labels (including the observed credential host) before future capture;
existing rows remain. An independent trust review confirmed the narrowing
and noted generic authenticated sites cannot be detected reliably. The
extension suite passed 872/873 (one pre-existing skip), the service suite
206/210 (four opt-in skips), and the extension secret scan found zero
findings across 179 files. Reload the unpacked extension for the new guard;
the separate public-only browser profile is still required. Owner-directed
cleanup of previously stored rows remains open; no silent deletion or provider
expansion is authorized.

**2026-10-04 version 0.12.20 unified Discussion UI:** The owner asked to
remove the separate Insights tab and make writing or requesting an insight one
conversation workflow. [ADR-037](../decisions/ADR-037-unified-discussion-insights-ui.md)
records the presentation boundary: User Mode has Discussion and Pages; the
small Insight action sits beside the comment action, and an unchanged private
result appears directly below the composer with separate Share/Discard.
ChatGPT account, model, research-source and related-page settings are behind
Settings; Developer Mode retains its detailed workspace. The composer is above
long threads. The User view removes duplicate heading/counts and routine
prototype prose, but preserves author/robot provenance, a visible private-
draft marker, accessible completion status, and material scope/data controls
in Settings/docs. New contribution IDs and locally completed private results
receive a brief one-shot entrance; routine rerenders and restored results do
not. Buttons give short feedback; reduced-motion removes movement. A pending
post keeps its text and focus until confirmation. No AI call occurs on
navigation, opening Settings or popup reopen, and nothing posts automatically.
A read-only trust review found no new egress/publication path and requested
the private marker and accessible completion announcement; both are present.
The extension suite passed 871/872 (one pre-existing skip), the unchanged
service suite 202/206 (four opt-in skips), and the extension secret scan found
zero findings across 179 scanned files. Isolated Chrome visual checks passed 13/13
states at 410 px User/380 px Developer content width with no horizontal
overflow. A separate synthetic Chrome/local-service smoke passed pairing,
discussion posts/replies/edits, one-click insight, private recovery, exact
Share and withdrawal; it saw one synthetic insight request, zero runtime
exceptions and zero external extension requests. No live provider or real-
page quality pass is claimed for this UI change.

**2026-10-04 version 0.12.19 private Insight continuity and cleaner User Mode:**
The owner requested that a started insight continue when the popup closes and
that reopening preserve its private result. [ADR-036](../decisions/ADR-036-resumable-private-insights-and-clean-result.md)
scopes this to the paired local service: popup closure detaches its polling,
not the provider job; a bounded actor-bound lookup recovers the latest job for
the same catalog revision, Topic and Source. Completed results live only in
service RAM for up to 30 minutes; they are not written to SQLite or extension
storage and are removed at Share, Discard, reset, disconnect, account switch,
restart or expiry. No duplicate provider call or automatic publication follows
reopen. User Mode now shows the generated message with inline source icons and
Share/Discard, with routine pre/post prose hidden; concise activity states,
small navigation/action icons and reduced-motion support improve the ordinary
popup. Detailed controls/disclosures remain reachable in Settings/Developer.
The extension suite passed 865/866 (one pre-existing skip), the service suite
202/206 (four opt-in skips), and the extension secret scan found zero findings
across 179 files. An isolated Chrome visual run passed all 13 synthetic screens
at 410 px User/380 px Developer width with no horizontal overflow. A separate
actual-Chrome/local-service synthetic smoke closed and reopened the popup after
generating a private Insight, recovered it, and shared exactly once; it made
one synthetic insight request, had zero runtime exceptions and zero external
extension requests. A running-job detach/recover path and different-source
refusal also have focused controller tests. The normal local service was
restarted on port 4174 after integration. A live provider run of this new
reopen behavior is not claimed. Independent trust review caught a startup
race in which an initially `choose-topic` popup could miss later recovery;
the ready-transition gate and its focused regression test now cover it.

**2026-10-03 version 0.12.18 insight review simplification:** The owner found
the separate Preview and Share steps redundant. The formatted private result
is now the only preview; Share is the single deliberate publication action,
and Discard remains available. The service still attests the exact unchanged
generated body and bound target; a manually pasted draft cannot be shared as
a robot contribution. Verification and Chrome evidence are recorded below
now: the full extension suite passed (858 passed, one pre-existing skip), the
focused insight/indicator suite passed (47/47), and secret scan found zero
high-confidence findings across 179 files. An isolated actual-Chrome popup
visual run passed 13 synthetic screens at 410 px User/380 px Developer width
without horizontal overflow; the local-service/Chrome integration smoke
passed direct generated-insight sharing, withdrawal and its other synthetic
flows with zero runtime exceptions or external extension requests. The owner
local service was restarted on port 4174 afterward. No live provider call was
needed for this UI-only change; owner live insight verification remains open.

**2026-10-03 version 0.12.17 immutable robot follow-ups and related-source audit:**
[ADR-034](../decisions/ADR-034-published-followups-and-robot-provenance.md)
is implemented for this owner-local synthetic-actor prototype. A generated
opener is kept unchanged or discarded. An owner-authored direct question under
that opener exposes **Get insights**; the server selects and verifies only the
published robot parent and own human question before one user-triggered,
stateless provider request. A short private reply may be shared unchanged
under that question or discarded. Exact generated body, Topic/source/target,
actor, operation and revision are checked server-side before an agent post;
the short-lived operation is consumed after successful persistence. Arbitrary
direct `share-insight` writes and replays are rejected. Own human/robot
contributions may be withdrawn; visible descendants preserve a `Deleted by
user` tombstone, while wholly withdrawn threads are omitted. Historical
manual-import roots remain readable, not retroactively attested. Backend suite:
201 passed, four opt-in skipped. Restricted extension suite: 858 passed, one
skipped. An isolated Chrome popup smoke test passed 13 synthetic screens,
including no horizontal overflow and reachable focus. A separate actual
Chrome/local-service smoke passed with a temporary profile and intercepted
synthetic pages: one-click current-page read, mocked provider result, exact
citation preview, server-attested Share, withdrawal and source-link navigation,
with zero runtime exceptions or external extension requests. It exposed and
helped fix a busy-transition bug that previously cancelled the completed
server proof just before Share. Neither smoke used the real provider or a
real page; a live ChatGPT follow-up and real-account UI test remain open.

[ADR-035](../decisions/ADR-035-bounded-related-source-context.md) limits
each insight to five source references **including** the current page;
same-Topic candidates lead and service ranking order is retained. Related
pages provide title/URL only; the current page provides the bounded text.
The current implementation does send those candidate references to ChatGPT,
but optional provider web research may ignore or fail to open them. A
captured completed local-service `INSIGHT_TRACE` on 2026-10-03 recorded
`response.web_search_call.completed: 0` (and zero search started), which
establishes that this particular insight did **not** retrieve any linked
page through ChatGPT's web tool. It does not prove access failure at a
publisher; the tool was simply not used in that request. No Google-related
fallback is implemented; the unsupported/deprecated Google paths are noted
below. A future related-page text capture, forced additional research or
alternate provider/discovery route needs a separate privacy/usage/policy
decision. No new provider request was made for this audit.

**2026-10-03 product/prompt follow-up:** The 0.12.16 product popup now has a
first-use welcome state, Topic-first Discussion/Pages/Insights views and
separate Settings. Thirteen synthetic actual-Chrome states passed, including
keyboard access, no horizontal overflow, retained draft controls and a useful
no-topic action instead of a disabled composer. [ADR-033](../decisions/ADR-033-short-insight-openers-and-inline-sources.md)
records the new short forum-opener prompt and inline source links. Provider
annotations become validated inline references in the private preview and
AI-labelled shared posts; they are no longer appended as a raw URL list.
An independent trust review found that model-written marker text could
masquerade as a citation. The generated-draft formatter now neutralizes any
unannotated URL before inserting validated references, and shared/edited
links have a neutral accessible label. New English shell strings are routed
through language-pack keys. The full restricted extension suite passes
852/852 and the backend suite 190 passed/four opt-in skipped; both secret
scans found zero findings. The final isolated-Chrome smoke pass covers 13
synthetic states without horizontal overflow. The provider's web tool can be
offered candidate URLs/domain restrictions but does not guarantee opening a specific
page; an inaccessible candidate should no longer dominate the answer. No
agent-initiated post-change live provider call or real-page quality claim is
made. The normal local service was restarted on the fixed 4174 endpoint so
it now runs the revised prompt. Lead diff review found no remaining blocker.
A local
loopback integration rerun could not bind port 4174 while the normal service
was running; the previous 2/2 pass still stands, and the prompt/citation
changes do not alter that transport.
An independent read-only web-tool check could not load the owner's earlier
[RTL](https://www.rtl.nl/nieuws/buitenland/artikel/5656001/poetin-roept-15000-nieuwe-militairen-op-leger-telt-nu-15-miljoen)
or [De Standaard](https://www.standaard.be/buitenland/president-poetin-beveelt-uitbreiding-russische-leger/35173633.html)
examples while [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
loaded. This illustrates an access difference between browser and web tools;
it does **not** prove which URLs the owner's ChatGPT request actually tried
or why that provider could not load them.

**2026-10-03 19:41 Berlin live checkpoint:** After the owner-supplied wait,
one explicitly confirmed synthetic-public `example.com` insight probe used
the protected saved ChatGPT connection. The normal fixed-port service was
stopped first to avoid concurrent refresh-token rotation; the one-shot harness
claimed the port and performed exactly one catalog read and one Responses
request. It returned `status=success answer_chars=1354 citations=1` through
the current strict parser/private-result path. The answer text, account data,
tokens and provider body were neither printed nor archived. No automatic
retry or sharing occurred. The normal service was restarted with persistent
pairing immediately afterward. This proves a real provider result can reach
the local private result adapter; it does **not** verify the revised popup's
end-to-end owner interaction, insight quality on a real page, or publication.
The temporary harness and tests were removed after the check. The GUI
app-shell redesign subsequently passed independent synthetic Chrome review.

**Related-page discovery follow-up:** The owner suggests using Google's
"related" feature when the local catalog is empty. Google's original
[Google Related extension](https://www.google.com/related/) is discontinued;
Google [removed the `related:` operator as unsupported](https://developers.google.com/search/updates)
in 2023. Its Custom Search [`relatedSite` parameter](https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list)
is deprecated, and the [JSON API](https://developers.google.com/custom-search/v1/overview)
is unavailable to new customers and scheduled for discontinuation in 2027.
Current third-party similar-site extensions may use their own data; this is
not evidence of a supported Google page-level related API. No automated
Google search, scraping, new permission, egress or paid service was added.
If the owner supplies a specific extension, investigate its mechanism before
deciding whether a user-triggered discovery action is worth a separate gate.

**2026-10-03 current checkpoint:** [ADR-032](../decisions/ADR-032-explicit-chatgpt-account-switch.md)
is implemented. Disconnect fences in-flight work, clears protected credentials,
attempts remote revocation, then removes the old non-secret registration while
preserving the installation host ID. The next Connect uses fresh dynamic
registration without an old login hint. A late restore cannot erase the new
account's protected token. The cancellation callback page now labels a declined
attempt without echoing URL parameters. Service tests: **190 passed, four
Windows opt-in skipped**; loopback integration **2/2**; secret scan zero
findings. Independent Trust review found no blocker. The updated backend is
running locally. The owner's second-account sign-in is still pending: a
read-only check showed the old registration has not yet been cleared, and
review found User Mode had hidden the connected account's Disconnect control.
Extension 0.12.15 fixes this: the account-settings disclosure is now reachable
whether or not a model is selected; the owner must reload the unpacked
extension before using it. An existing OpenAI browser session may independently
select the old account until the owner changes the active browser account.
No new insight request was made.

The Astra High-directed/Sol Medium-coded product popup refinement passed
**84/84** focused UI/package tests plus **28/28** account-access/package checks
and thirteen isolated Chrome visual checks,
including no horizontal overflow and keyboard access. User mode now puts
Topic, discussion and Create insight first; related pages are a counted,
collapsed disclosure, empty lists disappear, and mode switching is in
Settings. The ChatGPT account-switch control remains in the compact AI-insights
account disclosure. One synthetic/not-signed-in note remains to avoid implying a real
identity. This does not broaden provider or data scope. The three exact
temporary raw/trace diagnostic files from the completed investigation were
deleted; normal runtime has no raw log. The full restricted extension suite
passed **841/841** and the extension secret scan found zero findings.

**2026-10-03 actual owner-account diagnosis and UX push:** The owner asked for
agent-readable temp `.log` files, then explicitly approved local raw insight
request/response capture for debugging and agent-run tests using the saved
ChatGPT sign-in. ADR-030 defines the opt-in, bounded raw mode; normal mode
retains ADR-029's terminal-only structural trace. The agent ran one synthetic-
public GPT-5.5 research request through the protected saved login. It
reproduced `response-item-prefix`. The stream had eight completed items
(reasoning/search and one assistant message at index 7); the terminal
`response.completed/status=completed` had `output: []`. The mismatch is thus
observed, not guessed. No private draft was imported or posted. The owner has
now explicitly approved ADR-031's narrow complete-stream fallback for a
**private editable draft only**; implementation and trust verification are in
progress. No automatic Share or provider retry follows.
The backend raw/structure debug mode and tests are in progress. Independently,
the owner authorized an Astra High GUI orchestrator with Sol Medium coding
agent(s) for a minimal, app-transferable popup redesign, with synthetic
screenshots and no real-account GUI automation. No store/deployment/publication
gate is implied.

**2026-10-03 post-fix verification:** ADR-031 implementation passed the full
offline service suite (183 pass, 4 opt-in Windows skips), two loopback
integrations, and independent Trust review after closing an added/done content
contradiction. The actual second owner-authorized synthetic GPT-5.5 call did
not reach an answer: it returned `subscription_sharing_usage_limit_exceeded`.
No more provider calls or paid fallback are planned while usage is exhausted.
Because the provider omitted `Content-Type`, the client surfaced misleading
`response-content-missing`; a narrow failure-only classifier now maps an
offline replay of that exact bounded response to `rate-limit` without a
provider call. It cannot import a draft from a failed response.
An offline replay of the earlier completed raw stream exposed a separate
compatibility detail: opaque `reasoning.encrypted_content` differs between
added and done events. Excluding that opaque field from visible-content
consistency checks lets the *same previously captured completed response*
replay offline as a private result (1,666 answer characters, three citations)
without any provider request. A fresh live private draft is still unverified
because of the ChatGPT usage limit. The owner now asks to connect a different
ChatGPT account; current single-registration mapping is bound to the former
subject, so safe explicit account switching is being implemented. The local
pairing and discussions must remain unchanged.

**2026-10-03 diagnostic follow-up:** The owner requests meaningful logs so
the next live failure can be diagnosed from actual response structure rather
than another guessed condition. ADR-029 limits this to one content-free,
allowlisted `INSIGHT_TRACE` line in the local service's interactive terminal
for each deliberately clicked Create that reaches bounded SSE parsing. Earlier
transport/format/timeouts still use fixed codes and produce no trace. No raw provider/page text, account data,
IDs, URLs, tokens, new log file, automatic call or sharing. Implementation
and offline redaction/security checks are complete: service **173 passed,
2 Windows opt-in skipped**, extension restricted **838/838**, zero findings in
the synthetic secret-bearing trace test. Independent read-only Trust review
found no blocker. No new live result yet; restart the backend before the next
single deliberate public-page Create and report only the `INSIGHT_TRACE` line
plus the fixed result code, not raw provider output.

**0.12.13 owner result and offline follow-up (2026-10-03):** The owner paired
successfully enough to invoke Create, but the first post-0.12.12 live attempt
still returned `response-final-item-missing`. No raw provider response was
retained, so the exact rejecting condition is unknown. ADR-028 approved a
fully completed, identity-consistent assistant item as a private draft; our
implementation additionally demanded `response.output_text.done`. This is
now optional, but when emitted must match item ID, indices and exact text.
The separate `content_part.done` consistency check remains. If rejection
persists, fixed content-free `response-item-identity`, `-conflict`, `-prefix`
or `-text` codes identify the boundary without exposing provider material.
No agent-made provider call, auto-retry or auto-share. Full offline service
**171 passed, 2 Windows opt-in skipped**; extension restricted **838/838**.
Independent read-only Trust review found a prefix type/status mismatch path;
it was fixed, covered by negative tests and re-reviewed without a blocker.
Owner can restart the service, reload the extension and make at most one
deliberate public-page Create attempt, reporting only draft-or-fixed-code.

**0.12.12 checkpoint (2026-10-02):** The owner explicitly approved ADR-019 C
durable local pairing and ADR-028's strict completed-item private-draft
exception. The local service now requires explicit interactive initialization,
stores only an ignored verifier, resumes pairing across restarts, and exposes
rotation/revocation while stopped. The extension migrates without promoting
old session credentials, stores the new key in trusted local storage only
after a durable-health check, keeps it on outage and compare-clears it on a
confirmed 401. No backend auto-start or new Chrome permission. The provider
fallback requires matching response/item/part identities and completed status,
rejects contradictory/failure/refusal events and imports only a private
editable draft; Share is still explicit. Independent Trust review identified
and led to closure of five contradictory-event cases. Full offline service
tests: **170 passed, 2 opt-in Windows tests skipped**; extension restricted:
**838/838**. Actual owner restart/pairing and successful live Create are still
unverified. One fresh `--pairing-init`/token entry is required after upgrade;
the old per-process key cannot be promoted. The isolated Chrome smoke was
updated for local-token retention, same-token service restart and rotation,
but did not run to completion here: the sandbox denied Chrome process spawn;
an elevated retry reached the listener and could not bind fixed port 4174.
No owner process or browser profile was stopped or modified. This is a test
gap, not a Chrome pass. See current setup in README.

**2026-10-02 current owner decisions:** ADR-019 C's exact persistent,
revocable local-pairing package is now explicitly approved. Backend and
extension implementation is underway; the existing session-only pairing
remains active until a tested checkpoint is committed. One fresh pairing will
be required after upgrade, with no automatic server start. The owner also
reports `response-final-item-missing` after the 0.12.11 diagnostic: a completed
assistant `output_item.done` appeared in the bounded stream, but the final
`response.completed.response.output` omitted that assistant message. Official
OpenAI Docs normally include it in both places. We continue to reject it and
do not import delta or missing-final text; a separate explicit owner decision
has been requested for a strictly bounded private-draft fallback. No provider
call, raw response capture or retry was performed by the agent.

**0.12.11 owner 0.12.10 result (2026-10-02):** model shown as “5.5”; deliberate Create
returned `response-no-message`. The service reached a completed Responses
event, but its final `output` array contained no assistant `message`. This is
not proof of a web-search failure, a blank model answer, or a parser bug.
Official OpenAI Docs show normal web-search responses containing a search
item **and** an assistant message; finalized text can also appear in stream
events, but text absent from the authoritative final output is not imported.
The next offline increment classifies only final-output structure (empty,
search-only, reasoning-only or other) and whether a finalized assistant item
or text event was emitted before completion. No provider content, IDs, URLs,
queries or token counts are logged or reported; no automatic retry or unsafe
delta fallback. A user-controlled tool-free option in Insight settings can
isolate web-search behavior while leaving the one-click default unchanged.
Full service **163 passed, 2 opt-in Windows tests skipped** and extension
restricted **835/835** pass offline for this increment.
Owner-account result after this increment remains pending. Persistent local
pairing has **not** been activated; ADR-019 C still awaits explicit approval.

**0.12.10 owner insight result and offline correction (2026-10-02):** owner confirms
Windows protected ChatGPT sign-in appears to survive restart. A subsequent
deliberate Create returns `response-empty-output`: the bounded stream reached
`response.completed`, but the parser found no usable final assistant text.
This does **not** reveal whether the response was blank, a refusal, a
tool/reasoning-only result, an unfinished message or unsafe control text. The
service now distinguishes those possibilities with fixed content-free codes,
still rejects each without importing partial output, and never logs provider
content. The prompt no longer contradicts the required nonempty final answer:
when evidence is insufficient, it requests a short uncertainty explanation
and question instead of silence. No automatic provider retry or extra call was
made. Focused service **42/42** and extension client/controller/panel **48/48**
pass offline; full service **163 passed, 2 opt-in Windows tests skipped** and
extension restricted **834/834** pass. A useful live insight is still unverified;
the owner may make one
deliberate public-page Create attempt after restarting backend and reloading
extension, then report only the fixed code or that a private draft appeared.
Pairing remains session-only under ADR-019 C's pending security gate; the
owner has been asked separately whether to activate that exact package.

**2026-10-02 approved local-service follow-up:** the two separate owner
approvals are implemented as [ADR-026](../decisions/ADR-026-headerless-complete-sse-fallback.md)
and [ADR-027](../decisions/ADR-027-windows-protected-chatgpt-refresh.md).
An HTTP 200 with no/empty `Content-Type` is accepted only if the <=256 KiB
body is a complete typed SSE sequence ending in `response.completed`; normal
completed-output validation still applies. No non-SSE import, body/header
logging, automatic retry or additional provider call. On Windows, a rotating
ChatGPT refresh token is protected by CurrentUser DPAPI in an installation-
scoped local file, restored once after fixed-port binding and deleted on
Disconnect with provider revocation attempted. Access/ID tokens stay RAM-only;
without secure storage, sign-in is RAM-only. The extension pairing token is
still process-scoped. Service unit tests **162 passed, 2 skipped** (the two
real-Windows tests are opt-in under the offline guard); the separate synthetic
DPAPI Windows run passed **3/3**. This is offline mechanics evidence, not a
successful live research or owner-account restart result. The planned
independent review agent was unavailable due usage limit; lead reviewed the
bounded parser, credential path, race and failure behavior. Remaining check:
owner restarts backend, pairs anew, signs in once if necessary, then verifies
reconnection after another restart and optionally makes one deliberate public
Create attempt. No owner process or real account was touched by tests.

**0.12.9 first live research response-format follow-up (2026-10-01):** the
owner's deliberate Create action returned fixed `response-content-type`.
This proves the local service received a 2xx Responses reply whose media type
did not pass its SSE check; it does not identify the actual media type or prove
a provider, account, model or local-service cause. Official OpenAI Docs require
`stream: true` and consuming streamed events for this ChatGPT-plan route.
The service now classifies a non-SSE 2xx response only as fixed
`response-content-json/html/text/missing/other` and accepts syntactically valid
SSE with optional whitespace before parameters. The extension carries only
those fixed codes with brief English guidance. No raw header/body, request ID,
token, account or page text is added to logs/UI; no non-SSE success is imported
and no automatic retry occurs. Service **152/152**, extension restricted
**834/834**, focused client/panel/controller **48/48** pass; independent
read-only security review found no blocker. Indicator/package **571/571** and
secret scans **0/73** service and **0/176** extension also pass. The new
synthetic Chrome integration smoke could not bind fixed loopback port 4174
while the owner's service was running; no owner process was stopped or modified.
No live inference success is claimed. Restart the backend and reload the
extension, then the owner may make one deliberate public-page Create attempt
and report only the new fixed
code. Each attempt can count toward provider usage and the process's five-per-
hour cap; do not loop on failure.

**Owner 0.12.9 result and two follow-up approvals (2026-10-01):** after installing
the new diagnostic, the owner reports `response-content-missing`: a 2xx
Responses reply had no `Content-Type` header. This does not establish its HTTP
status, body shape or root cause. No further owner retry is requested yet.
The owner asks whether ChatGPT authorization can survive backend restarts;
today access/refresh/ID tokens are RAM-only and necessarily disappear on
process restart. Official OpenAI Docs describe protected local credential
storage and rotating refresh-token renewal, but ADR-024 did not approve that
retention. The owner separately approved (1) a narrow HTTP-200,
missing-header fallback that accepts only a bounded, fully completed SSE body,
and (2) OS-protected refresh-token persistence with revoke/delete on sign-out.
Neither scope is implemented in 0.12.9; Git-push permission did not supply
either approval.

**0.12.8 real-popup width correction (2026-10-01):** the original layout smoke
used `popup.html` as a forced-width tab and missed Chrome action-popup sizing.
An actual action-popup screenshot was about 55 px wide. Root `max-width`
constraints circularly capped the 410 px User body to Chrome's initial tiny
viewport. Removing those constraints and testing via `Extensions.triggerAction`
now measures User body/client width **410 px** (425 px outer width including
the scrollbar), Developer **380 px**, no horizontal document overflow, wrapped
long text and a visible sticky action bar in the actual 510 px popup viewport.
Extension restricted **834/834** and isolated real-action Chrome smoke pass.
Reload the unpacked extension to receive the correction. No provider call or
owner browser profile was used. The owner explicitly approved pushing the
three preceding commits through 0.12.8 to the named GitHub `main`; that push
succeeded. The popup-width correction was subsequently pushed as `b5c41b4`.
The owner then granted standing permission to commit and push checked,
in-scope changes to this repository. This does not waive provider, data,
spending, deployment, store/publication or other separate owner gates.

**0.12.8 public-profile one-click workflow (2026-10-01):** the owner explicitly
approved both scopes in [ADR-025](../decisions/ADR-025-public-profile-autocapture-and-one-click-insights.md).
After local pairing and the existing Chrome HTTPS grant, eligible active public
pages now start window-bound background matching automatically; a deliberate
Stop stays effective until explicit resume. User Mode hides connected-only
setup, keeps Create insight and the selected model visible, lists models on
connection and defaults to the last displayed model. One Create click reads
and reattests at most 4,096 characters of the current page, then sends that
text and selected related source titles/URLs through the local service to
ChatGPT. Related bodies, cookies and credentials are excluded; candidate
exclusions are reconstructed and validated server-side. AI output remains a
private editable draft; publication still takes a separate action. Read-only
service reconnection retries do not retry inference or posting. Fixed in-memory
diagnostic codes replace opaque research errors. Service **150/150**,
extension restricted **834/834**, indicator/package **571/571**, focused
client/controller/panel **48/48**, and background adapter **88/88** pass;
secret scans **0/73** service and **0/176** extension. Isolated Chrome synthetic
one-click, popup geometry (410 px, no horizontal overflow, sticky action),
and automatic matching/shared-comment smokes pass with **0** extension
external requests or runtime exceptions. A read-only Sol Medium trust review
found no security/privacy blocker. No live owner account inference is claimed;
the owner must try one deliberate Create action and report only fixed status
codes if it fails. Native HTTPS access still needs a one-time browser gesture;
neither legal/store clearance nor private-page capture is approved. GitHub
push of this checkpoint was explicitly approved and succeeded. The later
popup-width correction was also pushed after approval.

**0.12.7 empty-draft UI clarification (2026-10-01):** code inspection confirms
the owner's empty editor is the manual draft, not a completed ChatGPT result;
model listing only supplies model choices. The User panel now labels that
editor clearly, displays a single next-step cue through context/model/text/
consent/Create, and distinguishes running, failed and generated states. It
does not generate, retry, send or share automatically and changes no backend
or permission. The owner has not yet confirmed pressing Create insights; live
completed inference remains unverified. Reloading the unpacked extension is
enough for this UI-only update; the service need not restart. Extension
restricted **819/819**, indicator/package **557/557**, extension secret scan
**0/173** and diff check pass. No actual Chrome/provider test was run for this
checkpoint while the owner tests the current local service. Push remains
blocked pending explicit owner approval of the named remote/payload.

**Owner model-list result and empty-draft clarification (2026-10-01):** the
owner now reports a populated live model list. This establishes that catalog
retrieval works in their current local setup, but not that the earlier
`catalog-body` failure was caused by size alone. The empty field they then saw
shows the static manual-draft hint: listing models never generates an insight;
preparing context starts with an empty draft. Only a separately invoked,
successfully completed Create insights operation fills it. Service and client
reject blank provider output, so a successful completion should not produce
an empty draft. It is not yet known whether the owner pressed Create insights
or saw an error status. No provider call was made by agents; live inference and
answer quality remain unverified. The 0.12.6 commit is local: auto-review
rejected the push pending explicit owner approval of the named remote/payload.
Do not retry it without that approval.

**0.12.6 live catalog-body follow-up (2026-10-01):** after restarting and
retrying, the owner reported a connected account whose explicit model-list
request returned fixed `catalog-body`. This establishes that the backend reached
the model-catalog read and rejected its body; it does **not** prove the cause
was size. The previous 256 KiB body cap was shared with research output. The
catalog alone now has a 2 MiB cap and a 2,048-entry structural limit, still
returning at most 100 validated displayable choices. Fixed codes distinguish
too-large, stream and encoding failures. The service retains only 20 fixed
model-list outcome codes in memory behind the paired diagnostic route, and
Developer Mode retrieves them on request; the extension retains its own fixed
codes only in popup memory. No raw provider body, token, account, page material,
URL, disk log or telemetry is added. The User UI keeps Topic and discussion
first, opens the ChatGPT setup path when needed, hides account identity and
places diagnostics in Developer Mode. A paired popup checks only local sign-in
state on open; model listing and research remain explicit. No provider request
was made by agents.
Offline service **147/147**, extension restricted **817/817**, indicator/package
**555/555** pass; service/extension secret scans found **0/73** and **0/173**.
The owner's running service still holds port 4174, so no isolated Chrome or
loopback test was rerun here; do not interrupt it. The next evidence is one
owner-clicked list request after restarting 0.12.6. Live model availability,
research, provider web-search eligibility and insight quality remain unverified.
The attempted independent Sol Medium trust-review agent hit a usage limit;
lead review and focused tests passed, but independent review remains open.

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

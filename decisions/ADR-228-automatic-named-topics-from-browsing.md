# ADR-228: Automatic named subjects and news events from browsing

Date:2026-10-29

## Current priority: general websites, without a Wikipedia dependency

Bounded indexed discovery now also passes actual owned PostgreSQL checks:10 new
retrieval cases plus all prior25+8+10+12 reports. A normal production coordinator
uses the existing prepared vectors,95 HNSW candidates, up to32 indexed title
postings and the explicit seed, then verifies/re-ranks at most128 binary64 inputs
into at most64 observations. Durable per-Source queues prioritize urgent work
while advancing old work; no second model or crawler is started. Partial cohorts
retain valid existing selections, and a new broader parent can attach to a
parentless subject while retaining its ID. See
[retrieval proof and limits](../apps/local-service/portable/canonical-v4/drafts/AUTOMATIC-RETRIEVAL.md).
Representative recall, multilingual/model-specific precision and real UI latency
are still unproven. The component remains unregistered and is not running live.

The next shipping bridge is author context, public feeds/search and the complete
profile18. A new root should retain its existing canonical Source-container
destination and acquire an immutable logical scope/caption in the same physical
transaction. Reuse the private runtime prepare/complete primitives behind a new
execute-only wrapper, preserving the actor gate and receipt-before-Source order.
Take new metadata fences after canonical domain locks and before completion;
test the full lock order rather than placing a head lock ahead of old domain
operations. Exact replay must agree with the originally recorded scope, and an
old receipt must not authorize retrospective attachment of a new scope.

Keep the writer's most-specific supported scope separate from owner browsing
breadth. Freeze its ID/meaning when typing starts; additional evidence revisions
or first-parent attachment alone should not stale a draft or change its target.
A page-context draft may finish as that page context even if a shared subject
appears meanwhile. Human roots, AI new-thread publication and replies need the
same explicit intent rule. Old roots need an honest historical/page-context basis
instead of being relabelled as if their authors chose a newly discovered topic.
Author-owned posted captions can support occupied-topic search after Source
withdrawal; erased Source-derived labels/hashes cannot be identity shortcuts.

Accepted Source context is not proof of an is-a parent. Attach new named scopes
under broad context unless a more specific branch is justified, and reuse fixed
node aliases. For example, an article classified as GTA does not make its named
publisher a subtype of GTA. Current parent containment concerns literal focus
and evidence subsets, not an automatically learned universal taxonomy.

The provider-independent storage component now passes an actual owned PostgreSQL
run:12 general subject cases plus original25, metadata8 and Source-binding10.
It stores names/literal nested scopes, preserves UUIDs across identical-material
renewal, checks full candidate snapshots and Source fences atomically, permits
MVCC readers/ordinary revision writes during publication and withdraws erased
derived evidence while preserving human discussion records. See the
[component proof and limits](../apps/local-service/portable/canonical-v4/drafts/AUTOMATIC-SUBJECTS.md).
Its source adapter recomputes the explicit v2 planner; neither app nor crawler
can supply a publication plan or read private prototypes directly. Source-only
installation: the complete schema18/profile/startup, author-selected context,
occupied-topic search/UI, recovery and live
concurrency/cutover remain required. Current Source-derived metadata withdrawal
does not recover an old UUID from a forgotten name/hash; human-owned context
integration must handle retained occupied discussions. First-parent attachment
is now tested; replacing an existing nonnull parent remains prohibited.
Identity continuity over a compatible matcher change needs an explicit test and
integration policy before rollout. Static-label aliases must also avoid creating
duplicate logical topics for already supported fixed hierarchy nodes.

The owner explicitly requires normal websites, videos, products and novel news.
The Wikipedia-heavy crawler inventory is not a reason to make exact sitelinks
the core assignment mechanism. They remain optional public enrichment.

Real general-web development now supports the named-subject path: the owner's
recipe/video pair yields Kapsalon from stored paired E5; a new closed cohort
supports Red panda, Giant panda, Nintendo Switch and Steam Deck. See
[general-web evidence and limits](../apps/local-service/experiments/automatic-topic-discovery-v2/RESULTS.md).
Product results currently identify families; German matching and model-specific
leaves remain unresolved. The alternative v2 policy permits two distinct
materials from the same publisher for a subject, preserving deduplication,
cohesion and conflicting-root checks. Publisher/instructional boilerplate needs
additional guards. This does not claim event equality or independent reporting.

The application planner has an explicitly fingerprinted v2 entry, opaque stable
IDs, bounded candidate reuse, Source witnesses and visible-cycle rejection.
Frozen v1 remains unchanged. The generic persistent publisher is still missing:
complete hierarchy18 must store provider-independent subjects/evidence, validate
current Source/version/receipt/stamp/generation and revision CAS atomically,
withdraw erased Source-derived names/prototypes/membership, and preserve human
posts/routes and the exact author-selected context. Never make new names require
an existing Wikipedia record or an LLM call on a reader's critical path.

The earlier provider registry's8 metadata checks and the subsequent10-case
Source-binding/race extension are both included in the new accepted run. Its
maintained catalog is now authenticated as50083bc7. This supersedes the earlier
SOURCE-only/stale-catalog status; all prior results remain historical evidence.

General extraction repairs are also source-only; no live service was cut over.

Status: Implementation direction. Bounded pure proposal prototype and first real
development diagnostic implemented; dynamic registry, publication metadata,
prospective validation and live integration remain open. No new SQL migration,
index, public topic or assignment is activated by this ADR.

The owner explicitly requires topics to emerge from visited pages, including
events that did not exist before. Their names must tell a person what they are
commenting on. The live fixed20-node classifier solves fast conservative routing
into known subjects; it cannot discover/name every new subject or news event.
Permanent manual approval/training for every new event cannot be the growth path.

## Evidence changing the design

The subsequent [real hard-case comparison](../apps/local-service/experiments/automatic-topic-discovery-v1/RESULTS.md)
changes the interpretation of the initial success below. Across22 declared
articles,12 usable/10 unavailable, paired E5 complete-link and centroid each
produce4 correct and17 wrong event pairs; connected components produce62 wrong
pairs. Title-only preserves one true pair and misses three. A separately pinned
compact multilingual paraphrase encoder also leaves false/missed event pairs;
headline+lead0.7 gives3 true/1 false/1 missed on this DEV cohort. No tested
geometry-only policy is accepted for specific event publication.

Broad named subjects and specific events need different evidence. E5 can retrieve
neighbors quickly while a bounded focus/context check decides whether the common
scope supports an event or only a broader subject. A medoid event headline is not
an adequate name for a cluster of that person's different achievements/profile.
Publication constraints must not equate publication and event time: one same-event
report arrives17days later; one updated profile has an old publication date.
Continue registry work with this distinction; do not ship the initial0.90 rule,
lower thresholds after looking at final TEST or silently install the new encoder.

The first ten declared DEV articles yielded four usable observations and six
retained policy/access/extraction refusals. Without predefined child names, the
bounded paired-E5 prototype grouped the two physics-announcement articles and
the two chemistry-announcement articles separately: two correct candidate pairs,
zero cross-event pairs, zero missed true pairs. This is four correlated DEV
documents, not fresh final validation, representative precision or approval for
production. Publisher/search subject review is Root-only.

All four real articles received **no accepted root** from the installed classifier.
Consequently, discovery must also process unresolved material; a hard requirement
to accept an existing root would prevent useful novel topics from being found.
Do not weaken the existing classifier thresholds to hide this coverage failure.

The Source contract currently retains title/body embeddings and no publication
date. Visit recency is not event/publication time. The event prototype therefore
keeps all four event candidates provisional. Manually annotated gold dates were
never passed into its inputs. Its automatically selected titles initially kept a
generic congratulations headline; equal-medoid ties now prefer a title containing
an explicit year. This improves context, not publication-date provenance.

Receipts are `data/automatic-topic-development-{capture,additional-capture,
features}-20261029/result.json` and the Root audit. Exact first feature result:
`897a4d450ab623f55227fec6c990573a381afae8562fbf4490fa61c83f2422f0`.
The closed E5 run exited0, disposed its encoder and checked source/input pins.
All original unavailable outcomes remain; no old hierarchy TEST was repurposed.

Same-response metadata DEV subsequently retained all four new allowed captures.
Two articles supplied machine-readable publication claims: Cambridge a calendar
day, Berkeley a timestamp. UW and Caltech remained unknown. Normalized dates are
bound to the current response/observation hashes; the four title/body hashes
still match the earlier encodings, but new response identities are not aliases
for the old Source inputs. This does not authorize rebinding live embeddings.
The collector never substitutes annotated gold event dates or visit time.

Actual metadata result:
`8479d0da2ddf9efdf5e0abfa7560bc134f9c7d6d2f349e4579475527ed57cb39`,
66.03s for the policy-paced four-page HTTP batch,0.9-1.3ms per native DOM
extraction. All39 source pins, owned browser exit/profile cleanup and zero browser
external requests passed. Nine separate native Chrome fixtures and a two-document
response/CSP check pass;46 joined pure collector/DOM/normalizer tests pass.
These are Root-only extraction/coverage results. They are not live Source
metadata integration, event-time truth, assignment quality or UI latency evidence.

Read-only live inspection found installed pgvector0.8.2 and `vector_mirror`
columns in embeddings/fixed_references, with no HNSW/IVFFlat index. Six read-only
distance queries over these four retained DEV vectors agreed with exact binary64
cosines within1.09e-7. This is operator/precision evidence, not index recall or
throughput. No production index or row was changed.

## Registry and assignment

A read-only source-mix count now finds65,744 Wikipedia Sources among66,148 total.
A fixed public Wikidata pilot resolves24 predeclared multilingual article URLs to
eight correct entity identities, with no owner inventory egress. Exact sitelinks
provide a direct named-subject path for this corpus; labels alone cannot resolve
homonyms. Keep provider IDs separate from persistent opaque registry IDs and
mutable multilingual names/revisions. Cache bounded public metadata enrichment
outside page reads; do not send personal browsing inventories by default.

An unregistered SQL building block and adapter now implement public entity
metadata storage and stable UUID/version behavior. Eight separate native checks
are composed in the maintained owned fixture, with original semantic25 unchanged.
Actual owned PostgreSQL checks now pass eight metadata cases plus the original25
semantic regression cases, with exact normal cleanup and no live change. Until
the complete schema18 Source/context/search integration, this is no live topic
registry or assignment authority. Provider identity is not
general-page linking or discussion ancestry; importing P31/P279/taxon relations
as one undifferentiated parent relation remains prohibited by the design.



The next implemented DEV candidate combines shared literal headline focus with
stored-E5 cohesion and independent source support. It automatically forms named
subject branches, including Physics/Chemistry prize editions, without a supplied
topic list or LLM call. See the [frozen development policy](../apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json).
This supplies subject scopes, not proof that all their pages describe one event;
the earlier event errors remain errors. Preserve that distinction in kinds,
labels and UI. A broad person subject must not carry one member's event headline.

At0.8 the inspected12-article DEV gives9 proposals/11 covered pages, median2.68ms
for bounded naming/hierarchy. This is promising implementation evidence, not
publication acceptance. Same-name/different-person ambiguity required an explicit
partial-name guard; multilingual/plural/alias and new-domain tests are still open.
Unknown roots are not conflicting roots, but they cannot bridge two known senses
or acquire an invented classifier path. Only strict name-focus/member containment
currently supplies inferred subject ancestry. Keep existing accepted Source paths
as separate facts. The source/artifact/policy is frozen before new validation.

Keep the fixed embedding/classifier model independent of a growing named-topic
registry. A new story must not require registering a whole new classifier head,
duplicating every existing vector under a new model or reclassifying every page.
Use persistent opaque topic IDs, separate mutable labels, explicit kind
(`subject`, `event`, provisional) and versioned evidence/prototypes. A supported
new topic can temporarily have no trusted parent; do not force an arbitrary
broad label. Add ancestry only when supported, keeping a forest acyclic.

Use existing exact Source/input witnesses and a declared paired representation.
An assignment depends on Source version, operation/digest/body/title identities,
representation, topic evidence revision and policy. Recheck them in the commit
transaction. Stale candidates are discarded, not rebound to a newer Source.
Do not infer ancestry, confidence or a probability directly from cosine similarity.

Implement an explicit additive canonical hierarchy18 profile/migration for the
registry and its protected routines. Keep migrations1-17 unchanged. Provide
roles/readiness, current-Source membership, immutable root context, proposal
state, prototype dependency/erasure and indexed search/read boundaries together.
Do not silently install an untracked side schema to evade profile checks. Import,
ordinary startup and user HTTP cannot install or activate schema/model changes.

Use one bounded background worker shared with foreground-priority work. Query a
small candidate set of topic prototypes, then rerank exact retained vectors and
check group cohesion, conflicting candidates, independent inputs and temporal
constraints. No catalog-wide refit/scan on a page read or post. Unknown or
ambiguous input remains clearly page-only and writable under the existing exact
Source/account/document rules. A singleton can supply a provisional page label;
it is not automatically evidence of a coherent shared topic.

Evaluate subject continuity separately from event identity. Two reports about
one award can share an event; next year's award or a later development about the
same person must not be silently merged into it. Record publication/event-time
provenance and precision separately from first observation time. Unknown dates
stay unknown. Add a same-document/crawler-response metadata observation bound to
the Source operation; never import evaluation annotations into runtime evidence.

The existing prototype requires complete pairwise support within at most64
observations (2016 pairs), rejects competing-group ties, and collapses duplicate
relations before counting independent support. It is one candidate policy, not
the final promotion criterion. Its0.90 threshold is not inherited from Related
and is not a probability. Cross-year, same-entity/different-event, late-arrival,
multilingual, incidental-mention and novel-topic tests must inform the decision.

## Fast retrieval and names

Use pgvector for indexed prototype retrieval and exact binary64 reranking for the
final policy. Measure ANN candidate recall separately from assignment precision,
including unresolved roots and changed/erased prototypes. A missing/stale index
cannot grant a match; cache or page-only fallback preserves reading/commenting.
Start with a bounded reference and build an index only in an owned fixture before
production. Do not claim that the current unindexed columns already provide it.

The [pgvector0.8.2 documentation](https://github.com/pgvector/pgvector/tree/v0.8.2)
supports cosine and approximate search; HNSW trades build/memory cost for query
speed and needs no training stage. This is a candidate implementation choice,
not a measured production capacity claim. Its installed version requires no new
software download for the present design work.

Create the first useful label from a representative captured headline and retain
its Source attribution. Names may improve later without changing IDs. Do not
require an LLM call on first visit, matching, reading or posting, and do not send
browsing text to a provider by default. Automatically publish only under a tested
versioned policy; owner controls can review/rename/merge/split/disable afterwards,
without making every new story wait for manual approval.

Do not interpret frozen HDBSCAN prediction as discovery: [its documented prediction
API](https://hdbscan.readthedocs.io/en/latest/api.html#hdbscan.prediction.approximate_predict)
uses existing clusters. [BERTopic online/merge approaches](https://maartengr.github.io/BERTopic/getting_started/online/online.html)
offer other discovery candidates. Compare them only when they address observed
errors; the earlier rejected84-text study remains rejected and consumed.

## Discussions, UI and privacy

Existing canonical topic/discussion/root IDs and author destinations remain.
New roots retain the concrete named-topic label/identity/evidence revision seen
at posting, subject to the existing erasure rules for Source-derived metadata.
An immutable membership is not permission to preserve a forgotten page's title;
erase that derived text while keeping the canonical human contribution/route.
Broad browsing scope is distinct from that concrete comment context.
Parent/event/alias feeds hydrate canonical rows and deduplicate by root ID; replies
and AI replies still target their original discussion and exact witnessed target.
Renaming, merging, splitting or moving Source assignments does not rewrite posts
or silently reinterpret the author's original destination.

Show a readable concrete topic title plus optional ancestry. A page-only fallback
must say that it describes the current page, rather than claiming a shared topic.
Show the selected concrete context before the person posts. An eligible first
page can supply a provisional readable title immediately; discovering a useful
new story must not require another site to be visited first. Later automatic
shared-topic confirmation improves discovery without silently changing the
original comment's meaning. Distinguish enduring subjects such as AI from
specific events such as the2024 Physics Nobel announcement in the displayed
context, even when both are available as ancestor browsing scopes.
Keep global Search Topics independent of the foreground page; add indexed server
search/pagination instead of exporting every future topic for local filtering.
Keep provisional/page-only records out of global shared-topic discovery. Prioritize
topics containing real human discussion; crawler volume alone must not turn a
million empty candidates into a useful-looking discussion directory. More unique
news events can legitimately create more topics; do not force unrelated events
together merely to reduce the topics/pages ratio.
Owner breadth remains owner-wide/per-topic, with no personal override. An admin
login is still a separate future management surface, not an automatic grant to
the first account. Do not restore related-page suggestions in Discussion.

Only existing opt-in eligible Sources participate. Distinguish crawler volume,
human visits, independent publishers and human discussion participation. None is
an interchangeable confidence vote. No new private-page capture or default raw
page-text retention is implied. Forget/erasure invalidates dependent prototypes,
candidate indexes and public projections; a stale cache cannot revive content.

## Delivery checks

1. Freeze separate development/calibration and prospective whole-event/site/time
   tests. Report original failed captures, coverage, false merges/splits and titles;
   never turn a tiny successful cohort into population98%/1% acceptance.
2. Complete publication/context metadata provenance and compare bounded candidate
   methods. Persist stable registry IDs and evaluate exact versus indexed recall.
3. Validate actual PostgreSQL roles, races, current-input fences, old destinations,
   deletion and replay in an isolated owned fixture. Preserve original resource
   floors; no full restore below its11GiB disk admission floor.
4. Validate real source/browser ingestion, genuinely visible named topics, human
   and AI replies, cold/warm latency, automatic dashboard refresh and concurrent
   crawler/user work. Preserve drafts while classification/discovery is pending.
5. Prepare fresh consistent encrypted recovery and reviewed explicit source/profile
   activation. Keep crawler6384 during development; any necessary compatible
   replacement at actual cutover drains the exact process, preserves progress and
   starts one successor. Do not reset or discard its queue.

The overall goal remains active. The working static hierarchy is preserved while
this additional owner-required automatic growth mechanism is implemented.
